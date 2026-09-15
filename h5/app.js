"use strict";

const TOKEN_KEY = "autoPackAccessToken";

const el = {
  authPanel: document.getElementById("auth-panel"),
  main: document.getElementById("main"),
  token: document.getElementById("token"),
  btnSaveToken: document.getElementById("btn-save-token"),
  authHint: document.getElementById("auth-hint"),
  appRoot: document.getElementById("app-root"),
  packMeta: document.getElementById("pack-meta"),
  branchLine: document.getElementById("branch-line"),
  actionHint: document.getElementById("action-hint"),
  checks: document.getElementById("checks"),
  appRootInput: document.getElementById("app-root-input"),
  btnSetAppRoot: document.getElementById("btn-set-app-root"),
  branchSelect: document.getElementById("branch-select"),
  btnCheckout: document.getElementById("btn-checkout"),
  branchHint: document.getElementById("branch-hint"),
  targetList: document.getElementById("target-list"),
  targetHint: document.getElementById("target-hint"),
  updateDescription: document.getElementById("update-description"),
  packProduct: document.getElementById("pack-product"),
  btnBuild: document.getElementById("btn-build"),
  btnUpload: document.getElementById("btn-upload"),
  btnDistribute: document.getElementById("btn-distribute"),
  btnCancel: document.getElementById("btn-cancel"),
  log: document.getElementById("log"),
  resultPanel: document.getElementById("result-panel"),
  result: document.getElementById("result"),
  resultProductHint: document.getElementById("result-product-hint"),
  btnRefreshResult: document.getElementById("btn-refresh-result"),
};

/** @type {string | null} */
let activeRunId = null;
/** @type {AbortController | null} */
let eventsAbort = null;

const PLATFORMS = [
  { platform: "android", modes: ["debug", "release"], defaultMode: "release" },
  { platform: "ios", modes: ["debug", "release"], defaultMode: "release" },
  {
    platform: "harmony",
    modes: ["debug", "profile", "release"],
    defaultMode: "profile",
  },
];

function token() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

async function api(pathname, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  headers.Authorization = `Bearer ${token()}`;
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(pathname, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw Object.assign(new Error("Unauthorized"), { status: 401, data });
  }
  return { status: res.status, data };
}

function renderTargets() {
  el.targetList.innerHTML = "";
  for (const p of PLATFORMS) {
    const row = document.createElement("div");
    row.className = "target-row";
    const id = `t-${p.platform}`;
    row.innerHTML = `
      <label class="check-line">
        <input type="checkbox" id="${id}" data-platform="${p.platform}" checked />
        ${p.platform}
      </label>
      <select data-platform="${p.platform}">
        ${p.modes
          .map((m) => {
            const selected = m === p.defaultMode ? "selected" : "";
            return `<option value="${m}" ${selected}>${m}</option>`;
          })
          .join("")}
      </select>
    `;
    el.targetList.appendChild(row);
  }
  el.targetList.addEventListener("change", () => {
    syncTargetHint();
    refreshReadiness().catch(() => {});
  });
  syncTargetHint();
}

function selectedTargets() {
  const out = [];
  for (const box of el.targetList.querySelectorAll('input[type="checkbox"]')) {
    if (!box.checked) continue;
    const platform = box.getAttribute("data-platform");
    const select = el.targetList.querySelector(`select[data-platform="${platform}"]`);
    out.push({ platform, mode: select?.value || "debug" });
  }
  return out;
}

function isProductPack() {
  return Boolean(el.packProduct?.checked);
}

function productLabel() {
  return isProductPack() ? "当前：PRODUCT 上架包" : "当前：非 PRODUCT（测试包）";
}

function syncTargetHint() {
  const targets = selectedTargets();
  const base = targets.length
    ? targets.map((t) => `${t.platform}/${t.mode}`).join(" · ")
    : "未选择平台";
  el.targetHint.textContent = targets.length
    ? `${base} · ${isProductPack() ? "PRODUCT" : "非 PRODUCT"}`
    : base;
  syncActionHint();
}

function syncActionHint(data) {
  const parts = [productLabel()];
  if (data?.buildActive) {
    parts.push("当前有构建类 Run 进行中");
  } else if (data && !data.canBuild && !data.canUpload) {
    parts.push("当前 Target 不可构建/上传，请检查 Readiness");
  }
  if (isProductPack()) {
    parts.push("上架包将隐藏测试球并锁正式环境（TF_NET_PRODUCT=true）");
  }
  el.actionHint.textContent = parts.join(" · ");
}

function hideInstallResult() {
  el.resultPanel.classList.add("hidden");
  el.result.innerHTML = "";
  el.resultProductHint.textContent = "";
}

function showInstallResult() {
  el.resultPanel.classList.remove("hidden");
}

function applyReadiness(data) {
  el.appRoot.textContent = data.appRoot || "(未配置 App Root)";
  el.appRootInput.value = data.appRoot || "";
  el.packMeta.textContent = `packRoot: ${data.packRoot || ""}`;
  el.branchLine.textContent = data.appRootIsGit
    ? `当前 Branch：${data.branch || "(未知)"}`
    : "App Root 不是 git 仓库";
  el.branchSelect.innerHTML = "";
  for (const b of data.branches || []) {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    if (b === data.branch) opt.selected = true;
    el.branchSelect.appendChild(opt);
  }
  el.checks.innerHTML = "";
  const checks = data.checks || {};
  for (const [key, ok] of Object.entries(checks)) {
    const div = document.createElement("div");
    div.className = `check ${ok ? "ok" : "bad"}`;
    div.textContent = `${key}: ${ok ? "ok" : "no"}`;
    el.checks.appendChild(div);
  }
  syncTargetHint();
  syncActionHint(data);
  const busy = Boolean(data.buildActive);
  el.btnBuild.disabled = busy || !data.canBuild;
  el.btnDistribute.disabled = busy || !(data.canDistribute || data.canBuild);
  el.btnUpload.disabled = !data.canUpload;
  el.btnCheckout.disabled = busy;
}

async function refreshReadiness() {
  const targets = selectedTargets();
  const q =
    targets.length > 0
      ? `?targets=${encodeURIComponent(JSON.stringify(targets))}`
      : "";
  const { data } = await api(`/api/readiness${q}`);
  applyReadiness(data);
  return data;
}

async function connectEvents() {
  if (eventsAbort) eventsAbort.abort();
  eventsAbort = new AbortController();
  const res = await fetch("/api/runs/events", {
    headers: { Authorization: `Bearer ${token()}` },
    signal: eventsAbort.signal,
  });
  if (!res.ok || !res.body) {
    el.authHint.textContent = `事件流连接失败：${res.status}`;
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          handleSseBlock(part);
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        appendLog(`[events] ${err.message || err}\n`);
      }
    }
  })();
}

function handleSseBlock(block) {
  let eventType = "message";
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    if (line.startsWith("data:")) dataLine += line.slice(5).trim();
  }
  if (!dataLine) return;
  let event;
  try {
    event = JSON.parse(dataLine);
  } catch {
    return;
  }
  if (eventType === "started" || event.type === "started") {
    activeRunId = event.id;
    el.btnCancel.disabled = false;
    const productTag = event.product ? " · PRODUCT" : " · 非 PRODUCT";
    appendLog(
      `\n—— Run ${event.id} ${event.lane} ${event.summary || ""}${productTag} ——\n`
    );
    const uploadLanes = new Set(["upload_pgyer", "distribute", "distribute_debug"]);
    if (uploadLanes.has(event.lane)) {
      hideInstallResult();
    }
  } else if (eventType === "log" || event.type === "log") {
    appendLog(event.chunk || "");
  } else if (eventType === "finished" || event.type === "finished") {
    appendLog(
      `\n—— finished code=${event.code} cancelled=${event.cancelled} ——\n`
    );
    if (event.id === activeRunId) {
      activeRunId = null;
      el.btnCancel.disabled = true;
    }
    refreshReadiness().catch(() => {});
    if (!event.cancelled && event.uploads && event.uploads.length) {
      refreshResult().catch(() => {});
    }
  }
}

function appendLog(text) {
  el.log.textContent += text;
  el.log.scrollTop = el.log.scrollHeight;
}

async function startLane(lane) {
  const targets = selectedTargets();
  if (!targets.length) {
    el.actionHint.textContent = "请至少勾选一个平台";
    return;
  }
  const { status, data } = await api("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      lane,
      targets,
      updateDescription: el.updateDescription.value.trim(),
      product: Boolean(el.packProduct.checked),
    }),
  });
  if (!data.ok) {
    el.actionHint.textContent =
      status === 409
        ? data.reason || "当前有人在构建"
        : data.reason || "启动失败";
    return;
  }
  activeRunId = data.id;
  el.btnCancel.disabled = false;
  el.actionHint.textContent = "";
  await refreshReadiness();
}

async function refreshResult() {
  const { status, data } = await api("/api/upload-presentation");
  if (status === 404 || !data.ok) {
    hideInstallResult();
    return;
  }
  showInstallResult();
  el.resultProductHint.textContent = data.product
    ? "本次结果：PRODUCT 上架包"
    : "本次结果：非 PRODUCT（测试包）";
  const note = data.updateDescription
    ? `<p>Install Note：${escapeHtml(data.updateDescription)}</p>`
    : "";
  if (data.presentation === "merged" && data.mergedInstallUrl) {
    el.result.innerHTML = `
      ${note}
      <div class="result-card">
        <strong>Merged Install Page</strong>
        <p><a href="${escapeAttr(data.mergedInstallUrl)}" target="_blank" rel="noopener">${escapeHtml(
          data.mergedInstallUrl
        )}</a></p>
      </div>`;
    return;
  }
  el.result.innerHTML =
    note +
    (data.uploads || [])
      .map((u) => {
        const title = `${u.platform}/${u.mode}`;
        const qr = u.buildQRCodeURL
          ? `<img src="${escapeAttr(u.buildQRCodeURL)}" alt="QR ${escapeAttr(title)}" />`
          : "";
        const link = u.installUrl
          ? `<p><a href="${escapeAttr(u.installUrl)}" target="_blank" rel="noopener">${escapeHtml(
              u.installUrl
            )}</a></p>`
          : "";
        return `<div class="result-card"><strong>${escapeHtml(title)}</strong>${qr}${link}</div>`;
      })
      .join("");
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

async function unlockUi() {
  el.authPanel.classList.add("hidden");
  el.main.classList.remove("hidden");
  el.authHint.textContent = "";
  hideInstallResult();
  await refreshReadiness();
  await connectEvents();
}

el.btnSaveToken.addEventListener("click", async () => {
  const value = el.token.value.trim();
  if (!value) {
    el.authHint.textContent = "请输入 Access Token";
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, value);
  try {
    await api("/api/readiness");
    await unlockUi();
  } catch (err) {
    sessionStorage.removeItem(TOKEN_KEY);
    el.authHint.textContent =
      err.status === 401 ? "Token 无效" : String(err.message || err);
  }
});

el.btnSetAppRoot.addEventListener("click", async () => {
  const { data } = await api("/api/app-root", {
    method: "PUT",
    body: JSON.stringify({ appRoot: el.appRootInput.value.trim() }),
  });
  if (!data.ok) {
    el.branchHint.textContent = data.reason || "设置失败";
    return;
  }
  applyReadiness(data.readiness);
  el.branchHint.textContent = "App Root 已更新";
});

el.btnCheckout.addEventListener("click", async () => {
  const branch = el.branchSelect.value;
  const { data } = await api("/api/branch/checkout", {
    method: "POST",
    body: JSON.stringify({ branch }),
  });
  if (!data.ok) {
    el.branchHint.textContent = data.reason || "切换失败";
    return;
  }
  applyReadiness(data.readiness);
  el.branchHint.textContent = `已切换到 ${branch}`;
});

el.btnBuild.addEventListener("click", () => startLane("build"));
el.btnUpload.addEventListener("click", () => startLane("upload_pgyer"));
el.btnDistribute.addEventListener("click", () => startLane("distribute"));
el.btnCancel.addEventListener("click", async () => {
  if (!activeRunId) return;
  await api(`/api/runs/${encodeURIComponent(activeRunId)}/cancel`, {
    method: "POST",
    body: "{}",
  });
});
el.btnRefreshResult.addEventListener("click", () => refreshResult());
el.packProduct.addEventListener("change", () => {
  syncTargetHint();
});

renderTargets();
syncTargetHint();

if (token()) {
  el.token.value = token();
  unlockUi().catch((err) => {
    el.main.classList.add("hidden");
    el.authPanel.classList.remove("hidden");
    el.authHint.textContent =
      err.status === 401 ? "Token 已失效，请重新输入" : String(err.message || err);
  });
}
