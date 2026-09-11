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
 *   shared prep_deps → parallel build (PACK_SKIP_PUB_GET) → parallel upload_pgyer
 *   (per-Target result files; Node aggregates last-upload.json after all settle).
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
  onLog,
  onTargetStart,
  startLaneFn = defaultStartLane,
}) {
  let cancelled = false;
  /** @type {Set<{ cancel: () => void }>} */
  const active = new Set();
  const uploads = [];
  const note = String(updateDescription || "").trim();

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
   * Parallel builds; on first failure cancel siblings and return that failure.
   * @param {Array<{ platform: string, mode: string }>} buildTargets
   * @param {{ skipPubGet: boolean }} opts
   */
  async function runBuildsParallel(buildTargets, opts) {
    onLog?.(
      `\n[parallel] building ${buildTargets.length} Targets concurrently\n`
    );

    const pending = buildTargets.map((target) =>
      runOneTarget(target, "build", opts).then((result) => ({ result }))
    );

    /** @type {Array<{ result: object }>} */
    const settled = [];
    let firstFailure = null;

    await Promise.all(
      pending.map(async (p) => {
        const item = await p;
        settled.push(item);
        const { result } = item;
        if (!firstFailure && !result.cancelled && result.code !== 0) {
          firstFailure = result;
          for (const handle of [...active]) {
            handle.cancel();
          }
        }
      })
    );

    if (cancelled) {
      return {
        code: firstFailure?.code ?? 1,
        signal: firstFailure?.signal ?? null,
        cancelled: true,
        failedTarget: firstFailure?.target,
      };
    }

    if (firstFailure) {
      return {
        code: firstFailure.code,
        signal: firstFailure.signal,
        cancelled: false,
        failedTarget: firstFailure.target,
      };
    }

    for (const { result } of settled) {
      if (result.code !== 0) {
        return {
          code: result.code,
          signal: result.signal,
          cancelled: false,
          failedTarget: result.target,
        };
      }
    }

    return { code: 0, signal: null, cancelled: false };
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

    // Multi-Target: shared prep → parallel builds → optional parallel uploads
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

    const buildPhase = await runBuildsParallel(targets, { skipPubGet: true });
    if (buildPhase.cancelled) {
      return {
        code: buildPhase.code,
        signal: buildPhase.signal,
        cancelled: true,
        uploads,
        failedTarget: buildPhase.failedTarget,
      };
    }
    if (buildPhase.code !== 0) {
      return {
        code: buildPhase.code,
        signal: buildPhase.signal,
        cancelled: false,
        uploads,
        failedTarget: buildPhase.failedTarget,
      };
    }

    if (!DISTRIBUTE_LANES.has(lane)) {
      return { code: 0, signal: null, cancelled: false, uploads };
    }

    const uploadTargets = logSkippedUploads(
      targets.filter((t) => supportsPgyerUpload(t.platform, t.mode))
    );
    if (!uploadTargets.length) {
      return { code: 0, signal: null, cancelled: false, uploads };
    }

    const uploadPhase = await runUploadsParallel(uploadTargets);
    return { ...uploadPhase, uploads };
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
