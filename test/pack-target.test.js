"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  normalizePlatform,
  normalizeMode,
  modesForPlatform,
  artifactExt,
  artifactFileName,
  artifactPath,
  supportsPgyerUpload,
  pgyerBuildType,
  flutterOutputHint,
  iosExportMethod,
} = require("../src/lib/pack-target");

describe("pack-target", () => {
  it("normalizes platform and mode", () => {
    assert.equal(normalizePlatform("Android"), "android");
    assert.equal(normalizeMode("RELEASE", "android"), "release");
    assert.throws(() => normalizePlatform("web"), /PACK_PLATFORM/);
    assert.throws(() => normalizeMode("profile", "android"), /PACK_MODE/);
  });

  it("allows profile only for harmony", () => {
    assert.deepEqual(modesForPlatform("harmony"), [
      "debug",
      "release",
      "profile",
    ]);
    assert.equal(normalizeMode("profile", "harmony"), "profile");
    assert.throws(() => normalizeMode("profile", "ios"), /ios/);
  });

  it("builds artifact file names and paths", () => {
    assert.equal(artifactFileName("android", "debug"), "android-debug.apk");
    assert.equal(artifactFileName("ios", "release"), "ios-release.ipa");
    assert.equal(artifactFileName("harmony", "debug"), "harmony-debug.hap");
    assert.equal(artifactFileName("harmony", "release"), "harmony-release.app");
    assert.equal(artifactExt("harmony", "release"), "app");
    assert.equal(
      artifactFileName("harmony", "profile"),
      "harmony-profile.hap"
    );
    assert.equal(
      artifactPath("/pack/artifacts", "android", "release"),
      path.join("/pack/artifacts", "android-release.apk")
    );
  });

  it("hints harmony profile and release output paths", () => {
    assert.match(
      flutterOutputHint("harmony", "profile"),
      /entry-profile-signed\.hap/
    );
    assert.match(flutterOutputHint("harmony", "release"), /\.app/);
  });

  it("defaults iOS debug and release export to ad-hoc", () => {
    assert.equal(iosExportMethod("release"), "ad-hoc");
    assert.equal(iosExportMethod("debug"), "ad-hoc");
    assert.equal(iosExportMethod("release", "app-store"), "app-store");
    assert.equal(iosExportMethod("debug", "development"), "development");
    assert.throws(() => iosExportMethod("release", "sideload"), /IOS_EXPORT_METHOD/);
    assert.match(flutterOutputHint("ios", "release"), /ad-hoc/);
    assert.match(flutterOutputHint("ios", "debug"), /ad-hoc/);
  });

  it("gates Pgyer upload: Harmony release (.app) is blocked", () => {
    assert.equal(supportsPgyerUpload("android"), true);
    assert.equal(supportsPgyerUpload("ios"), true);
    assert.equal(supportsPgyerUpload("harmony", "debug"), true);
    assert.equal(supportsPgyerUpload("harmony", "profile"), true);
    assert.equal(supportsPgyerUpload("harmony", "release"), false);
    assert.equal(pgyerBuildType("ios"), "ios");
    assert.equal(pgyerBuildType("harmony"), "harmonyos");
  });
});
