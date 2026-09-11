"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { assessReadiness } = require("../src/lib/readiness");

function baseProbes(overrides = {}) {
  return {
    appRoot: "/apps/demo",
    appRootExists: true,
    appRootIsGit: true,
    platformDirs: { android: true, ios: true, harmony: true },
    flutterBin: "/apps/demo/.fvm/flutter_sdk/bin/flutter",
    flutterExecutable: true,
    artifactsDir: "/pack/artifacts",
    artifactsWritable: true,
    fastlaneOk: true,
    pgyerApiKeyConfigured: true,
    ...overrides,
  };
}

describe("readiness", () => {
  it("reports full readiness when all probes pass and key is set", () => {
    const result = assessReadiness(baseProbes(), { platform: "android" });

    assert.equal(result.ok, true);
    assert.equal(result.canBuild, true);
    assert.equal(result.canUpload, true);
    assert.equal(result.checks.appRoot, true);
    assert.equal(result.checks.platformDir, true);
  });

  it("allows build but not upload when Pgyer key is missing", () => {
    const result = assessReadiness(baseProbes({ pgyerApiKeyConfigured: false }));

    assert.equal(result.ok, true);
    assert.equal(result.canBuild, true);
    assert.equal(result.canUpload, false);
    assert.equal(result.checks.pgyerApiKey, false);
  });

  it("blocks build when Flutter is missing but still allows upload", () => {
    const result = assessReadiness(baseProbes({ flutterExecutable: false }), {
      platform: "android",
    });

    assert.equal(result.ok, false);
    assert.equal(result.canBuild, false);
    assert.equal(result.canUpload, true);
    assert.equal(result.checks.flutter, false);
  });

  it("allows upload for harmony debug/profile when key is configured", () => {
    const debug = assessReadiness(baseProbes(), {
      platform: "harmony",
      mode: "debug",
    });
    assert.equal(debug.canBuild, true);
    assert.equal(debug.canUpload, true);

    const profile = assessReadiness(baseProbes(), {
      platform: "harmony",
      mode: "profile",
    });
    assert.equal(profile.canUpload, true);
  });

  it("blocks Pgyer upload for harmony release (.app)", () => {
    const result = assessReadiness(baseProbes(), {
      platform: "harmony",
      mode: "release",
    });
    assert.equal(result.canBuild, true);
    assert.equal(result.canUpload, false);
    assert.equal(result.canDistribute, true);
  });

  it("blocks build when the platform directory is missing", () => {
    const result = assessReadiness(
      baseProbes({ platformDirs: { android: true, ios: false, harmony: true } }),
      { platform: "ios" }
    );
    assert.equal(result.canBuild, false);
    assert.equal(result.checks.platformDir, false);
  });

  it("multi-select: canBuild if any target builds; distribute skips non-uploadable", () => {
    const result = assessReadiness(baseProbes(), {
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "harmony", mode: "release" },
      ],
    });
    assert.equal(result.canBuild, true);
    assert.equal(result.canUpload, true);
    assert.equal(result.canDistribute, true);
    assert.equal(result.targets.length, 2);
    assert.equal(result.targets[1].canUpload, false);
  });
});
