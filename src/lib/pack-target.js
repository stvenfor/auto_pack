"use strict";

const PLATFORMS = new Set(["android", "ios", "harmony"]);
const MODES_COMMON = ["debug", "release"];
const MODES_HARMONY = ["debug", "release", "profile"];
const MODES = new Set([...MODES_HARMONY]);

const EXT_BY_PLATFORM = {
  android: "apk",
  ios: "ipa",
  harmony: "hap",
};

const PGYER_BUILD_TYPE = {
  android: "android",
  ios: "ios",
  harmony: "harmonyos",
};

function normalizePlatform(value) {
  const platform = String(value || "android").trim().toLowerCase();
  if (!PLATFORMS.has(platform)) {
    throw new Error(
      `Invalid PACK_PLATFORM "${value}". Expected android|ios|harmony.`
    );
  }
  return platform;
}

function modesForPlatform(platform) {
  const p = normalizePlatform(platform);
  return p === "harmony" ? [...MODES_HARMONY] : [...MODES_COMMON];
}

function normalizeMode(value, platform = "android") {
  const mode = String(value || "debug").trim().toLowerCase();
  const p = normalizePlatform(platform);
  const allowed = modesForPlatform(p);
  if (!allowed.includes(mode)) {
    throw new Error(
      `Invalid PACK_MODE "${value}" for ${p}. Expected ${allowed.join("|")}.`
    );
  }
  return mode;
}

/** Artifact extension for platform×mode (Harmony release → .app). */
function artifactExt(platform, mode) {
  const p = normalizePlatform(platform);
  const m = normalizeMode(mode, p);
  if (p === "harmony" && m === "release") return "app";
  return EXT_BY_PLATFORM[p];
}

function artifactFileName(platform, mode) {
  const p = normalizePlatform(platform);
  const m = normalizeMode(mode, p);
  return `${p}-${m}.${artifactExt(p, m)}`;
}

function artifactPath(artifactsDir, platform, mode) {
  const path = require("node:path");
  return path.join(artifactsDir, artifactFileName(platform, mode));
}

/**
 * Pgyer accepts Harmony `.hap` only — not `.app` (AppGallery package).
 * Harmony release builds produce `.app`, so upload is disabled for that pair.
 */
function supportsPgyerUpload(platform, mode = "debug") {
  const p = normalizePlatform(platform);
  const m = normalizeMode(mode, p);
  if (p === "harmony" && m === "release") return false;
  return true;
}

function pgyerBuildType(platform) {
  const p = normalizePlatform(platform);
  return PGYER_BUILD_TYPE[p];
}

const IOS_EXPORT_METHODS = new Set([
  "ad-hoc",
  "app-store",
  "development",
  "enterprise",
]);

/**
 * iOS IPA export method for flutter build ipa.
 * Defaults to ad-hoc for both debug and release (Pgyer / device install).
 * Override with envMethod or IOS_EXPORT_OPTIONS_PLIST.
 */
function iosExportMethod(mode, envMethod = "") {
  normalizeMode(mode, "ios");
  const explicit = String(envMethod || "").trim().toLowerCase();
  if (explicit) {
    if (!IOS_EXPORT_METHODS.has(explicit)) {
      throw new Error(
        `Invalid IOS_EXPORT_METHOD "${envMethod}". Expected ${[...IOS_EXPORT_METHODS].join("|")}.`
      );
    }
    return explicit;
  }
  return "ad-hoc";
}

/**
 * Relative source path under App Root after a successful flutter build.
 * iOS IPA basename is unknown ahead of time — Fastfile globs build/ios/ipa.
 */
function flutterOutputHint(platform, mode, envMethod = "") {
  const p = normalizePlatform(platform);
  const m = normalizeMode(mode, p);
  if (p === "android") {
    return `build/app/outputs/flutter-apk/app-${m}.apk`;
  }
  if (p === "ios") {
    return `build/ios/ipa/*.ipa (export-method ${iosExportMethod(m, envMethod)})`;
  }
  if (m === "release") {
    return "build/ohos/app/*.app (or ohos/build/outputs/release/*.app)";
  }
  if (m === "profile") {
    return "build/ohos/hap/entry-profile-signed.hap";
  }
  return "build/ohos/hap/entry-default-signed.hap";
}

module.exports = {
  PLATFORMS,
  MODES,
  MODES_COMMON,
  MODES_HARMONY,
  EXT_BY_PLATFORM,
  IOS_EXPORT_METHODS,
  normalizePlatform,
  normalizeMode,
  modesForPlatform,
  artifactExt,
  artifactFileName,
  artifactPath,
  supportsPgyerUpload,
  pgyerBuildType,
  iosExportMethod,
  flutterOutputHint,
};
