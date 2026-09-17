"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  normalizeInstallType,
  readDefaultInstallType,
  resolvePgyerInstall,
  pgyerInstallProbes,
} = require("../src/lib/pgyer-install");

function tempPack(envText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-pgyer-"));
  fs.writeFileSync(path.join(dir, ".env"), envText);
  return dir;
}

describe("pgyer-install", () => {
  it("defaults install type to password (2)", () => {
    assert.equal(normalizeInstallType(""), "2");
    assert.equal(normalizeInstallType("9"), "2");
    assert.equal(normalizeInstallType("1"), "1");
    assert.equal(normalizeInstallType("2"), "2");
  });

  it("reads default install type from .env, else 2", () => {
    const a = tempPack("PGYER_INSTALL_TYPE=1\n");
    assert.equal(readDefaultInstallType(a), "1");
    const b = tempPack("APP_ROOT=/tmp\n");
    assert.equal(readDefaultInstallType(b), "2");
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  });

  it("public install clears password even if .env has one", () => {
    const pack = tempPack("PGYER_INSTALL_TYPE=2\nPGYER_PASSWORD=secret\n");
    const resolved = resolvePgyerInstall({
      packRoot: pack,
      installType: "1",
      password: "ignored",
    });
    assert.equal(resolved.installType, "1");
    assert.equal(resolved.password, "");
    assert.equal(resolved.passwordConfigured, true);
    fs.rmSync(pack, { recursive: true, force: true });
  });

  it("password install uses UI override, else .env", () => {
    const pack = tempPack("PGYER_PASSWORD=from-env\n");
    const fromUi = resolvePgyerInstall({
      packRoot: pack,
      installType: "2",
      password: "from-ui",
    });
    assert.equal(fromUi.password, "from-ui");
    const fromEnv = resolvePgyerInstall({
      packRoot: pack,
      installType: "2",
      password: "",
    });
    assert.equal(fromEnv.password, "from-env");
    assert.equal(fromEnv.passwordConfigured, true);
    fs.rmSync(pack, { recursive: true, force: true });
  });

  it("password install with empty UI and empty .env is not configured", () => {
    const pack = tempPack("APP_ROOT=/tmp\n");
    const resolved = resolvePgyerInstall({
      packRoot: pack,
      installType: "2",
      password: "",
    });
    assert.equal(resolved.passwordConfigured, false);
    fs.rmSync(pack, { recursive: true, force: true });
  });

  it("probes expose type and passwordConfigured without plaintext", () => {
    const pack = tempPack("PGYER_INSTALL_TYPE=2\nPGYER_PASSWORD=secret\n");
    const probes = pgyerInstallProbes(pack);
    assert.equal(probes.pgyerInstallType, "2");
    assert.equal(probes.pgyerPasswordConfigured, true);
    assert.equal(probes.pgyerPassword, undefined);
    fs.rmSync(pack, { recursive: true, force: true });
  });
});
