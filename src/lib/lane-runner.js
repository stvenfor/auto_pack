"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const {
  normalizePlatform,
  normalizeMode,
} = require("./pack-target");
const {
  resolveFvmFlutterRoot,
  sanitizeBuildEnv,
  syncAndroidLocalProperties,
} = require("./build-env");
const { readAppRoot } = require("./env");
const { targetUploadResultPath } = require("./upload-result");
const { resolveDartDefines } = require("./dart-defines");

const UPLOAD_RESULT_LANES = new Set([
  "upload_pgyer",
  "distribute",
  "distribute_debug",
]);

/**
 * Spawn a Fastlane lane under packRoot with PACK_PLATFORM / PACK_MODE.
 * Always uses `fastlane android <lane>` (ENV-driven lanes).
 */
function startLane({
  packRoot,
  lane,
  platform = "android",
  mode = "debug",
  updateDescription = "",
  product = false,
  dartDefines = [],
  skipPubGet = false,
  onStdout,
  onStderr,
  onClose,
}) {
  const packPlatform = normalizePlatform(platform);
  const packMode = normalizeMode(mode, packPlatform);

  let resolved;
  try {
    resolved = resolveDartDefines({
      product: Boolean(product),
      defines: Array.isArray(dartDefines) ? dartDefines : [],
    });
  } catch (err) {
    const message = String(err.message || err);
    onStderr?.(`[auto_pack] ${message}\n`);
    queueMicrotask(() => onClose?.({ code: 1, signal: null }));
    return {
      pid: null,
      cancel() {},
    };
  }

  let appRoot =
    (process.env.APP_ROOT || "").trim() ||
    readAppRoot(path.join(packRoot, ".env")) ||
    "";
  if (appRoot) {
    appRoot = path.resolve(appRoot);
  }

  const flutterRoot = appRoot ? resolveFvmFlutterRoot(appRoot) : null;
  const env = sanitizeBuildEnv(process.env, { appRoot, flutterRoot });
  env.PACK_PLATFORM = packPlatform;
  env.PACK_MODE = packMode;
  env.PACK_PRODUCT = resolved.product ? "1" : "0";
  if (resolved.envValue) {
    env.PACK_DART_DEFINES = resolved.envValue;
  } else {
    delete env.PACK_DART_DEFINES;
  }
  if (skipPubGet) {
    env.PACK_SKIP_PUB_GET = "1";
  }

  const note = String(updateDescription || "").trim();
  if (note) {
    env.PGYER_UPDATE_DESCRIPTION = note;
  }

  // Console owns last-upload.json aggregation; Fastlane writes per-Target files only.
  if (UPLOAD_RESULT_LANES.has(lane)) {
    env.PACK_UPLOAD_RESULT_PATH = targetUploadResultPath(
      packRoot,
      packPlatform,
      packMode
    );
    env.PACK_SKIP_SHARED_UPLOAD_RESULT = "1";
  }

  // Align Gradle's flutter.sdk before Android builds so release AOT uses the
  // same FVM SDK Auto Pack invokes (avoids stale/broken FLUTTER_HOME paths).
  if (packPlatform === "android" && appRoot && flutterRoot) {
    try {
      syncAndroidLocalProperties(appRoot, flutterRoot);
    } catch (err) {
      onStderr?.(
        `[auto_pack] warn: could not sync android/local.properties: ${err.message || err}\n`
      );
    }
  }

  const child = spawn("fastlane", ["android", lane], {
    cwd: packRoot,
    env,
    shell: false,
  });

  child.stdout.on("data", (buf) => onStdout(buf.toString("utf8")));
  child.stderr.on("data", (buf) => onStderr(buf.toString("utf8")));
  child.on("close", (code, signal) => onClose({ code, signal }));

  return {
    pid: child.pid,
    cancel() {
      if (!child.killed) child.kill("SIGTERM");
    },
  };
}

module.exports = { startLane };
