"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readAppRoot, writeAppRoot, writePgyerApiKey } = require("../src/lib/env");

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

describe("env PGYER_API_KEY", () => {
  it("writes a new key and overwrites on next non-empty value", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-env-"));
    const envPath = path.join(dir, ".env");
    fs.writeFileSync(envPath, "APP_ROOT=/app\n");

    assert.deepEqual(writePgyerApiKey(envPath, " key-one "), {
      wrote: true,
      configured: true,
    });
    assert.match(fs.readFileSync(envPath, "utf8"), /^PGYER_API_KEY=key-one$/m);

    assert.deepEqual(writePgyerApiKey(envPath, "key-two"), {
      wrote: true,
      configured: true,
    });
    assert.match(fs.readFileSync(envPath, "utf8"), /^PGYER_API_KEY=key-two$/m);
    assert.doesNotMatch(
      fs.readFileSync(envPath, "utf8"),
      /key-one/
    );
  });

  it("leaves existing key unchanged when input is empty", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-env-"));
    const envPath = path.join(dir, ".env");
    fs.writeFileSync(envPath, "APP_ROOT=/app\nPGYER_API_KEY=keep-me\n");

    assert.deepEqual(writePgyerApiKey(envPath, "   "), {
      wrote: false,
      configured: true,
    });
    assert.match(fs.readFileSync(envPath, "utf8"), /^PGYER_API_KEY=keep-me$/m);
  });
});
