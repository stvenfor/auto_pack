"use strict";

const { startLane } = require("./lane-runner");
const { supportsPgyerUpload } = require("./pack-target");
const { targetLabel } = require("./targets");
const {
  readLastUpload,
  writeLastUpload,
  readMergedInstallUrl,
} = require("./upload-result");

/**
 * Run Fastlane for one Target; resolves with { code, signal }.
 */
function runLaneOnce(opts) {
  return new Promise((resolve) => {
    const handle = startLane({
      ...opts,
      onClose: (result) => resolve({ ...result, handle: null }),
    });
    // Attach cancel to promise consumer via returned object pattern
    resolve.handle = handle;
  }).then((result) => result);
}

/**
 * Sequentially execute targets for a composite Console Run.
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
}) {
  let cancelled = false;
  /** @type {{ cancel: () => void } | null} */
  let current = null;
  const uploads = [];
  const note = String(updateDescription || "").trim();

  const done = (async () => {
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

      if ((lane === "distribute" || lane === "distribute_debug") && !canUpload) {
        onLog?.(
          `\n[${label}] build only — skip Pgyer upload for this Target\n`
        );
        effectiveLane = "build";
      }

      onTargetStart?.(target, effectiveLane);
      onLog?.(`\n===== [${label}] ${effectiveLane} =====\n`);

      const result = await new Promise((resolve) => {
        const handle = startLane({
          packRoot,
          lane: effectiveLane,
          platform: target.platform,
          mode: target.mode,
          updateDescription: note,
          onStdout: (chunk) => onLog?.(prefixChunk(label, chunk)),
          onStderr: (chunk) => onLog?.(prefixChunk(label, chunk)),
          onClose: ({ code, signal }) => resolve({ code, signal }),
        });
        current = handle;
      });
      current = null;

      lastCode = result.code;
      lastSignal = result.signal;

      if (cancelled) {
        return { code: lastCode, signal: lastSignal, cancelled: true, uploads };
      }

      if (result.code !== 0) {
        onLog?.(
          `\n[${label}] failed with exit ${result.code}${result.signal ? ` signal ${result.signal}` : ""}\n`
        );
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
        effectiveLane === "distribute" ||
        effectiveLane === "distribute_debug";
      if (uploaded) {
        const saved = readLastUpload(packRoot);
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
    }

    if (uploads.length) {
      const mergedInstallUrl = readMergedInstallUrl(packRoot);
      writeLastUpload(packRoot, {
        uploads,
        updateDescription: note,
        mergedInstallUrl,
      });
    }

    return {
      code: 0,
      signal: null,
      cancelled: false,
      uploads,
    };
  })();

  return {
    cancel() {
      cancelled = true;
      if (current) current.cancel();
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

module.exports = { startCompositeRun };
