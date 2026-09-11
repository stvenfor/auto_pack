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

function sharedStyles() {
  return `
    :root {
      --ink: #101820;
      --muted: #5c6e80;
      --tape: #e85a1a;
      --paper: #e8eef4;
      --sans: "IBM Plex Sans", "Helvetica Neue", sans-serif;
      --display: "Barlow Condensed", "Arial Narrow", sans-serif;
      --mono: "IBM Plex Mono", Menlo, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1.5rem;
      font-family: var(--sans);
      color: var(--ink);
      background:
        radial-gradient(ellipse 700px 400px at 10% 0%, #f7fafc 0%, transparent 55%),
        var(--paper);
    }
    .shell {
      width: min(100%, 920px);
      display: grid;
      gap: 1rem;
    }
    .card {
      background: #fff;
      border: 1px solid #a8b7c6;
      border-radius: 8px;
      padding: 1.35rem 1.4rem 1.5rem;
    }
    .eyebrow {
      margin: 0 0 0.35rem;
      color: var(--muted);
      font-size: 0.8rem;
      font-weight: 500;
    }
    h1 {
      margin: 0;
      font-family: var(--display);
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1;
    }
    h2 {
      margin: 0 0 0.45rem;
      font-size: 0.85rem;
      color: var(--muted);
      font-weight: 600;
    }
    .note {
      margin-top: 0.9rem;
      padding: 0.75rem 0.85rem;
      border-left: 3px solid var(--tape);
      background: #f7f9fc;
      border-radius: 0 6px 6px 0;
    }
    .note p {
      margin: 0;
      font-size: 0.92rem;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .meta {
      margin: 0.85rem 0 0;
      display: grid;
      gap: 0.35rem;
      font-size: 0.92rem;
    }
    .meta dt {
      color: var(--muted);
      font-size: 0.75rem;
    }
    .meta dd {
      margin: 0;
      font-weight: 600;
    }
    .qr-wrap {
      margin: 1.15rem 0 0;
      display: grid;
      place-items: center;
      padding: 0.85rem;
      border: 1px dashed #a8b7c6;
      border-radius: 6px;
      background: #f7f9fc;
    }
    .qr {
      width: min(100%, 240px);
      height: auto;
      display: block;
    }
    .link {
      display: block;
      margin-top: 0.9rem;
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--tape);
      word-break: break-all;
      line-height: 1.4;
    }
    .muted { color: var(--muted); margin: 0; }
    .app {
      margin-top: 0.75rem;
      color: var(--muted);
      font-size: 0.82rem;
    }
    .grid {
      display: grid;
      gap: 0.85rem;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .grid .card { padding: 1rem 1.05rem 1.15rem; }
    .grid h1 { font-size: 1.55rem; }
  `;
}

function singleCardInner(item) {
  const platform = platformLabel(item.platform);
  const mode = modeLabel(item.mode);
  const qr = String(item.buildQRCodeURL || "").trim();
  const install = String(item.installUrl || "").trim();
  const name = String(item.buildName || "").trim();
  const version = [item.buildVersion, item.buildVersionNo]
    .filter(Boolean)
    .join(" / ");
  const title = `${platform} · ${mode}`;
  const qrBlock = qr
    ? `<img class="qr" src="${escapeAttr(qr)}" alt="${escapeAttr(title)} 二维码" />`
    : `<p class="muted">未返回二维码地址</p>`;
  const linkBlock = install
    ? `<a class="link" href="${escapeAttr(install)}" target="_blank" rel="noopener">${escapeHtml(install)}</a>`
    : "";
  return {
    title,
    html: `
    <p class="eyebrow">上传成功 · 扫码安装</p>
    <h1>${escapeHtml(title)}</h1>
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
 */
function buildQrHtml(data) {
  const note = String(data.updateDescription || "").trim();
  const merged = String(data.mergedInstallUrl || "").trim();
  const uploads = Array.isArray(data.uploads)
    ? data.uploads
    : data.platform
      ? [data]
      : [];

  if (merged) {
    const title = "合并安装页";
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
      <p class="eyebrow">上传成功 · 共用安装页（按设备类型装对应包）</p>
      <h1>${escapeHtml(title)}</h1>
      ${noteBlock(note)}
      <p class="app">扫码或打开下方链接；Android / iOS / Harmony 设备会看到对应包。</p>
      <div class="qr-wrap">
        <img class="qr" src="${escapeAttr(`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(merged)}`)}" alt="合并安装页二维码" />
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
    const { title, html } = singleCardInner(item);
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
    </section>
  </main>
</body>
</html>
`;
  }

  const cards = uploads
    .map((item) => {
      const { html } = singleCardInner(item);
      return `<section class="card">${html}</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>多平台安装二维码</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <main class="shell">
    <section class="card">
      <p class="eyebrow">上传成功 · 同窗多卡</p>
      <h1>多平台安装</h1>
      ${noteBlock(note)}
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
 * Accepts either a single upload fields object or { uploads, updateDescription, mergedInstallUrl }.
 */
function writeLastUpload(packRoot, data) {
  const artifactsDir = path.join(packRoot, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });

  const updateDescription = String(
    data.updateDescription || data.buildUpdateDescription || ""
  ).trim();
  const mergedInstallUrl = String(data.mergedInstallUrl || "").trim();
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
  platformLabel,
  modeLabel,
  readLastUpload,
  readMergedInstallUrl,
  buildQrHtml,
  writeLastUpload,
};
