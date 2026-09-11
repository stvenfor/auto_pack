"use strict";

const { supportsPgyerUpload } = require("./pack-target");
const { normalizeTargets } = require("./targets");

/**
 * Assess Console Readiness from already-gathered probe facts.
 *
 * @param {object} probes
 * @param {{ platform?: string, mode?: string, targets?: Array<{platform:string,mode:string}> }} [opts]
 */
function assessReadiness(probes, opts = {}) {
  let targets;
  try {
    if (Array.isArray(opts.targets) && opts.targets.length) {
      targets = normalizeTargets(opts.targets);
    } else {
      targets = normalizeTargets([
        {
          platform: opts.platform || "android",
          mode: opts.mode || "debug",
        },
      ]);
    }
  } catch {
    targets = [];
  }

  const platformDirs = probes.platformDirs || {};
  const baseChecks = {
    appRoot: Boolean(probes.appRootExists),
    flutter: Boolean(probes.flutterExecutable),
    artifacts: Boolean(probes.artifactsWritable),
    fastlane: Boolean(probes.fastlaneOk),
    pgyerApiKey: Boolean(probes.pgyerApiKeyConfigured),
    git: probes.appRootIsGit === undefined ? true : Boolean(probes.appRootIsGit),
  };

  const perTarget = targets.map((t) => {
    const platformDirOk =
      platformDirs[t.platform] === undefined
        ? true
        : Boolean(platformDirs[t.platform]);
    const canBuildBase =
      baseChecks.appRoot &&
      baseChecks.flutter &&
      baseChecks.artifacts &&
      baseChecks.fastlane &&
      platformDirOk;
    const canUploadBase =
      baseChecks.artifacts &&
      baseChecks.fastlane &&
      baseChecks.pgyerApiKey &&
      supportsPgyerUpload(t.platform, t.mode);
    return {
      ...t,
      platformDir: platformDirOk,
      canBuild: canBuildBase,
      canUpload: canUploadBase,
    };
  });

  const anySelected = perTarget.length > 0;
  const canBuild = anySelected && perTarget.some((t) => t.canBuild);
  const canUpload = anySelected && perTarget.some((t) => t.canUpload);
  // Distribute: need at least one buildable target; uploadable ones will upload,
  // non-uploadable (e.g. harmony release) build-only — so require canBuild and
  // (canUpload OR every selected target is intentionally upload-skippable while buildable).
  const allBuildable = anySelected && perTarget.every((t) => t.canBuild);
  const canDistribute =
    allBuildable &&
    (canUpload || perTarget.every((t) => !supportsPgyerUpload(t.platform, t.mode)));

  const first = perTarget[0] || {
    platform: "android",
    mode: "debug",
    platformDir: true,
  };

  const checks = {
    ...baseChecks,
    platformDir: perTarget.every((t) => t.platformDir),
  };

  return {
    ok: canBuild,
    canBuild,
    canUpload,
    canDistribute,
    checks,
    platform: first.platform,
    mode: first.mode,
    targets: perTarget,
  };
}

module.exports = { assessReadiness };
