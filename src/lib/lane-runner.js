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
  onStdout,
  onStderr,
  onClose,
}) {
  const packPlatform = normalizePlatform(platform);
  const packMode = normalizeMode(mode, packPlatform);

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

  const note = String(updateDescription || "").trim();
  if (note) {
    env.PGYER_UPDATE_DESCRIPTION = note;
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
