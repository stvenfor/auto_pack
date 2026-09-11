"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readAppRoot, writeAppRoot } = require("../src/lib/env");

describe("env APP_ROOT", () => {
  it("reads APP_ROOT from a .env file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-env-"));
    const envPath = path.join(dir, ".env");
    fs.writeFileSync(envPath, "APP_ROOT=/tmp/demo-app\nPGYER_API_KEY=secret\n");

    assert.equal(readAppRoot(envPath), "/tmp/demo-app");
  });

  it("writes APP_ROOT while preserving other keys", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-env-"));
    const envPath = path.join(dir, ".env");
    fs.writeFileSync(envPath, "APP_ROOT=/old\nPGYER_API_KEY=secret\n");

    writeAppRoot(envPath, "/new/app");

    const text = fs.readFileSync(envPath, "utf8");
    assert.match(text, /^APP_ROOT=\/new\/app$/m);
    assert.match(text, /^PGYER_API_KEY=secret$/m);
    assert.equal(readAppRoot(envPath), "/new/app");
  });
});
