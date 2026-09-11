"use strict";

/** @type {Map<string, { id: string, lane: string, platform: string, mode: string, summary?: string, log: string, status: string }>} */
const runs = new Map();
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
  actionHint: document.getElementById("action-hint"),
  targetHint: document.getElementById("target-hint"),
  branchHint: document.getElementById("branch-hint"),
  branchSelect: document.getElementById("branch-select"),
  targetList: document.getElementById("target-list"),
  updateDescription: document.getElementById("update-description"),
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

function syncTargetHint() {
  const targets = selectedTargets();
  if (!targets.length) {
    el.targetHint.textContent = "未选择平台";
    return;
  }
  el.targetHint.textContent = targets
    .map((t) => {
      const ext = EXT[t.platform]?.[t.mode] || "?";
      const name = `${t.platform}-${t.mode}.${ext}`;
      if (t.platform === "ios") {
        return `${name} · ad-hoc`;
      }
      return name;
    })
    .join(" · ");
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
      : "App Root 不是 git 仓库，无法切分支";
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
      ? "构建进行中，暂不可切分支"
      : "选择后立刻 checkout（工作区须干净）";
  }
  suppressBranchChange = false;
}

function renderReadiness(data) {
  readiness = data;
  el.appRoot.textContent = data.appRoot;
  el.packRoot.textContent = data.packRoot;
  el.flutterBin.textContent = data.flutterBin;
  el.keyHint.textContent = data.checks.pgyerApiKey
    ? data.mergedInstallUrlConfigured
      ? "蒲公英 Key：已配置 · 合并安装页：已配置"
      : "蒲公英 Key：已配置"
    : "蒲公英 Key：未配置（请编辑 auto_pack/.env）";

  renderBranchSelect(data);
  syncTargetHint();
  syncModeEnabled();

  const labels = {
    appRoot: "App Root",
    flutter: "Flutter (FVM)",
    artifacts: "artifacts 可写",
    fastlane: "Fastlane",
    pgyerApiKey: "蒲公英 Key",
    platformDir: "所选平台目录",
    git: "Git 仓库",
  };

  el.checks.innerHTML = "";
  for (const [key, label] of Object.entries(labels)) {
    if (data.checks[key] === undefined) continue;
    const li = document.createElement("li");
    const ok = data.checks[key];
    li.className = ok ? "ok" : "bad";
    li.textContent = `${ok ? "通过" : "未通过"} · ${label}`;
    el.checks.appendChild(li);
  }

  if (Array.isArray(data.targets)) {
    for (const t of data.targets) {
      const li = document.createElement("li");
      const uploadNote = t.canUpload ? "可上传" : "仅构建";
      li.className = t.canBuild ? "ok" : "bad";
      li.textContent = `${t.canBuild ? "就绪" : "不可用"} · ${t.platform}/${t.mode}（${uploadNote}）`;
      el.checks.appendChild(li);
    }
  }

  el.btnBuild.disabled = !data.canBuild;
  el.btnUpload.disabled = !data.canUpload;
  el.btnDistribute.disabled = !(
    data.canDistribute ||
    (data.canBuild && data.canUpload)
  );

  const targets = selectedTargets();
  const onlyHarmonyRelease =
    targets.length > 0 &&
    targets.every((t) => t.platform === "harmony" && t.mode === "release");
  if (!targets.length) {
    el.actionHint.textContent = "请至少勾选一个平台";
  } else if (onlyHarmonyRelease && data.canBuild && !data.canUpload) {
    el.actionHint.textContent =
      "所选均为 Harmony release（.app）：可构建，不能上传蒲公英";
  } else if (!data.canUpload && data.checks && !data.checks.pgyerApiKey) {
    el.actionHint.textContent = "未配置蒲公英 Key，无法上传";
  } else {
    el.actionHint.textContent = "";
  }
}

function renderTabs() {
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

window.autoPack.onRunStarted(({ id, lane, platform, mode, summary, targets }) => {
  runs.set(id, {
    id,
    lane,
    platform: platform || "android",
    mode: mode || "debug",
    summary:
      summary ||
      (Array.isArray(targets)
        ? targets.map((t) => `${t.platform}/${t.mode}`).join(", ")
        : ""),
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
