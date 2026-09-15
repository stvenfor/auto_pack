"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { startCompositeRun } = require("../src/lib/composite-run");

function fakeLane({ results, log }) {
  /** @type {Array<object>} */
  const calls = [];
  let seq = 0;

  function startLaneFn(opts) {
    const id = ++seq;
    const call = {
      id,
      lane: opts.lane,
      platform: opts.platform,
      mode: opts.mode,
      skipPubGet: Boolean(opts.skipPubGet),
    };
    calls.push(call);
    log?.(`start ${opts.lane} ${opts.platform}/${opts.mode}`);

    let killed = false;
    const handle = {
      cancel() {
        killed = true;
      },
    };

    const key = `${opts.lane}:${opts.platform}/${opts.mode}`;
    const prepKey = opts.lane === "prep_deps" ? "prep_deps" : key;
    const spec = results[prepKey] ?? results[opts.lane] ?? { code: 0 };

    const delay = spec.delay ?? 5;
    setTimeout(() => {
      if (killed) {
        opts.onClose({ code: null, signal: "SIGTERM" });
        return;
      }
      if (spec.stdout) opts.onStdout?.(spec.stdout);
      opts.onClose({ code: spec.code ?? 0, signal: spec.signal ?? null });
    }, delay);

    return handle;
  }

  return { startLaneFn, calls };
}

describe("startCompositeRun parallel builds", () => {
  it("runs prep_deps once then parallel builds with skipPubGet for multi-target build", async () => {
    const { startLaneFn, calls } = fakeLane({
      results: {
        prep_deps: { code: 0, delay: 5 },
        "build:android/debug": { code: 0, delay: 30 },
        "build:ios/debug": { code: 0, delay: 30 },
      },
    });

    const startedAt = Date.now();
    const batch = startCompositeRun({
      packRoot: "/tmp/auto_pack_test",
      lane: "build",
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "ios", mode: "debug" },
      ],
      startLaneFn,
      onLog: () => {},
    });

    const result = await batch.done;
    const elapsed = Date.now() - startedAt;

    assert.equal(result.code, 0);
    assert.equal(result.cancelled, false);

    const lanes = calls.map((c) => c.lane);
    assert.deepEqual(lanes[0], "prep_deps");
    assert.equal(calls.filter((c) => c.lane === "prep_deps").length, 1);
    assert.equal(calls.filter((c) => c.lane === "build").length, 2);
    assert.ok(calls.every((c) => c.lane !== "build" || c.skipPubGet === true));

    // Parallel: both builds overlap → wall time << 30+30 sequential
    assert.ok(elapsed < 55, `expected parallel overlap, elapsed=${elapsed}ms`);
  });

  it("distribute: parallel builds then parallel uploads", async () => {
    const { startLaneFn, calls } = fakeLane({
      results: {
        prep_deps: { code: 0, delay: 2 },
        "build:android/debug": { code: 0, delay: 20 },
        "build:ios/debug": { code: 0, delay: 20 },
        "upload_pgyer:android/debug": { code: 0, delay: 25 },
        "upload_pgyer:ios/debug": { code: 0, delay: 25 },
      },
    });

    const startedAt = Date.now();
    const batch = startCompositeRun({
      packRoot: "/tmp/auto_pack_missing_artifacts",
      lane: "distribute",
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "ios", mode: "debug" },
      ],
      startLaneFn,
      onLog: () => {},
    });

    const result = await batch.done;
    const elapsed = Date.now() - startedAt;
    assert.equal(result.code, 0);

    assert.equal(calls[0].lane, "prep_deps");
    const builds = calls.filter((c) => c.lane === "build");
    const uploads = calls.filter((c) => c.lane === "upload_pgyer");
    assert.equal(builds.length, 2);
    assert.equal(uploads.length, 2);
    assert.ok(builds.every((c) => c.skipPubGet));

    // prep(~2) + build(~20) + upload(~25) with overlap ≪ sequential uploads
    assert.ok(
      elapsed < 90,
      `expected parallel uploads overlap, elapsed=${elapsed}ms`
    );
  });

  it("upload_pgyer multi-target runs in parallel", async () => {
    const { startLaneFn, calls } = fakeLane({
      results: {
        "upload_pgyer:android/debug": { code: 0, delay: 30 },
        "upload_pgyer:ios/debug": { code: 0, delay: 30 },
      },
    });

    const startedAt = Date.now();
    const batch = startCompositeRun({
      packRoot: "/tmp/auto_pack_missing_artifacts",
      lane: "upload_pgyer",
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "ios", mode: "debug" },
      ],
      startLaneFn,
      onLog: () => {},
    });

    const result = await batch.done;
    assert.equal(result.code, 0);
    assert.equal(calls.filter((c) => c.lane === "upload_pgyer").length, 2);
    assert.equal(calls.filter((c) => c.lane === "prep_deps").length, 0);
    assert.ok(Date.now() - startedAt < 55);
  });

  it("parallel upload keeps successes when one target fails", async () => {
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto_pack_up-"));
    fs.mkdirSync(path.join(root, "artifacts"));
    fs.writeFileSync(
      path.join(root, "artifacts", "last-upload-android-debug.json"),
      JSON.stringify({
        platform: "android",
        mode: "debug",
        installUrl: "https://www.pgyer.com/a",
        buildQRCodeURL: "https://www.pgyer.com/qr/a",
      })
    );

    const { startLaneFn } = fakeLane({
      results: {
        "upload_pgyer:android/debug": { code: 0, delay: 10 },
        "upload_pgyer:ios/debug": { code: 2, delay: 10 },
      },
    });

    const batch = startCompositeRun({
      packRoot: root,
      lane: "upload_pgyer",
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "ios", mode: "debug" },
      ],
      startLaneFn,
      onLog: () => {},
    });

    const result = await batch.done;
    assert.equal(result.code, 2);
    assert.equal(result.uploads.length, 1);
    assert.equal(result.uploads[0].platform, "android");
    assert.ok(
      fs.existsSync(path.join(root, "artifacts", "last-upload.json")),
      "aggregated last-upload.json should exist for successful uploads"
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("single-target build stays sequential (no prep_deps)", async () => {
    const { startLaneFn, calls } = fakeLane({
      results: {
        "build:android/release": { code: 0, delay: 5 },
      },
    });

    const batch = startCompositeRun({
      packRoot: "/tmp/auto_pack_test",
      lane: "build",
      targets: [{ platform: "android", mode: "release" }],
      startLaneFn,
      onLog: () => {},
    });

    const result = await batch.done;
    assert.equal(result.code, 0);
    assert.deepEqual(
      calls.map((c) => c.lane),
      ["build"]
    );
    assert.equal(calls[0].skipPubGet, false);
  });

  it("cancels in-flight parallel builds", async () => {
    const { startLaneFn } = fakeLane({
      results: {
        prep_deps: { code: 0, delay: 2 },
        "build:android/debug": { code: 0, delay: 200 },
        "build:ios/debug": { code: 0, delay: 200 },
      },
    });

    const batch = startCompositeRun({
      packRoot: "/tmp/auto_pack_test",
      lane: "build",
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "ios", mode: "debug" },
      ],
      startLaneFn,
      onLog: () => {},
    });

    await new Promise((r) => setTimeout(r, 20));
    batch.cancel();
    const result = await batch.done;
    assert.equal(result.cancelled, true);
  });

  it("keeps sibling builds when one peer fails (no cancel-on-fail)", async () => {
    const { startLaneFn, calls } = fakeLane({
      results: {
        prep_deps: { code: 0, delay: 2 },
        "build:android/debug": { code: 0, delay: 40 },
        "build:ios/debug": { code: 7, delay: 10 },
      },
    });

    const batch = startCompositeRun({
      packRoot: "/tmp/auto_pack_test",
      lane: "build",
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "ios", mode: "debug" },
      ],
      startLaneFn,
      onLog: () => {},
    });

    const result = await batch.done;
    assert.equal(result.code, 7);
    assert.equal(result.cancelled, false);
    assert.equal(calls.filter((c) => c.lane === "build").length, 2);
    assert.deepEqual(
      (result.builtTargets || []).map((t) => t.platform),
      ["android"]
    );
  });

  it("builds harmony alone after android/ios parallel group", async () => {
    const timeline = [];
    const { startLaneFn } = fakeLane({
      results: {
        prep_deps: { code: 0, delay: 2 },
        "build:android/debug": { code: 0, delay: 30 },
        "build:ios/debug": { code: 0, delay: 30 },
        "build:harmony/profile": { code: 0, delay: 20 },
      },
      log: (msg) => timeline.push({ t: Date.now(), msg }),
    });

    const startedAt = Date.now();
    const batch = startCompositeRun({
      packRoot: "/tmp/auto_pack_test",
      lane: "build",
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "ios", mode: "debug" },
        { platform: "harmony", mode: "profile" },
      ],
      startLaneFn,
      onLog: () => {},
    });

    const result = await batch.done;
    assert.equal(result.code, 0);

    const androidStart = timeline.find((x) =>
      x.msg.includes("build android/debug")
    );
    const iosStart = timeline.find((x) => x.msg.includes("build ios/debug"));
    const harmonyStart = timeline.find((x) =>
      x.msg.includes("build harmony/profile")
    );
    assert.ok(androidStart && iosStart && harmonyStart);
    // Harmony starts after the mobile pair has had time to overlap (not with them).
    assert.ok(
      harmonyStart.t - startedAt >= 25,
      `harmony started too early: ${harmonyStart.t - startedAt}ms`
    );
    assert.ok(
      Math.abs(androidStart.t - iosStart.t) < 15,
      "android/ios should start together"
    );
  });

  it("distribute uploads only targets that built successfully", async () => {
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto_pack_partial-"));
    fs.mkdirSync(path.join(root, "artifacts"));
    fs.writeFileSync(
      path.join(root, "artifacts", "last-upload-android-debug.json"),
      JSON.stringify({
        platform: "android",
        mode: "debug",
        installUrl: "https://www.pgyer.com/a",
        buildQRCodeURL: "https://www.pgyer.com/qr/a",
      })
    );

    const { startLaneFn, calls } = fakeLane({
      results: {
        prep_deps: { code: 0, delay: 2 },
        "build:android/debug": { code: 0, delay: 15 },
        "build:ios/debug": { code: 3, delay: 10 },
        "upload_pgyer:android/debug": { code: 0, delay: 10 },
      },
    });

    const batch = startCompositeRun({
      packRoot: root,
      lane: "distribute",
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "ios", mode: "debug" },
      ],
      startLaneFn,
      onLog: () => {},
    });

    const result = await batch.done;
    assert.equal(result.code, 3);
    assert.equal(calls.filter((c) => c.lane === "upload_pgyer").length, 1);
    assert.equal(calls.find((c) => c.lane === "upload_pgyer")?.platform, "android");
    assert.equal(result.uploads.length, 1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("aborts when prep_deps fails", async () => {
    const { startLaneFn, calls } = fakeLane({
      results: {
        prep_deps: { code: 9, delay: 5 },
      },
    });

    const batch = startCompositeRun({
      packRoot: "/tmp/auto_pack_test",
      lane: "build",
      targets: [
        { platform: "android", mode: "debug" },
        { platform: "ios", mode: "debug" },
      ],
      startLaneFn,
      onLog: () => {},
    });

    const result = await batch.done;
    assert.equal(result.code, 9);
    assert.equal(calls.filter((c) => c.lane === "build").length, 0);
  });
});
