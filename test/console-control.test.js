"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ConsoleControl } = require("../src/lib/console-control");
const { BuildRunLock } = require("../src/lib/build-run-lock");

function tempPackRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-cc-"));
  fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".env"), "APP_ROOT=/tmp/app\n");
  return dir;
}

function baseDeps(packRoot, startCompositeRunFn) {
  return {
    packRoot,
    gatherProbesFn: () => ({
      appRoot: path.join(packRoot, "app"),
      flutterBin: "/usr/bin/flutter",
      appRootIsGit: false,
      platformDirs: { android: true, ios: false, harmony: false },
    }),
    assessReadinessFn: () => ({
      canBuild: true,
      canUpload: true,
      canDistribute: true,
      targets: [
        {
          platform: "android",
          mode: "debug",
          canBuild: true,
          canUpload: true,
        },
      ],
      issues: [],
    }),
    startCompositeRunFn,
  };
}

describe("ConsoleControl", () => {
  /** @type {string} */
  let packRoot;

  beforeEach(() => {
    packRoot = tempPackRoot();
  });

  afterEach(() => {
    fs.rmSync(packRoot, { recursive: true, force: true });
  });

  it("rejects a second in-process build-class Run while one is active", async () => {
    const neverDone = new Promise(() => {});
    const control = new ConsoleControl({
      ...baseDeps(packRoot, () => ({
        cancel() {},
        done: neverDone,
      })),
    });

    const first = control.startRun({
      lane: "build",
      targets: [{ platform: "android", mode: "debug" }],
    });
    assert.equal(first.ok, true);

    const second = control.startRun({
      lane: "build",
      targets: [{ platform: "android", mode: "debug" }],
    });
    assert.equal(second.ok, false);
    assert.match(String(second.reason), /already active/i);

    control.cancelRun(first.id);
    control.dispose();
  });

  it("rejects a build-class Run when another process holds the Build Host lock", () => {
    const lock = new BuildRunLock(packRoot);
    const held = lock.tryAcquire({ runId: "run-other", lane: "build" });
    assert.equal(held.ok, true);

    const control = new ConsoleControl({
      ...baseDeps(packRoot, () => ({
        cancel() {},
        done: new Promise(() => {}),
      })),
    });

    const result = control.startRun({
      lane: "build",
      targets: [{ platform: "android", mode: "debug" }],
    });
    assert.equal(result.ok, false);
    assert.match(String(result.reason), /already active/i);

    lock.release();
    control.dispose();
  });

  it("emits started and finished events for a completing Run", async () => {
    /** @type {object[]} */
    const events = [];
    const control = new ConsoleControl({
      ...baseDeps(packRoot, ({ onLog }) => {
        onLog?.("hello\n");
        return {
          cancel() {},
          done: Promise.resolve({
            code: 0,
            signal: null,
            cancelled: false,
            uploads: [],
          }),
        };
      }),
      onEvent: (e) => events.push(e),
    });

    const started = control.startRun({
      lane: "build",
      targets: [{ platform: "android", mode: "debug" }],
    });
    assert.equal(started.ok, true);
    await new Promise((r) => setTimeout(r, 30));

    assert.ok(events.some((e) => e.type === "started" && e.id === started.id));
    assert.ok(events.some((e) => e.type === "log" && e.chunk === "hello\n"));
    assert.ok(
      events.some((e) => e.type === "finished" && e.id === started.id && e.code === 0)
    );

    control.dispose();
  });

  it("setAppRoot persists APP_ROOT and returns readiness", () => {
    const control = new ConsoleControl({
      ...baseDeps(packRoot, () => ({
        cancel() {},
        done: Promise.resolve({ code: 0, signal: null, cancelled: false }),
      })),
    });
    const appDir = path.join(packRoot, "my-app");
    fs.mkdirSync(appDir);
    const result = control.setAppRoot(appDir);
    assert.equal(result.ok, true);
    assert.ok(result.readiness);
    const envText = fs.readFileSync(path.join(packRoot, ".env"), "utf8");
    assert.match(envText, new RegExp(`APP_ROOT=${appDir.replace(/\\/g, "\\\\")}`));
    control.dispose();
  });

  it("getUploadPresentation returns merged URL when configured", () => {
    fs.writeFileSync(
      path.join(packRoot, "artifacts", "last-upload.json"),
      JSON.stringify({
        uploads: [
          {
            platform: "android",
            mode: "debug",
            installUrl: "https://example.com/a",
            buildQRCodeURL: "https://example.com/qr.png",
          },
        ],
        updateDescription: "note",
        mergedInstallUrl: "",
        product: false,
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(packRoot, ".env"),
      "APP_ROOT=/tmp/app\nPGYER_MERGED_INSTALL_URL=https://www.pgyer.com/merged\n",
      "utf8"
    );

    const control = new ConsoleControl({
      ...baseDeps(packRoot, () => ({
        cancel() {},
        done: Promise.resolve({ code: 0, signal: null, cancelled: false }),
      })),
    });

    const presentation = control.getUploadPresentation();
    assert.equal(presentation.ok, true);
    assert.equal(presentation.presentation, "merged");
    assert.equal(presentation.mergedInstallUrl, "https://www.pgyer.com/merged");
    assert.equal(presentation.updateDescription, "note");
    assert.equal(presentation.uploads.length, 1);

    control.dispose();
  });

  it("getUploadPresentation uses cards when merged URL is absent", () => {
    fs.writeFileSync(
      path.join(packRoot, "artifacts", "last-upload.json"),
      JSON.stringify({
        uploads: [
          {
            platform: "android",
            mode: "debug",
            installUrl: "https://example.com/a",
            buildQRCodeURL: "https://example.com/qr.png",
          },
          {
            platform: "ios",
            mode: "debug",
            installUrl: "https://example.com/i",
            buildQRCodeURL: "https://example.com/qr-ios.png",
          },
        ],
        updateDescription: "",
        product: false,
      }),
      "utf8"
    );

    const control = new ConsoleControl({
      ...baseDeps(packRoot, () => ({
        cancel() {},
        done: Promise.resolve({ code: 0, signal: null, cancelled: false }),
      })),
    });

    const presentation = control.getUploadPresentation();
    assert.equal(presentation.ok, true);
    assert.equal(presentation.presentation, "cards");
    assert.equal(presentation.mergedInstallUrl, "");
    assert.equal(presentation.uploads.length, 2);
    control.dispose();
  });

  it("cancelRun stops an in-flight Run and emits finished", async () => {
    /** @type {object[]} */
    const events = [];
    let cancelled = false;
    const control = new ConsoleControl({
      ...baseDeps(packRoot, () => ({
        cancel() {
          cancelled = true;
        },
        done: new Promise((resolve) => {
          const timer = setInterval(() => {
            if (cancelled) {
              clearInterval(timer);
              resolve({ code: null, signal: "SIGTERM", cancelled: true, uploads: [] });
            }
          }, 10);
        }),
      })),
      onEvent: (e) => events.push(e),
    });

    const started = control.startRun({
      lane: "build",
      targets: [{ platform: "android", mode: "debug" }],
    });
    assert.equal(started.ok, true);
    const cancel = control.cancelRun(started.id);
    assert.equal(cancel.ok, true);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(cancelled, true);
    assert.ok(events.some((e) => e.type === "finished" && e.cancelled));
    control.dispose();
  });

  it("checkoutBranch rejects while a build-class Run is active", () => {
    const control = new ConsoleControl({
      ...baseDeps(packRoot, () => ({
        cancel() {},
        done: new Promise(() => {}),
      })),
    });
    const started = control.startRun({
      lane: "build",
      targets: [{ platform: "android", mode: "debug" }],
    });
    assert.equal(started.ok, true);
    const result = control.checkoutBranch("main");
    assert.equal(result.ok, false);
    assert.match(String(result.reason), /Cannot switch branch/i);
    control.cancelRun(started.id);
    control.dispose();
  });
});

describe("BuildRunLock", () => {
  it("second acquire fails until release", () => {
    const packRoot = tempPackRoot();
    const a = new BuildRunLock(packRoot);
    const b = new BuildRunLock(packRoot);
    assert.equal(a.tryAcquire({ runId: "r1", lane: "build" }).ok, true);
    assert.equal(b.tryAcquire({ runId: "r2", lane: "build" }).ok, false);
    a.release();
    assert.equal(b.tryAcquire({ runId: "r2", lane: "build" }).ok, true);
    b.release();
    fs.rmSync(packRoot, { recursive: true, force: true });
  });
});
