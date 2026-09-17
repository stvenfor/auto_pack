"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PLATFORM_LABEL = {
  android: "Android",
  ios: "iOS",
  harmony: "Harmony",
};

function lastUploadPath(packRoot) {
  return path.join(packRoot, "artifacts", "last-upload.json");
}

function lastUploadQrHtmlPath(packRoot) {
  return path.join(packRoot, "artifacts", "last-upload-qr.html");
}

/** Per-Target upload result written by Fastlane (safe under parallel uploads). */
function targetUploadResultPath(packRoot, platform, mode) {
  const p = String(platform || "android").toLowerCase();
  const m = String(mode || "debug").toLowerCase();
  return path.join(packRoot, "artifacts", `last-upload-${p}-${m}.json`);
}

function platformLabel(platform) {
  const key = String(platform || "").toLowerCase();
  return PLATFORM_LABEL[key] || String(platform || "未知平台");
}

function modeLabel(mode) {
  const m = String(mode || "").trim();
  if (!m) return "未知模式";
  return m;
}

function readLastUpload(packRoot) {
  const file = lastUploadPath(packRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function readTargetUploadResult(packRoot, platform, mode) {
  const file = targetUploadResultPath(packRoot, platform, mode);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function readEnvValue(packRoot, key) {
  const fromEnv = (process.env[key] || "").trim();
  if (fromEnv) return fromEnv;
  const envPath = path.join(packRoot, ".env");
  if (!fs.existsSync(envPath)) return "";
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq).trim() !== key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

function readMergedInstallUrl(packRoot) {
  return readEnvValue(packRoot, "PGYER_MERGED_INSTALL_URL");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function noteBlock(updateDescription) {
  const note = String(updateDescription || "").trim();
  if (!note) return "";
  return `<section class="note">
      <h2>安装说明</h2>
      <p>${escapeHtml(note).replace(/\n/g, "<br />")}</p>
    </section>`;
}

function passwordBlock(installPassword) {
  const password = String(installPassword || "").trim();
  if (!password) return "";
  return `<section class="note password-note">
      <h2>安装密码</h2>
      <p class="password-value">${escapeHtml(password)}</p>
    </section>`;
}

function productBlock(product) {
  if (!product) return "";
  return `<p class="product-badge">上架包 PRODUCT · TF_NET_PRODUCT=true</p>`;
}

function sharedStyles() {
  return `
    :root {
      --ink: #0b1220;
      --ink-soft: #243044;
      --muted: #5a6b7d;
      --seal: #0f766e;
      --seal-mid: #14b8a6;
      --paper: #dce6ef;
      --surface: #ffffff;
      --line: #a7b8c9;
      --sans: "Source Sans 3", "Helvetica Neue", sans-serif;
      --display: "Archivo Narrow", "Arial Narrow", sans-serif;
      --mono: "IBM Plex Mono", Menlo, monospace;
    }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      margin: 0;
      overflow: hidden;
    }
    body {
      display: grid;
      place-items: center;
      padding: 0.65rem;
      font-family: var(--sans);
      color: var(--ink);
      background:
        radial-gradient(ellipse 520px 280px at 8% 0%, #f4f8fc 0%, transparent 58%),
        var(--paper);
    }
    .shell {
      width: min(100%, 100%);
      max-height: 100%;
      display: grid;
      gap: 0.45rem;
      align-content: center;
      overflow: hidden;
    }
    .shell.shell-multi {
      width: min(100%, 860px);
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-left: 3px solid var(--ink);
      border-radius: 0 8px 8px 0;
      padding: 0.7rem 0.85rem 0.8rem;
      display: grid;
      gap: 0.35rem;
      justify-items: stretch;
    }
    .eyebrow {
      margin: 0;
      color: var(--seal);
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    h1 {
      margin: 0;
      font-family: var(--display);
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1.05;
      text-transform: uppercase;
    }
    h2 {
      margin: 0 0 0.2rem;
      font-size: 0.68rem;
      color: var(--muted);
      font-weight: 600;
    }
    .note {
      margin: 0;
      padding: 0.4rem 0.5rem;
      border-left: 3px solid var(--seal);
      background: #f3f7fb;
      border-radius: 0 5px 5px 0;
    }
    .note p {
      margin: 0;
      font-size: 0.78rem;
      line-height: 1.35;
      white-space: pre-wrap;
      max-height: 2.7em;
      overflow: hidden;
    }
    .password-note .password-value {
      font-family: var(--mono);
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--ink);
    }
    .meta {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 0.85rem;
      font-size: 0.78rem;
    }
    .meta div {
      display: flex;
      align-items: baseline;
      gap: 0.3rem;
    }
    .meta dt {
      margin: 0;
      color: var(--muted);
      font-size: 0.68rem;
      font-weight: 600;
    }
    .meta dd {
      margin: 0;
      font-weight: 600;
      color: var(--ink-soft);
    }
    .qr-wrap {
      margin: 0.15rem 0 0;
      display: grid;
      place-items: center;
      justify-self: center;
      padding: 0.45rem;
      border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
      border-radius: 6px;
      background: #f7fafc;
      width: fit-content;
    }
    .qr {
      width: 148px;
      height: 148px;
      object-fit: contain;
      display: block;
    }
    .link {
      display: block;
      margin: 0;
      font-family: var(--mono);
      font-size: 0.62rem;
      color: var(--seal);
      word-break: break-all;
      line-height: 1.3;
      max-height: 2.6em;
      overflow: hidden;
    }
    .muted { color: var(--muted); margin: 0; font-size: 0.75rem; }
    .app {
      margin: 0;
      color: var(--muted);
      font-size: 0.72rem;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .product-badge {
      margin: 0;
      padding: 0.22rem 0.4rem;
      border-left: 3px solid var(--seal-mid);
      background: #ecfdf8;
      color: #0f766e;
      font-family: var(--mono);
      font-size: 0.65rem;
      font-weight: 600;
      line-height: 1.3;
      width: fit-content;
    }
    .head-card {
      padding: 0.55rem 0.75rem;
    }
    .head-card h1 { font-size: 1.15rem; }
    .grid {
      display: grid;
      gap: 0.45rem;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      align-items: start;
      overflow: hidden;
    }
    .grid .card {
      padding: 0.55rem 0.6rem 0.65rem;
      gap: 0.28rem;
    }
    .grid h1 { font-size: 1.05rem; }
    .grid .qr {
      width: 120px;
      height: 120px;
    }
    .grid .qr-wrap { padding: 0.35rem; }
    .grid .link {
      font-size: 0.58rem;
      max-height: 2.4em;
    }
  `;
}

function singleCardInner(item, product = false) {
  const platform = platformLabel(item.platform);
  const mode = modeLabel(item.mode);
  const qr = String(item.buildQRCodeURL || "").trim();
  const install = String(item.installUrl || "").trim();
  const name = String(item.buildName || "").trim();
  const version = [item.buildVersion, item.buildVersionNo]
    .filter(Boolean)
    .join(" / ");
  const title = product ? `${platform} · ${mode} · PRODUCT` : `${platform} · ${mode}`;
  const eyebrow = product
    ? "上传成功 · 扫码安装 · PRODUCT"
    : "上传成功 · 扫码安装";
  const qrBlock = qr
    ? `<img class="qr" src="${escapeAttr(qr)}" alt="${escapeAttr(title)} 二维码" />`
    : `<p class="muted">未返回二维码地址</p>`;
  const linkBlock = install
    ? `<a class="link" href="${escapeAttr(install)}" target="_blank" rel="noopener">${escapeHtml(install)}</a>`
    : "";
  return {
    title,
    html: `
    <p class="eyebrow">${eyebrow}</p>
    <h1>${escapeHtml(title)}</h1>
    ${productBlock(product)}
    <dl class="meta">
      <div><dt>平台</dt><dd>${escapeHtml(platform)}</dd></div>
      <div><dt>模式</dt><dd>${escapeHtml(mode)}</dd></div>
    </dl>
    ${name || version ? `<p class="app">${escapeHtml([name, version].filter(Boolean).join(" · "))}</p>` : ""}
    <div class="qr-wrap">${qrBlock}</div>
    ${linkBlock}`,
  };
}

/**
 * @param {object} data
 * @param {Array<object>} [data.uploads]
 * @param {string} [data.updateDescription]
 * @param {string} [data.mergedInstallUrl]
 * @param {boolean} [data.product]
 * @param {string} [data.installPassword] session-only; never persist to last-upload.json
 */
function buildQrHtml(data) {
  const note = String(data.updateDescription || "").trim();
  const installPassword = String(data.installPassword || "").trim();
  const merged = String(data.mergedInstallUrl || "").trim();
  const product = Boolean(data.product);
  const uploads = Array.isArray(data.uploads)
    ? data.uploads
    : data.platform
      ? [data]
      : [];

  if (merged) {
    const title = product ? "合并安装页 · PRODUCT" : "合并安装页";
    const eyebrow = product
      ? "上传成功 · 共用安装页 · 上架包 PRODUCT"
      : "上传成功 · 共用安装页（按设备类型装对应包）";
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — 安装二维码</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <main class="shell">
    <section class="card">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${escapeHtml(title)}</h1>
      ${productBlock(product)}
      ${noteBlock(note)}
      ${passwordBlock(installPassword)}
      <p class="app">按设备类型展示对应安装包</p>
      <div class="qr-wrap">
        <img class="qr" src="${escapeAttr(`https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(merged)}`)}" alt="合并安装页二维码" />
      </div>
      <a class="link" href="${escapeAttr(merged)}" target="_blank" rel="noopener">${escapeHtml(merged)}</a>
    </section>
  </main>
</body>
</html>
`;
  }

  if (uploads.length <= 1) {
    const item = uploads[0] || data;
    const { title, html } = singleCardInner(item, product);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — 安装二维码</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <main class="shell">
    <section class="card">
      ${html}
      ${noteBlock(note)}
      ${passwordBlock(installPassword)}
    </section>
  </main>
</body>
</html>
`;
  }

  const cards = uploads
    .map((item) => {
      const { html } = singleCardInner(item, product);
      return `<section class="card">${html}</section>`;
    })
    .join("\n");

  const multiTitle = product ? "多平台安装 · PRODUCT" : "多平台安装";
  const multiEyebrow = product
    ? "上传成功 · 同窗多卡 · 上架包 PRODUCT"
    : "上传成功 · 同窗多卡";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(multiTitle)}二维码</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <main class="shell shell-multi">
    <section class="card head-card">
      <p class="eyebrow">${multiEyebrow}</p>
      <h1>${escapeHtml(multiTitle)}</h1>
      ${productBlock(product)}
      ${noteBlock(note)}
      ${passwordBlock(installPassword)}
    </section>
    <div class="grid">
      ${cards}
    </div>
  </main>
</body>
</html>
`;
}

function normalizeUploadItem(data) {
  return {
    platform: data.platform || "",
    mode: data.mode || "",
    buildName: data.buildName || "",
    buildVersion: data.buildVersion || "",
    buildVersionNo: data.buildVersionNo || "",
    installUrl: data.installUrl || "",
    buildQRCodeURL: data.buildQRCodeURL || "",
  };
}

/**
 * Persist last upload batch and regenerate QR HTML.
 * Accepts either a single upload fields object or { uploads, updateDescription, mergedInstallUrl, product }.
 * installPassword (if passed) is used only for in-memory HTML callers — never written to JSON/HTML on disk here.
 */
function writeLastUpload(packRoot, data) {
  const artifactsDir = path.join(packRoot, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });

  const updateDescription = String(
    data.updateDescription || data.buildUpdateDescription || ""
  ).trim();
  const mergedInstallUrl = String(data.mergedInstallUrl || "").trim();
  const product = Boolean(data.product);
  const uploads = Array.isArray(data.uploads)
    ? data.uploads.map(normalizeUploadItem)
    : data.platform
      ? [normalizeUploadItem(data)]
      : [];

  const primary = uploads[0] || normalizeUploadItem(data);
  const payload = {
    ...primary,
    updateDescription,
    mergedInstallUrl,
    product,
    uploads,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(lastUploadPath(packRoot), `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(lastUploadQrHtmlPath(packRoot), buildQrHtml(payload));
  return {
    jsonPath: lastUploadPath(packRoot),
    htmlPath: lastUploadQrHtmlPath(packRoot),
    payload,
  };
}

module.exports = {
  PLATFORM_LABEL,
  lastUploadPath,
  lastUploadQrHtmlPath,
  targetUploadResultPath,
  platformLabel,
  modeLabel,
  readLastUpload,
  readTargetUploadResult,
  readMergedInstallUrl,
  buildQrHtml,
  writeLastUpload,
};
