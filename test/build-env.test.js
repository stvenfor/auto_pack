"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  sanitizeBuildEnv,
  syncAndroidLocalProperties,
  resolveFvmFlutterRoot,
} = require("../src/lib/build-env");

describe("build-env", () => {
  let tmp;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-build-env-"));
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("overrides broken FLUTTER_HOME with FVM root", () => {
    const flutterRoot = path.join(tmp, "fvm-sdk");
    fs.mkdirSync(path.join(flutterRoot, "bin"), { recursive: true });
    fs.writeFileSync(path.join(flutterRoot, "bin", "flutter"), "#!/bin/sh\n");
    fs.chmodSync(path.join(flutterRoot, "bin", "flutter"), 0o755);

    const env = sanitizeBuildEnv(
      {
        FLUTTER_HOME: "/does/not/exist/flutter",
        PATH: "/usr/bin",
      },
      { flutterRoot }
    );

    assert.equal(env.FLUTTER_HOME, flutterRoot);
    assert.equal(env.FLUTTER_ROOT, flutterRoot);
  });

  it("strips GEM_HOME/GEM_PATH that break CocoaPods", () => {
    const env = sanitizeBuildEnv(
      {
        PATH: "/usr/bin",
        GEM_HOME: "/tmp/fake-gem-home",
        GEM_PATH: "/tmp/fake-gem-path",
        BUNDLE_GEMFILE: "/tmp/Gemfile",
      },
      {}
    );
    assert.equal(env.GEM_HOME, undefined);
    assert.equal(env.GEM_PATH, undefined);
    assert.equal(env.BUNDLE_GEMFILE, undefined);
  });

  it("fills UTF-8 locale when GUI env omits LANG", () => {
    const env = sanitizeBuildEnv({ PATH: "/usr/bin" }, {});
    assert.match(env.LANG, /utf-?8/i);
    assert.match(env.LC_ALL, /utf-?8/i);
  });

  it("preserves an existing UTF-8 LANG", () => {
    const env = sanitizeBuildEnv(
      { PATH: "/usr/bin", LANG: "zh_CN.UTF-8" },
      {}
    );
    assert.equal(env.LANG, "zh_CN.UTF-8");
    assert.equal(env.LC_ALL, "zh_CN.UTF-8");
  });

  it("keeps explicit Harmony SDK env and mirrors to both keys when one is set", () => {
    const sdk = path.join(tmp, "fake-deveco-sdk");
    fs.mkdirSync(sdk, { recursive: true });
    const env = sanitizeBuildEnv(
      {
        PATH: "/usr/bin",
        DEVECO_SDK_HOME: sdk,
      },
      {}
    );
    assert.equal(env.DEVECO_SDK_HOME, sdk);
    assert.equal(env.HOS_SDK_HOME, sdk);
  });

  it("syncs android/local.properties flutter.sdk", () => {
    const appRoot = path.join(tmp, "app");
    const androidDir = path.join(appRoot, "android");
    fs.mkdirSync(androidDir, { recursive: true });
    fs.writeFileSync(
      path.join(androidDir, "local.properties"),
      "sdk.dir=/old/sdk\nflutter.sdk=/stale/flutter\n"
    );

    const flutterRoot = path.join(tmp, "good-flutter");
    const written = syncAndroidLocalProperties(appRoot, flutterRoot);
    assert.ok(written);
    const text = fs.readFileSync(written, "utf8");
    assert.ok(text.includes(`flutter.sdk=${flutterRoot}`));
    assert.match(text, /sdk\.dir=/);
  });

  it("resolves FVM flutter root from app root", () => {
    const appRoot = path.join(tmp, "fvm-app");
    const sdk = path.join(appRoot, ".fvm", "flutter_sdk");
    fs.mkdirSync(path.join(sdk, "bin"), { recursive: true });
    fs.writeFileSync(path.join(sdk, "bin", "flutter"), "#!/bin/sh\n");
    fs.chmodSync(path.join(sdk, "bin", "flutter"), 0o755);

    assert.equal(resolveFvmFlutterRoot(appRoot), fs.realpathSync(sdk));
  });

  it("injects DevEco ohpm/hvigor onto PATH for GUI-like env", () => {
    const toolHome = path.join(tmp, "DevEcoContents");
    const sdk = path.join(toolHome, "sdk");
    const ohpmBin = path.join(toolHome, "tools", "ohpm", "bin");
    const hvigorBin = path.join(toolHome, "tools", "hvigor", "bin");
    fs.mkdirSync(ohpmBin, { recursive: true });
    fs.mkdirSync(hvigorBin, { recursive: true });
    fs.mkdirSync(sdk, { recursive: true });

    const env = sanitizeBuildEnv(
      {
        PATH: "/usr/bin:/bin",
        DEVECO_SDK_HOME: sdk,
        ELECTRON_RUN_AS_NODE: "1",
      },
      {}
    );

    assert.equal(env.TOOL_HOME, toolHome);
    assert.equal(env.OHPM_HOME, path.join(toolHome, "tools", "ohpm"));
    assert.ok(env.PATH.split(path.delimiter).includes(ohpmBin));
    assert.ok(env.PATH.split(path.delimiter).includes(hvigorBin));
    assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  });
});