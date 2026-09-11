"use strict";

const {
  normalizePlatform,
  normalizeMode,
  modesForPlatform,
  supportsPgyerUpload,
  artifactFileName,
} = require("./pack-target");

/** Fixed pack order for composite Runs. */
const PLATFORM_ORDER = ["android", "ios", "harmony"];

/**
 * Normalize a list of { platform, mode } targets, dedupe by platform
 * (last wins), sort by PLATFORM_ORDER.
 * @param {Array<{ platform?: string, mode?: string }>} raw
 */
function normalizeTargets(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Select at least one platform Target.");
  }
  const byPlatform = new Map();
  for (const item of raw) {
    const platform = normalizePlatform(item?.platform);
    const mode = normalizeMode(item?.mode, platform);
    byPlatform.set(platform, { platform, mode });
  }
  return PLATFORM_ORDER.filter((p) => byPlatform.has(p)).map((p) =>
    byPlatform.get(p)
  );
}

function targetLabel(target) {
  return `${target.platform}/${target.mode}`;
}

function targetsSummary(targets) {
  return targets.map(targetLabel).join(", ");
}

module.exports = {
  PLATFORM_ORDER,
  normalizeTargets,
  targetLabel,
  targetsSummary,
  modesForPlatform,
  supportsPgyerUpload,
  artifactFileName,
};
