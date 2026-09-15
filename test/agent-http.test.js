"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ConsoleControl } = require("../src/lib/console-control");
const { startAgentServer } = require("../src/lib/agent-http");

function tempPackRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-agent-"));
  fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "h5"), { recursive: true });
  fs.writeFileSync(path.join(dir, "h5", "index.html"), "<html>ok</html>\n");
  fs.writeFileSync(path.join(dir, ".env"), "APP_ROOT=/tmp/app\n");
  return dir;
}

describe("Agent HTTP", () => {
  /** @type {string} */
  let packRoot;
  /** @type {{ close: () => Promise<void>, port: number, host: string }} */
  let listening;
  const token = "test-token-secret";

  before(async () => {
    packRoot = tempPackRoot();
    const neverDone = new Promise(() => {});
    const control = new ConsoleControl({
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
        checks: { appRoot: true, flutter: true },
      }),
      startCompositeRunFn: () => ({
        cancel() {},
        done: neverDone,
      }),
    });
    listening = await startAgentServer({
      control,
      accessToken: token,
      staticRoot: path.join(packRoot, "h5"),
      host: "127.0.0.1",
      port: 0,
    });
  });

  after(async () => {
    await listening.close();
    fs.rmSync(packRoot, { recursive: true, force: true });
  });

  function base(pathname) {
    return `http://${listening.host}:${listening.port}${pathname}`;
  }

  it("rejects readiness without Access Token", async () => {
    const res = await fetch(base("/api/readiness"));
    assert.equal(res.status, 401);
  });

  it("returns readiness with Bearer token", async () => {
    const res = await fetch(base("/api/readiness"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.canBuild, true);
    assert.ok(body.packRoot);
  });

  it("serves H5 index without auth", async () => {
    const res = await fetch(base("/"));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /ok/);
  });

  it("returns 409 when a second build-class Run starts while busy", async () => {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const first = await fetch(base("/api/runs"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        lane: "build",
        targets: [{ platform: "android", mode: "debug" }],
      }),
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.ok, true);

    const second = await fetch(base("/api/runs"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        lane: "build",
        targets: [{ platform: "android", mode: "debug" }],
      }),
    });
    assert.equal(second.status, 409);
    const secondBody = await second.json();
    assert.equal(secondBody.ok, false);
    assert.match(String(secondBody.reason), /already active/i);

    await fetch(base(`/api/runs/${firstBody.id}/cancel`), {
      method: "POST",
      headers,
      body: "{}",
    });
  });

  it("sets App Root via PUT", async () => {
    const appDir = path.join(packRoot, "flutter-app");
    fs.mkdirSync(appDir);
    const res = await fetch(base("/api/app-root"), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ appRoot: appDir }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    const envText = fs.readFileSync(path.join(packRoot, ".env"), "utf8");
    assert.match(envText, new RegExp(appDir.replace(/\\/g, "\\\\")));
  });
});
