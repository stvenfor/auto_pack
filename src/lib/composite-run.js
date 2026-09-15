"use strict";

const { startLane: defaultStartLane } = require("./lane-runner");
const { supportsPgyerUpload } = require("./pack-target");
const { targetLabel } = require("./targets");
const {
  readTargetUploadResult,
  writeLastUpload,
  readMergedInstallUrl,
} = require("./upload-result");

const BUILD_LANES = new Set([
  "build",
  "distribute",
  "build_debug",
  "distribute_debug",
]);
const DISTRIBUTE_LANES = new Set(["distribute", "distribute_debug"]);

/**
 * Execute targets for a composite Console Run.
 *
 * Multi-Target build / distribute:
 *   shared prep_deps → android/ios parallel + harmony serial (PACK_SKIP_PUB_GET)
 *   → parallel upload_pgyer for Targets that built successfully
 *   (per-Target result files; Node aggregates last-upload.json after all settle).
 * Peer build failures no longer cancel siblings.
 * Multi-Target upload_pgyer: parallel uploads only.
 * Single-Target: one Fastlane lane (sequential).
 *
 * @returns {{ cancel: () => void, done: Promise<object> }}
 */
function startCompositeRun({
  packRoot,
  lane,
  targets,
  updateDescription = "",
  product = false,
  dartDefines = [],
  onLog,
  onTargetStart,
  startLaneFn = defaultStartLane,
}) {
  let cancelled = false;
  /** @type {Set<{ cancel: () => void }>} */
  const active = new Set();
  const uploads = [];
  const note = String(updateDescription || "").trim();
  const packProduct = Boolean(product);
  const packDefines = Array.isArray(dartDefines) ? dartDefines : [];

  if (packProduct) {
    onLog?.(
      "\n[auto_pack] 上架包 PRODUCT：注入 --dart-define=TF_NET_PRODUCT=true（隐藏测试球并锁正式环境）\n"
    );
  }

  function track(handle) {
    if (!handle) return handle;
    active.add(handle);
    return handle;
  }

  function untrack(handle) {
    if (handle) active.delete(handle);
  }

  function runLane(opts) {
    return new Promise((resolve) => {
      let handle = null;
      handle = track(
        startLaneFn({
          ...opts,
          onClose: ({ code, signal }) => {
            untrack(handle);
            resolve({ code, signal });
          },
        })
      );
    });
  }

  function collectUpload(target) {
    const saved = readTargetUploadResult(
      packRoot,
      target.platform,
      target.mode
    );
    if (saved && (saved.buildQRCodeURL || saved.installUrl)) {
      uploads.push({
        platform: target.platform,
        mode: target.mode,
        buildName: saved.buildName || "",
        buildVersion: saved.buildVersion || "",
        buildVersionNo: saved.buildVersionNo || "",
        installUrl: saved.installUrl || "",
        buildQRCodeURL: saved.buildQRCodeURL || "",
      });
    }
  }

  function finalizeUploads() {
    if (!uploads.length) return;
    const mergedInstallUrl = readMergedInstallUrl(packRoot);
    writeLastUpload(packRoot, {
      uploads,
      updateDescription: note,
      mergedInstallUrl,
      product: packProduct,
    });
  }

  /**
   * @param {object} target
   * @param {string} effectiveLane
   * @param {{ skipPubGet?: boolean }} [opts]
   */
  async function runOneTarget(target, effectiveLane, opts = {}) {
    const label = targetLabel(target);
    onTargetStart?.(target, effectiveLane);
    onLog?.(`\n===== [${label}] ${effectiveLane} =====\n`);

    const result = await runLane({
      packRoot,
      lane: effectiveLane,
      platform: target.platform,
      mode: target.mode,
      updateDescription: note,
      product: packProduct,
      dartDefines: packDefines,
      skipPubGet: Boolean(opts.skipPubGet),
      onStdout: (chunk) => onLog?.(prefixChunk(label, chunk)),
      onStderr: (chunk) => onLog?.(prefixChunk(label, chunk)),
    });

    if (cancelled) {
      return { ...result, target, label, cancelled: true };
    }

    if (result.code !== 0) {
      onLog?.(
        `\n[${label}] failed with exit ${result.code}${result.signal ? ` signal ${result.signal}` : ""}\n`
      );
    }

    return { ...result, target, label, cancelled: false };
  }

  async function runPrepDeps() {
    onLog?.(`\n===== [shared] prep_deps =====\n`);
    const result = await runLane({
      packRoot,
      lane: "prep_deps",
      platform: targets[0]?.platform || "android",
      mode: targets[0]?.mode || "debug",
      onStdout: (chunk) => onLog?.(prefixChunk("shared", chunk)),
      onStderr: (chunk) => onLog?.(prefixChunk("shared", chunk)),
    });
    if (cancelled) {
      return { code: result.code, signal: result.signal, cancelled: true };
    }
    if (result.code !== 0) {
      onLog?.(
        `\n[shared] prep_deps failed with exit ${result.code}${result.signal ? ` signal ${result.signal}` : ""}\n`
      );
    }
    return { ...result, cancelled: false };
  }

/**
 * Parallel builds for one group. Peer failures do NOT cancel siblings —
 * App Root builds often race (ohpm / Flutter lock); killing survivors wastes
 * almost-finished Android/iOS work. User cancel still aborts all.
 *
 * @param {Array<{ platform: string, mode: string }>} buildTargets
 * @param {{ skipPubGet: boolean }} opts
 * @returns {Promise<{
 *   code: number|null,
 *   signal: string|null,
 *   cancelled: boolean,
 *   succeeded: Array<object>,
 *   failed: Array<object>,
 *   failedTarget: object|null,
 * }>}
 */
async function runBuildsParallel(buildTargets, opts) {
  if (!buildTargets.length) {
    return {
      code: 0,
      signal: null,
      cancelled: false,
      succeeded: [],
      failed: [],
      failedTarget: null,
    };
  }

  onLog?.(
    `\n[parallel] building ${buildTargets.length} Target(s) concurrently (${buildTargets.map(targetLabel).join(", ")})\n`
  );

  const results = await Promise.all(
    buildTargets.map((target) => runOneTarget(target, "build", opts))
  );

  if (cancelled) {
    const failed = results.filter((r) => r.cancelled || r.code !== 0);
    return {
      code: failed[0]?.code ?? 1,
      signal: failed[0]?.signal ?? null,
      cancelled: true,
      succeeded: results.filter((r) => !r.cancelled && r.code === 0).map((r) => r.target),
      failed: failed.map((r) => r.target),
      failedTarget: failed[0]?.target ?? null,
    };
  }

  const succeeded = [];
  const failed = [];
  /** @type {object | null} */
  let firstFailure = null;
  for (const result of results) {
    if (result.code === 0) {
      succeeded.push(result.target);
    } else {
      failed.push(result.target);
      if (!firstFailure) firstFailure = result;
      maybeLogHarmonyHint(result);
    }
  }

  if (failed.length && succeeded.length) {
    onLog?.(
      `\n[parallel] build partial success: ok=[${succeeded.map(targetLabel).join(", ")}] failed=[${failed.map(targetLabel).join(", ")}]\n`
    );
  } else if (failed.length) {
    onLog?.(
      `\n[parallel] all builds failed: [${failed.map(targetLabel).join(", ")}]\n`
    );
  }

  return {
    code: firstFailure ? firstFailure.code : 0,
    signal: firstFailure ? firstFailure.signal : null,
    cancelled: false,
    succeeded,
    failed,
    failedTarget: firstFailure?.target ?? null,
  };
}

function maybeLogHarmonyHint(result) {
  if (result?.target?.platform !== "harmony") return;
  onLog?.(
    `\n[auto_pack] Harmony 构建失败常见原因：ohpm 缺本地 flutter.har（plugin_links/*/libs|har）或依赖损坏。` +
      `构建前会自动补齐 flutter.har 并 ohpm install；若仍失败，在 App Root/ohos 执行 ohpm clean 后再打一次。\n`
  );
}

/**
 * Build Targets with App Root isolation:
 *   1) android + ios in parallel
 *   2) harmony alone afterward (ohpm/hvigor races hard against Gradle/Xcode)
 */
async function runBuildsScheduled(buildTargets, opts) {
  const mobile = buildTargets.filter((t) => t.platform !== "harmony");
  const harmony = buildTargets.filter((t) => t.platform === "harmony");

  /** @type {Array<object>} */
  const succeeded = [];
  /** @type {Array<object>} */
  const failed = [];
  /** @type {object | null} */
  let firstFailure = null;

  if (mobile.length) {
    const phase = await runBuildsParallel(mobile, opts);
    succeeded.push(...phase.succeeded);
    failed.push(...phase.failed);
    if (phase.failedTarget && !firstFailure) {
      firstFailure = {
        code: phase.code,
        signal: phase.signal,
        target: phase.failedTarget,
      };
    }
    if (phase.cancelled || cancelled) {
      return {
        code: phase.code,
        signal: phase.signal,
        cancelled: true,
        succeeded,
        failed,
        failedTarget: phase.failedTarget,
      };
    }
  }

  for (const target of harmony) {
    if (cancelled) {
      return {
        code: firstFailure?.code ?? 1,
        signal: firstFailure?.signal ?? null,
        cancelled: true,
        succeeded,
        failed,
        failedTarget: firstFailure?.target ?? null,
      };
    }
    onLog?.(
      `\n[serial] building Harmony alone (avoid ohpm/hvigor racing Android/iOS)\n`
    );
    const result = await runOneTarget(target, "build", opts);
    if (cancelled) {
      return {
        code: result.code,
        signal: result.signal,
        cancelled: true,
        succeeded,
        failed: [...failed, target],
        failedTarget: target,
      };
    }
    if (result.code === 0) {
      succeeded.push(target);
    } else {
      failed.push(target);
      maybeLogHarmonyHint(result);
      if (!firstFailure) {
        firstFailure = {
          code: result.code,
          signal: result.signal,
          target,
        };
      }
    }
  }

  if (failed.length && succeeded.length) {
    onLog?.(
      `\n[auto_pack] build finished with partial success: ok=[${succeeded.map(targetLabel).join(", ")}] failed=[${failed.map(targetLabel).join(", ")}]\n`
    );
  }

  return {
    code: firstFailure ? firstFailure.code : 0,
    signal: firstFailure ? firstFailure.signal : null,
    cancelled: false,
    succeeded,
    failed,
    failedTarget: firstFailure?.target ?? null,
  };
}

  /**
   * Parallel uploads; wait for all. Collect successes even if some fail.
   * @param {Array<{ platform: string, mode: string }>} uploadTargets
   */
  async function runUploadsParallel(uploadTargets) {
    onLog?.(
      `\n[parallel] uploading ${uploadTargets.length} Target(s) to Pgyer\n`
    );

    const results = await Promise.all(
      uploadTargets.map((target) => runOneTarget(target, "upload_pgyer"))
    );

    if (cancelled) {
      for (const result of results) {
        if (result.code === 0 && !result.cancelled) {
          collectUpload(result.target);
        }
      }
      finalizeUploads();
      return {
        code: 1,
        signal: null,
        cancelled: true,
        failedTarget: results.find((r) => r.cancelled || r.code !== 0)?.target,
      };
    }

    /** @type {object | null} */
    let firstFailure = null;
    for (const result of results) {
      if (result.code === 0) {
        collectUpload(result.target);
      } else if (!firstFailure) {
        firstFailure = result;
      }
    }

    finalizeUploads();

    if (firstFailure) {
      onLog?.(
        `\n[parallel] upload finished with failures (${uploads.length} succeeded)\n`
      );
      return {
        code: firstFailure.code ?? 1,
        signal: firstFailure.signal,
        cancelled: false,
        failedTarget: firstFailure.target,
      };
    }

    return { code: 0, signal: null, cancelled: false };
  }

  /** Single-Target path (one Fastlane lane). */
  async function runSequential() {
    let lastCode = 0;
    let lastSignal = null;

    for (const target of targets) {
      if (cancelled) {
        return {
          code: lastCode,
          signal: lastSignal,
          cancelled: true,
          uploads,
        };
      }

      const label = targetLabel(target);
      const canUpload = supportsPgyerUpload(target.platform, target.mode);
      let effectiveLane = lane;

      if (lane === "upload_pgyer" && !canUpload) {
        onLog?.(
          `\n[${label}] skip upload — this Target cannot upload to Pgyer (e.g. Harmony release .app)\n`
        );
        continue;
      }

      if (DISTRIBUTE_LANES.has(lane) && !canUpload) {
        onLog?.(
          `\n[${label}] build only — skip Pgyer upload for this Target\n`
        );
        effectiveLane = "build";
      }

      const result = await runOneTarget(target, effectiveLane);
      lastCode = result.code;
      lastSignal = result.signal;

      if (cancelled) {
        return { code: lastCode, signal: lastSignal, cancelled: true, uploads };
      }
      if (result.code !== 0) {
        return {
          code: result.code,
          signal: result.signal,
          cancelled: false,
          uploads,
          failedTarget: target,
        };
      }

      const uploaded =
        effectiveLane === "upload_pgyer" ||
        DISTRIBUTE_LANES.has(effectiveLane);
      if (uploaded) {
        collectUpload(target);
      }
    }

    finalizeUploads();
    return { code: 0, signal: null, cancelled: false, uploads };
  }

  function logSkippedUploads(uploadTargets) {
    const skipped = targets.filter(
      (t) => !supportsPgyerUpload(t.platform, t.mode)
    );
    for (const target of skipped) {
      onLog?.(
        `\n[${targetLabel(target)}] build only — skip Pgyer upload for this Target\n`
      );
    }
    return uploadTargets;
  }

  const done = (async () => {
    if (targets.length <= 1) {
      return runSequential();
    }

    // Multi-Target upload-only: parallel uploads
    if (lane === "upload_pgyer") {
      const uploadTargets = targets.filter((t) =>
        supportsPgyerUpload(t.platform, t.mode)
      );
      for (const target of targets) {
        if (!supportsPgyerUpload(target.platform, target.mode)) {
          onLog?.(
            `\n[${targetLabel(target)}] skip upload — this Target cannot upload to Pgyer (e.g. Harmony release .app)\n`
          );
        }
      }
      if (!uploadTargets.length) {
        return { code: 0, signal: null, cancelled: false, uploads };
      }
      const uploadPhase = await runUploadsParallel(uploadTargets);
      return { ...uploadPhase, uploads };
    }

    if (!BUILD_LANES.has(lane)) {
      return runSequential();
    }

    // Multi-Target: shared prep → scheduled builds → optional parallel uploads
    const prep = await runPrepDeps();
    if (prep.cancelled) {
      return { code: prep.code, signal: prep.signal, cancelled: true, uploads };
    }
    if (prep.code !== 0) {
      return {
        code: prep.code,
        signal: prep.signal,
        cancelled: false,
        uploads,
        failedTarget: null,
      };
    }

    const buildPhase = await runBuildsScheduled(targets, { skipPubGet: true });
    if (buildPhase.cancelled) {
      return {
        code: buildPhase.code,
        signal: buildPhase.signal,
        cancelled: true,
        uploads,
        failedTarget: buildPhase.failedTarget,
      };
    }

    const builtOk = buildPhase.succeeded || [];
    if (!builtOk.length) {
      return {
        code: buildPhase.code || 1,
        signal: buildPhase.signal,
        cancelled: false,
        uploads,
        failedTarget: buildPhase.failedTarget,
      };
    }

    // Build-only lane: partial success still counts as overall failure if any failed,
    // but artifacts for successes are already in place.
    if (!DISTRIBUTE_LANES.has(lane)) {
      return {
        code: buildPhase.failed?.length ? buildPhase.code || 1 : 0,
        signal: buildPhase.failed?.length ? buildPhase.signal : null,
        cancelled: false,
        uploads,
        failedTarget: buildPhase.failedTarget,
        builtTargets: builtOk,
      };
    }

    const uploadTargets = logSkippedUploads(
      builtOk.filter((t) => supportsPgyerUpload(t.platform, t.mode))
    );
    if (buildPhase.failed?.length) {
      onLog?.(
        `\n[auto_pack] skip upload for failed builds: [${buildPhase.failed.map(targetLabel).join(", ")}]\n`
      );
    }
    if (!uploadTargets.length) {
      return {
        code: buildPhase.failed?.length ? buildPhase.code || 1 : 0,
        signal: buildPhase.failed?.length ? buildPhase.signal : null,
        cancelled: false,
        uploads,
        failedTarget: buildPhase.failedTarget,
        builtTargets: builtOk,
      };
    }

    const uploadPhase = await runUploadsParallel(uploadTargets);
    // Prefer upload failure code; else surface build partial-failure code.
    const code =
      uploadPhase.code !== 0
        ? uploadPhase.code
        : buildPhase.failed?.length
          ? buildPhase.code || 1
          : 0;
    return {
      ...uploadPhase,
      code,
      uploads,
      failedTarget: uploadPhase.failedTarget || buildPhase.failedTarget,
      builtTargets: builtOk,
    };
  })();

  return {
    cancel() {
      cancelled = true;
      for (const handle of [...active]) {
        handle.cancel();
      }
    },
    done,
  };
}

function prefixChunk(label, chunk) {
  const text = String(chunk);
  if (!text) return text;
  return text
    .split(/(?<=\n)/)
    .map((line) => {
      if (!line || line === "\n") return line;
      if (line.endsWith("\n")) {
        return `[${label}] ${line.slice(0, -1)}\n`;
      }
      return `[${label}] ${line}`;
    })
    .join("");
}

module.exports = { startCompositeRun, prefixChunk };
