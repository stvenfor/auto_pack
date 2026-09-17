"use strict";

/** @type {Map<string, { id: string, lane: string, platform: string, mode: string, summary?: string, log: string, status: string }>} */
const runs = new Map();
/** Keep running runs + only the latest finished one. */
const MAX_FINISHED_RUNS = 1;
let activeRunId = null;
let readiness = null;
let suppressBranchChange = false;
/** @type {"focus" | "all"} */
let logMode = "focus";

const { buildLogView } = window.AutoPackLogFilter;

const el = {
  appRoot: document.getElementById("app-root"),
  packRoot: document.getElementById("pack-root"),
  flutterBin: document.getElementById("flutter-bin"),
  checks: document.getElementById("checks"),
  keyHint: document.getElementById("key-hint"),
  pgyerApiKey: document.getElementById("pgyer-api-key"),
  savePgyerKey: document.getElementById("save-pgyer-key"),
  actionHint: document.getElementById("action-hint"),
  targetHint: document.getElementById("target-hint"),
  branchHint: document.getElementById("branch-hint"),
  branchSelect: document.getElementById("branch-select"),
  targetList: document.getElementById("target-list"),
  updateDescription: document.getElementById("update-description"),
  packProduct: document.getElementById("pack-product"),
  passwordInstall: document.getElementById("pgyer-password-install"),
  passwordField: document.getElementById("pgyer-password-field"),
  passwordInput: document.getElementById("pgyer-password"),
  passwordHint: document.getElementById("pgyer-password-hint"),
  btnBuild: document.getElementById("btn-build"),
  btnUpload: document.getElementById("btn-upload"),
  btnDistribute: document.getElementById("btn-distribute"),
  runTabs: document.getElementById("run-tabs"),
  log: document.getElementById("log"),
  logMeta: document.getElementById("log-meta"),
  cancel: document.getElementById("cancel-run"),
};

const statusLabel = {
  running: "进行中",
  ok: "成功",
  failed: "失败",
  cancelled: "已取消",
};

const EXT = {
  android: { debug: "apk", release: "apk" },
  ios: { debug: "ipa", release: "ipa" },
  harmony: { debug: "hap", release: "app", profile: "hap" },
};

function selectedTargets() {
  const rows = el.targetList.querySelectorAll(".target-row-pick");
  const out = [];
  for (const row of rows) {
    const box = row.querySelector('input[type="checkbox"]');
    if (!box?.checked) continue;
    const platform = box.getAttribute("data-platform");
    const modeSelect = row.querySelector("select");
    out.push({ platform, mode: modeSelect?.value || "debug" });
  }
  return out;
}

function isProductPack() {
  return Boolean(el.packProduct?.checked);
}

function isPasswordInstall() {
  return Boolean(el.passwordInstall?.checked);
}

function installTypeForRun() {
  return isPasswordInstall() ? "2" : "1";
}

function passwordForRun() {
  if (!isPasswordInstall()) return "";
  return (el.passwordInput?.value || "").trim();
}

/** Effective password available for upload (UI or .env default). */
function hasEffectivePassword(data) {
  if (!isPasswordInstall()) return true;
  if (passwordForRun()) return true;
  return Boolean(data?.pgyerPasswordConfigured);
}

function syncPasswordInstallUi(data) {
  const passwordOn = isPasswordInstall();
  if (el.passwordInput) {
    el.passwordInput.disabled = !passwordOn;
  }
  if (el.passwordField) {
    el.passwordField.classList.toggle("is-disabled", !passwordOn);
  }
  if (el.passwordInput) {
    el.passwordInput.placeholder = passwordOn
      ? data?.pgyerPasswordConfigured
        ? "空=用 .env 默认"
        : "需填写或配置 .env"
      : "公开安装";
  }
  if (el.passwordHint) {
    if (!passwordOn) {
      el.passwordHint.textContent = "公开安装 · 密码无效";
    } else if (data?.pgyerPasswordConfigured) {
      el.passwordHint.textContent = "已配置 .env 默认 · 留空则用默认";
    } else {
      el.passwordHint.textContent = "未配置 .env 默认 · 请填写或改公开";
    }
  }
}

function syncTargetHint() {
  const targets = selectedTargets();
  if (!targets.length) {
    el.targetHint.textContent = "未选择平台";
    return;
  }
  const names = targets
    .map((t) => {
      const ext = EXT[t.platform]?.[t.mode] || "?";
      const name = `${t.platform}-${t.mode}.${ext}`;
      if (t.platform === "ios") {
        return `${name} · ad-hoc`;
      }
      return name;
    })
    .join(" · ");
  el.targetHint.textContent = isProductPack() ? `${names} · PRODUCT` : names;
}

function syncActionHint(data) {
  const targets = selectedTargets();
  const onlyHarmonyRelease =
    targets.length > 0 &&
    targets.every((t) => t.platform === "harmony" && t.mode === "release");

  let hint = "";
  if (!targets.length) {
    hint = "请至少勾选一个平台";
  } else if (onlyHarmonyRelease && data.canBuild && !data.canUpload) {
    hint = "所选均为 Harmony release（.app）：可构建，不能上传蒲公英";
  } else if (!data.canUpload && data.checks && !data.checks.pgyerApiKey) {
    hint = "未配置蒲公英 Key，无法上传";
  } else if (isPasswordInstall() && !hasEffectivePassword(data)) {
    hint =
      "密码安装已开启但无密码：请填写或配置 PGYER_PASSWORD，或取消勾选改为公开";
  }

  if (isProductPack()) {
    const productHint =
      "上架包 PRODUCT：隐藏测试球并锁正式环境（TF_NET_PRODUCT=true）";
    hint = hint ? `${productHint} · ${hint}` : productHint;
  }

  el.actionHint.textContent = hint;
}

function syncModeEnabled() {
  for (const row of el.targetList.querySelectorAll(".target-row-pick")) {
    const box = row.querySelector('input[type="checkbox"]');
    const select = row.querySelector("select");
    if (select) select.disabled = !box?.checked;
  }
}

function syncLogModeButtons() {
  for (const btn of document.querySelectorAll(".log-filter-btn")) {
    const mode = btn.getAttribute("data-log-mode");
    btn.classList.toggle("active", mode === logMode);
  }
}

function renderBranchSelect(data) {
  suppressBranchChange = true;
  el.branchSelect.innerHTML = "";
  const branches = data.branches || [];
  if (!data.appRootIsGit || branches.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = data.appRootIsGit ? "无本地分支" : "非 git 仓库";
    el.branchSelect.appendChild(opt);
    el.branchSelect.disabled = true;
    el.branchHint.textContent = data.appRootIsGit
      ? ""
      : "非 git，不可切分支";
  } else {
    for (const name of branches) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === data.branch) opt.selected = true;
      el.branchSelect.appendChild(opt);
    }
    el.branchSelect.disabled = Boolean(data.buildActive);
    el.branchHint.textContent = data.buildActive
      ? "构建中，暂不可切分支"
      : "";
  }
  suppressBranchChange = false;
}

function renderReadiness(data) {
  readiness = data;
  el.appRoot.textContent = data.appRoot;
  el.appRoot.title = data.appRoot || "";
  el.packRoot.textContent = data.packRoot;
  el.packRoot.title = data.packRoot || "";
  el.flutterBin.textContent = data.flutterBin;
  el.flutterBin.title = data.flutterBin || "";
  el.keyHint.textContent = data.checks.pgyerApiKey
    ? data.mergedInstallUrlConfigured
      ? "Key 已配 · 合并页已配"
      : "Key 已配（空保存不改）"
    : "Key 未配";

  // Initial checkbox follows .env default (until user toggles this session).
  if (
    el.passwordInstall &&
    !el.passwordInstall.dataset.userTouched &&
    (data.pgyerInstallType === "1" || data.pgyerInstallType === "2")
  ) {
    el.passwordInstall.checked = data.pgyerInstallType !== "1";
  }

  renderBranchSelect(data);
  syncTargetHint();
  syncModeEnabled();
  syncPasswordInstallUi(data);

  const labels = {
    appRoot: "App Root",
    flutter: "Flutter",
    artifacts: "artifacts",
    fastlane: "Fastlane",
    pgyerApiKey: "蒲公英 Key",
    platformDir: "平台目录",
    git: "Git",
  };

  el.checks.innerHTML = "";
  for (const [key, label] of Object.entries(labels)) {
    if (data.checks[key] === undefined) continue;
    const li = document.createElement("li");
    const ok = data.checks[key];
    li.className = ok ? "ok" : "bad";
    li.title = ok ? `通过 · ${label}` : `未通过 · ${label}`;
    const dot = document.createElement("span");
    dot.className = "check-dot";
    dot.setAttribute("aria-hidden", "true");
    li.appendChild(dot);
    li.appendChild(document.createTextNode(label));
    el.checks.appendChild(li);
  }

  if (Array.isArray(data.targets)) {
    for (const t of data.targets) {
      const li = document.createElement("li");
      const uploadNote = t.canUpload ? "可上传" : "仅构建";
      li.className = t.canBuild ? "ok" : "bad";
      const label = `${t.platform}/${t.mode}`;
      li.title = `${t.canBuild ? "就绪" : "不可用"} · ${label}（${uploadNote}）`;
      const dot = document.createElement("span");
      dot.className = "check-dot";
      dot.setAttribute("aria-hidden", "true");
      li.appendChild(dot);
      li.appendChild(document.createTextNode(`${label} · ${uploadNote}`));
      el.checks.appendChild(li);
    }
  }

  const uploadOk = data.canUpload && hasEffectivePassword(data);
  el.btnBuild.disabled = !data.canBuild;
  el.btnUpload.disabled = !uploadOk;
  el.btnDistribute.disabled = !(
    (data.canDistribute || (data.canBuild && data.canUpload)) &&
    (!data.canUpload || hasEffectivePassword(data))
  );

  syncActionHint(data);
}

/** Drop older finished runs so the tab strip only keeps the latest record. */
function pruneRuns() {
  const finished = [...runs.values()].filter((r) => r.status !== "running");
  const dropCount = Math.max(0, finished.length - MAX_FINISHED_RUNS);
  if (!dropCount) return;

  const toDrop = new Set(finished.slice(0, dropCount).map((r) => r.id));
  for (const id of toDrop) {
    runs.delete(id);
  }

  if (activeRunId && toDrop.has(activeRunId)) {
    const remaining = [...runs.keys()];
    activeRunId = remaining.length ? remaining[remaining.length - 1] : null;
  }
}

function renderTabs() {
  pruneRuns();
  el.runTabs.innerHTML = "";
  for (const run of runs.values()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `run-tab${run.id === activeRunId ? " active" : ""}`;
    btn.setAttribute("data-status", run.status);
    const st = statusLabel[run.status] || run.status;
    const who = run.summary || `${run.platform}/${run.mode}`;
    const dot = document.createElement("span");
    dot.className = "run-tab-dot";
    dot.setAttribute("aria-hidden", "true");
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(`${run.lane} ${who} · ${st}`));
    btn.addEventListener("click", () => {
      activeRunId = run.id;
      renderTabs();
      renderLog();
    });
    el.runTabs.appendChild(btn);
  }
  const active = activeRunId ? runs.get(activeRunId) : null;
  el.cancel.disabled = !(active && active.status === "running");
}

function renderLog() {
  const run = activeRunId ? runs.get(activeRunId) : null;
  if (!run) {
    el.log.textContent = "";
    if (el.logMeta) el.logMeta.textContent = "";
    return;
  }

  const view = buildLogView(run.log, logMode);
  el.log.innerHTML = view.html;
  if (el.logMeta) {
    if (logMode === "focus" && view.hidden > 0) {
      el.logMeta.textContent = `显示 ${view.shown} / ${view.total} 行 · 已隐藏 ${view.hidden} 条噪声`;
    } else if (view.total > 0) {
      el.logMeta.textContent = `${view.total} 行`;
    } else {
      el.logMeta.textContent = "";
    }
  }
  el.log.scrollTop = el.log.scrollHeight;
}

async function loadReadiness() {
  const data = await window.autoPack.getReadiness({
    targets: selectedTargets(),
  });
  renderReadiness(data);
}

document.getElementById("refresh").addEventListener("click", () => {
  loadReadiness().catch((err) => {
    el.actionHint.textContent = String(err);
  });
});

document.getElementById("pick-app-root").addEventListener("click", async () => {
  const result = await window.autoPack.pickAppRoot();
  if (result.ok) {
    await loadReadiness();
  }
});

el.savePgyerKey?.addEventListener("click", async () => {
  const value = el.pgyerApiKey?.value ?? "";
  const result = await window.autoPack.setPgyerApiKey(value);
  if (!result.ok) {
    el.keyHint.textContent = result.reason || "保存失败";
    return;
  }
  if (el.pgyerApiKey) el.pgyerApiKey.value = "";
  if (result.readiness) {
    renderReadiness(result.readiness);
  } else {
    await loadReadiness();
  }
  el.keyHint.textContent = result.wrote
    ? "已写入 .env"
    : result.configured
      ? "未改动（输入为空）"
      : "仍未配置";
});

for (const btn of document.querySelectorAll(".log-filter-btn")) {
  btn.addEventListener("click", () => {
    const mode = btn.getAttribute("data-log-mode");
    if (mode !== "focus" && mode !== "all") return;
    logMode = mode;
    syncLogModeButtons();
    renderLog();
  });
}

el.targetList.addEventListener("change", () => {
  syncModeEnabled();
  syncTargetHint();
  loadReadiness().catch((err) => {
    el.actionHint.textContent = String(err);
  });
});

el.packProduct?.addEventListener("change", () => {
  syncTargetHint();
  if (readiness) {
    syncActionHint(readiness);
  }
});

el.passwordInstall?.addEventListener("change", () => {
  if (el.passwordInstall) el.passwordInstall.dataset.userTouched = "1";
  syncPasswordInstallUi(readiness || {});
  if (readiness) {
    renderReadiness(readiness);
  }
});

el.passwordInput?.addEventListener("input", () => {
  if (readiness) {
    renderReadiness(readiness);
  }
});

el.branchSelect.addEventListener("change", async () => {
  if (suppressBranchChange) return;
  const branch = el.branchSelect.value;
  if (!branch) return;
  el.branchHint.textContent = `正在切换到 ${branch}…`;
  const result = await window.autoPack.checkoutBranch(branch);
  if (!result.ok) {
    el.actionHint.textContent = result.reason || "切分支失败";
    await loadReadiness();
    return;
  }
  el.actionHint.textContent = "";
  await loadReadiness();
});

for (const btn of [el.btnBuild, el.btnUpload, el.btnDistribute]) {
  btn.addEventListener("click", async () => {
    const lane = btn.getAttribute("data-lane");
    const targets = selectedTargets();
    el.actionHint.textContent = "";
    if (!targets.length) {
      el.actionHint.textContent = "请至少勾选一个平台";
      return;
    }
    const result = await window.autoPack.startRun({
      lane,
      targets,
      updateDescription: (el.updateDescription?.value || "").trim(),
      installType: installTypeForRun(),
      password: passwordForRun(),
      product: isProductPack(),
    });
    if (!result.ok) {
      el.actionHint.textContent = result.reason || "无法启动 Run";
    } else {
      await loadReadiness();
    }
  });
}

el.cancel.addEventListener("click", async () => {
  if (!activeRunId) return;
  await window.autoPack.cancelRun(activeRunId);
  await loadReadiness();
});

window.autoPack.onRunStarted(({ id, lane, platform, mode, summary, targets, product }) => {
  const baseSummary =
    summary ||
    (Array.isArray(targets)
      ? targets.map((t) => `${t.platform}/${t.mode}`).join(", ")
      : "");
  runs.set(id, {
    id,
    lane,
    platform: platform || "android",
    mode: mode || "debug",
    summary: product ? `${baseSummary} · PRODUCT` : baseSummary,
    log: "",
    status: "running",
  });
  activeRunId = id;
  renderTabs();
  renderLog();
  loadReadiness().catch(() => {});
});

window.autoPack.onRunLog(({ id, chunk }) => {
  const run = runs.get(id);
  if (!run) return;
  run.log += chunk;
  if (id === activeRunId) renderLog();
});

window.autoPack.onRunFinished(({ id, code, signal, cancelled }) => {
  const run = runs.get(id);
  if (!run) return;
  if (cancelled) {
    run.status = "cancelled";
    run.log += "\n[cancelled]\n";
  } else if (code === 0) {
    run.status = "ok";
    run.log += `\n[exit ${code}]\n`;
  } else {
    run.status = "failed";
    run.log += `\n[exit ${code}${signal ? ` signal ${signal}` : ""}]\n`;
  }
  renderTabs();
  renderLog();
  loadReadiness().catch(() => {});
});

syncModeEnabled();
syncTargetHint();
syncLogModeButtons();
renderLog();
loadReadiness().catch((err) => {
  el.actionHint.textContent = String(err);
});
