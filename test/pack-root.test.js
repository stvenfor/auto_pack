"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  resolvePackRoot,
  resolveBundlePackRoot,
  ensurePackRootReady,
} = require("../src/lib/pack-root");

describe("pack-root", () => {
  it("resolves repo root from electron dirname in development", () => {
    const electronDir = "/tmp/auto_pack/electron";
    assert.equal(
      resolvePackRoot({ isPackaged: false, electronDirname: electronDir }),
      path.resolve("/tmp/auto_pack")
    );
  });

  it("resolves Application Support pack when packaged", () => {
    assert.equal(
      resolvePackRoot({
        isPackaged: true,
        userDataPath: "/Users/mac/Library/Application Support/Auto Pack",
      }),
      "/Users/mac/Library/Application Support/Auto Pack/pack"
    );
  });

  it("resolves bundle template under Resources/pack", () => {
    assert.equal(
      resolveBundlePackRoot("/Apps/Auto Pack.app/Contents/Resources"),
      "/Apps/Auto Pack.app/Contents/Resources/pack"
    );
  });

  it("creates artifacts, copies Fastlane from bundle, and seeds .env", () => {
    const userPack = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-user-"));
    const bundle = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-bundle-"));
    fs.mkdirSync(path.join(bundle, "fastlane"));
    fs.writeFileSync(path.join(bundle, "fastlane", "Fastfile"), "# lane\n");
    fs.writeFileSync(
      path.join(bundle, ".env.example"),
      "APP_ROOT=\nPGYER_API_KEY=\n"
    );

    ensurePackRootReady(userPack, { bundlePackRoot: bundle });

    assert.ok(fs.existsSync(path.join(userPack, "artifacts")));
    assert.ok(fs.existsSync(path.join(userPack, "fastlane", "Fastfile")));
    assert.ok(fs.existsSync(path.join(userPack, ".env")));
    assert.match(
      fs.readFileSync(path.join(userPack, ".env"), "utf8"),
      /PGYER_API_KEY/
    );

    fs.rmSync(userPack, { recursive: true, force: true });
    fs.rmSync(bundle, { recursive: true, force: true });
  });

  it("refreshes Fastlane from bundle on every ensure (keeps .env)", () => {
    const userPack = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-user-"));
    const bundle = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-bundle-"));
    fs.mkdirSync(path.join(bundle, "fastlane"));
    fs.writeFileSync(path.join(bundle, "fastlane", "Fastfile"), "# v1\n");
    fs.writeFileSync(path.join(bundle, ".env.example"), "APP_ROOT=\n");

    ensurePackRootReady(userPack, { bundlePackRoot: bundle });
    fs.writeFileSync(
      path.join(userPack, ".env"),
      "APP_ROOT=/keep/me\nPGYER_API_KEY=secret\n"
    );
    fs.writeFileSync(path.join(bundle, "fastlane", "Fastfile"), "# v2-new\n");
    fs.writeFileSync(
      path.join(bundle, "fastlane", "NewLane.rb"),
      "# added\n"
    );

    ensurePackRootReady(userPack, { bundlePackRoot: bundle });

    assert.match(
      fs.readFileSync(path.join(userPack, "fastlane", "Fastfile"), "utf8"),
      /v2-new/
    );
    assert.ok(fs.existsSync(path.join(userPack, "fastlane", "NewLane.rb")));
    assert.match(
      fs.readFileSync(path.join(userPack, ".env"), "utf8"),
      /\/keep\/me/
    );
    assert.match(
      fs.readFileSync(path.join(userPack, ".env"), "utf8"),
      /secret/
    );

    fs.rmSync(userPack, { recursive: true, force: true });
    fs.rmSync(bundle, { recursive: true, force: true });
  });

  it("migrates legacy Resources .env into user pack once", () => {
    const userPack = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-user-"));
    const bundle = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-bundle-"));
    fs.mkdirSync(path.join(bundle, "fastlane"));
    fs.writeFileSync(path.join(bundle, "fastlane", "Fastfile"), "# lane\n");
    fs.writeFileSync(
      path.join(bundle, ".env"),
      "APP_ROOT=/tmp/app\nPGYER_API_KEY=secret-key\n"
    );

    ensurePackRootReady(userPack, { bundlePackRoot: bundle });

    assert.match(
      fs.readFileSync(path.join(userPack, ".env"), "utf8"),
      /secret-key/
    );

    fs.rmSync(userPack, { recursive: true, force: true });
    fs.rmSync(bundle, { recursive: true, force: true });
  });
});
