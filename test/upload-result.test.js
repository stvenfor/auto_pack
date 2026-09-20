"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  platformLabel,
  modeLabel,
  writeLastUpload,
  readLastUpload,
  readTargetUploadResult,
  targetUploadResultPath,
  buildQrHtml,
} = require("../src/lib/upload-result");

describe("upload-result", () => {
  it("labels platforms and modes", () => {
    assert.equal(platformLabel("android"), "Android");
    assert.equal(platformLabel("ios"), "iOS");
    assert.equal(platformLabel("harmony"), "Harmony");
    assert.equal(modeLabel("debug"), "debug");
    assert.equal(modeLabel("profile"), "profile");
  });

  it("uses per-target upload result paths", () => {
    const root = "/tmp/pack";
    assert.equal(
      targetUploadResultPath(root, "android", "debug"),
      path.join(root, "artifacts", "last-upload-android-debug.json")
    );
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-target-"));
    const file = targetUploadResultPath(tmp, "ios", "release");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        platform: "ios",
        mode: "release",
        installUrl: "https://www.pgyer.com/x",
      })
    );
    const saved = readTargetUploadResult(tmp, "ios", "release");
    assert.equal(saved.platform, "ios");
    assert.equal(saved.installUrl, "https://www.pgyer.com/x");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes json and html with platform/mode markers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-upload-"));
    const { htmlPath, payload } = writeLastUpload(root, {
      platform: "harmony",
      mode: "profile",
      buildName: "Demo",
      buildVersion: "1.0.0",
      buildVersionNo: "10",
      installUrl: "https://www.pgyer.com/demo",
      buildQRCodeURL: "https://www.pgyer.com/app/qrcodeHistory/abc",
      updateDescription: "修复登录闪退",
    });

    const saved = readLastUpload(root);
    assert.equal(saved.platform, "harmony");
    assert.equal(saved.mode, "profile");
    assert.equal(saved.updateDescription, "修复登录闪退");
    assert.equal(payload.buildQRCodeURL.includes("qrcode"), true);

    const html = fs.readFileSync(htmlPath, "utf8");
    assert.match(html, /Harmony/);
    assert.match(html, /profile/);
    assert.match(html, /平台/);
    assert.match(html, /模式/);
    assert.match(html, /qrcodeHistory/);
    assert.match(html, /安装说明/);
    assert.match(html, /修复登录闪退/);
  });

  it("omits install note block when empty", () => {
    const html = buildQrHtml({
      platform: "ios",
      mode: "release",
      buildQRCodeURL: "https://example.com/q.png",
      updateDescription: "",
    });
    assert.doesNotMatch(html, /安装说明/);
  });

  it("marks PRODUCT on QR html when product flag is set", () => {
    const html = buildQrHtml({
      platform: "android",
      mode: "release",
      buildQRCodeURL: "https://example.com/q.png",
      product: true,
    });
    assert.match(html, /PRODUCT/);
    assert.match(html, /TF_NET_PRODUCT=true/);
    assert.match(html, /上架包/);
  });

  it("persists product flag in last-upload.json", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-product-"));
    const { payload } = writeLastUpload(root, {
      platform: "ios",
      mode: "release",
      buildQRCodeURL: "https://example.com/q.png",
      product: true,
    });
    assert.equal(payload.product, true);
    const saved = readLastUpload(root);
    assert.equal(saved.product, true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("builds multi-card html for several uploads", () => {
    const html = buildQrHtml({
      updateDescription: "本周一测",
      uploads: [
        {
          platform: "android",
          mode: "debug",
          buildQRCodeURL: "https://example.com/a.png",
          installUrl: "https://www.pgyer.com/a",
        },
        {
          platform: "ios",
          mode: "release",
          buildQRCodeURL: "https://example.com/i.png",
          installUrl: "https://www.pgyer.com/i",
        },
      ],
    });
    assert.match(html, /多平台安装/);
    assert.match(html, /Android/);
    assert.match(html, /iOS/);
    assert.match(html, /本周一测/);
  });

  it("prefers merged install page when configured", () => {
    const html = buildQrHtml({
      mergedInstallUrl: "https://www.pgyer.com/merged-demo",
      updateDescription: "共用码",
      uploads: [
        { platform: "android", mode: "debug", buildQRCodeURL: "https://x/a" },
      ],
    });
    assert.match(html, /合并安装页/);
    assert.match(html, /merged-demo/);
    assert.match(html, /共用码/);
  });

  it("buildQrHtml can show session password without persisting it", () => {
    const html = buildQrHtml({
      platform: "android",
      mode: "debug",
      buildQRCodeURL: "https://example.com/q.png",
      installPassword: "team-pass",
    });
    assert.match(html, /安装密码/);
    assert.match(html, /team-pass/);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-pwd-"));
    writeLastUpload(root, {
      platform: "android",
      mode: "debug",
      buildQRCodeURL: "https://example.com/q.png",
      installPassword: "should-not-persist",
    });
    const saved = readLastUpload(root);
    assert.equal(saved.installPassword, undefined);
    const diskHtml = fs.readFileSync(
      path.join(root, "artifacts", "last-upload-qr.html"),
      "utf8"
    );
    assert.doesNotMatch(diskHtml, /should-not-persist/);
    assert.doesNotMatch(diskHtml, /安装密码/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("shows local upload time on QR html", () => {
    const html = buildQrHtml({
      platform: "android",
      mode: "debug",
      buildQRCodeURL: "https://example.com/q.png",
      updatedAt: "2026-09-20T08:10:00.000Z",
    });
    assert.match(html, /上传时间/);
    assert.match(html, /2026-09-20/);
  });

  it("buildQrHtml escapes content", () => {
    const html = buildQrHtml({
      platform: "ios",
      mode: "release",
      buildName: "<script>",
      buildQRCodeURL: "https://example.com/q.png",
      updateDescription: "<b>x</b>",
    });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  });
});
