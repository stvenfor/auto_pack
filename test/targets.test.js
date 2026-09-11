"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { normalizeTargets, targetsSummary, PLATFORM_ORDER } = require("../src/lib/targets");

describe("targets", () => {
  it("orders platforms and dedupes by last mode", () => {
    const targets = normalizeTargets([
      { platform: "harmony", mode: "profile" },
      { platform: "android", mode: "debug" },
      { platform: "android", mode: "release" },
      { platform: "ios", mode: "debug" },
    ]);
    assert.deepEqual(
      targets.map((t) => `${t.platform}/${t.mode}`),
      ["android/release", "ios/debug", "harmony/profile"]
    );
    assert.deepEqual(PLATFORM_ORDER, ["android", "ios", "harmony"]);
    assert.equal(targetsSummary(targets), "android/release, ios/debug, harmony/profile");
  });

  it("rejects empty selection", () => {
    assert.throws(() => normalizeTargets([]), /at least one/);
  });
});
