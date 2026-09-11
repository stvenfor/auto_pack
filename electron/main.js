"use strict";

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const { assessReadiness } = require("../src/lib/readiness");
const { gatherProbes, resolveAppRoot } = require("../src/lib/probe");
const { writeAppRoot } = require("../src/lib/env");
const { RunScheduler } = require("../src/lib/run-scheduler");
const {
  listLocalBranches,
  currentBranch,
  checkout,
  isGitRepo,
} = require("../src/lib/git");
const { normalizeTargets, targetsSummary } = require("../src/lib/targets");
const { startCompositeRun } = require("../src/lib/composite-run");
const {
  readLastUpload,
  writeLastUpload,
  readMergedInstallUrl,
  platformLabel,
  modeLabel,
} = require("../src/lib/upload-result");

const PACK_ROOT = path.resolve(__dirname, "..");
const scheduler = new RunScheduler();
/** @type {Map<string, { cancel: () => void }>} */
const processes = new Map();
const UPLOAD_LANES = new Set(["upload_pgyer", "distribute", "distribute_debug"]);

let mainWindow = null;
/** @type {BrowserWindow | null} */
let qrWindow = null;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function openUploadQrWindow(fallback = {}) {
  const saved = readLastUpload(PACK_ROOT) || {};
  const note =
    saved.updateDescription ||
    fallback.updateDescription ||
    "";
  const merged =
    saved.mergedInstallUrl ||
    readMergedInstallUrl(PACK_ROOT) ||
    "";
  const uploads =
    Array.isArray(saved.uploads) && saved.uploads.length
      ? saved.uploads
      : saved.platform || fallback.platform
        ? [
            {
              platform: saved.platform || fallback.platform || "android",
              mode: saved.mode || fallback.mode || "debug",
              buildName: saved.buildName || "",
              buildVersion: saved.buildVersion || "",
              buildVersionNo: saved.buildVersionNo || "",
              installUrl: saved.installUrl || "",
              buildQRCodeURL: saved.buildQRCodeURL || "",
            },
          ]
        : [];

  if (!merged && !uploads.some((u) => u.buildQRCodeURL || u.installUrl)) {
    return { ok: false, reason: "No QR / install URL in last upload result." };
  }

  const { htmlPath, payload } = writeLastUpload(PACK_ROOT, {
    uploads,
    updateDescription: note,
    mergedInstallUrl: merged,
  });

  const title = merged
    ? "合并安装页"
    : uploads.length > 1
      ? "多平台安装"
      : `${platformLabel(payload.platform)} · ${modeLabel(payload.mode)}`;

  if (qrWindow && !qrWindow.isDestroyed()) {
    qrWindow.close();
  }

  qrWindow = new BrowserWindow({
    width: uploads.length > 1 && !merged ? 900 : 480,
    height: 680,
    minWidth: 360,
    minHeight: 480,
    title: `${title} — 安装二维码`,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  qrWindow.on("closed", () => {
    qrWindow = null;
  });
  qrWindow.loadFile(htmlPath);
  return { ok: true, htmlPath, title };
}

function refreshReadiness(opts = {}) {
  const probes = gatherProbes(PACK_ROOT);
  const readiness = assessReadiness(probes, opts);
  let branch = null;
  let branches = [];
  if (probes.appRootIsGit) {
    try {
      branch = currentBranch(probes.appRoot);
      branches = listLocalBranches(probes.appRoot);
    } catch (err) {
      branch = null;
      branches = [];
    }
  }
  return {
    packRoot: PACK_ROOT,
    appRoot: probes.appRoot,
    flutterBin: probes.flutterBin,
    appRootIsGit: Boolean(probes.appRootIsGit),
    platformDirs: probes.platformDirs,
    branch,
    branches,
    buildActive: scheduler.hasActiveBuild(),
    mergedInstallUrlConfigured: Boolean(readMergedInstallUrl(PACK_ROOT)),
    ...readiness,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    title: "Auto Pack",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("readiness:get", (_event, opts = {}) => {
  return refreshReadiness(opts);
});

ipcMain.handle("appRoot:pick", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select App Root",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, cancelled: true };
  }
  const chosen = result.filePaths[0];
  writeAppRoot(path.join(PACK_ROOT, ".env"), chosen);
  return { ok: true, readiness: refreshReadiness() };
});

ipcMain.handle("branch:checkout", (_event, branchName) => {
  if (scheduler.hasActiveBuild()) {
    return {
      ok: false,
      reason: "Cannot switch branch while a build Run is active.",
    };
  }
  const appRoot = resolveAppRoot(PACK_ROOT);
  if (!isGitRepo(appRoot)) {
    return { ok: false, reason: "App Root is not a git repository." };
  }
  try {
    const result = checkout(appRoot, branchName);
    return { ok: true, ...result, readiness: refreshReadiness() };
  } catch (err) {
    return { ok: false, reason: String(err.message || err) };
  }
});

ipcMain.handle("run:start", (_event, payload) => {
  const lane = typeof payload === "string" ? payload : payload?.lane;
  const updateDescription =
    typeof payload === "object" && payload
      ? String(payload.updateDescription || "").trim()
      : "";

  let targets;
  try {
    if (typeof payload === "object" && Array.isArray(payload.targets)) {
      targets = normalizeTargets(payload.targets);
    } else {
      targets = normalizeTargets([
        {
          platform:
            typeof payload === "object" && payload
              ? payload.platform
              : "android",
          mode:
            typeof payload === "object" && payload ? payload.mode : "debug",
        },
      ]);
    }
  } catch (err) {
    return { ok: false, reason: String(err.message || err) };
  }

  const readiness = refreshReadiness({ targets });

  if (lane === "upload_pgyer") {
    if (!readiness.canUpload) {
      return { ok: false, reason: "Upload blocked: no selected Target can upload." };
    }
  }
  if ((lane === "build" || lane === "build_debug") && !readiness.canBuild) {
    return { ok: false, reason: "Build blocked: Readiness canBuild is false." };
  }
  if (lane === "distribute" || lane === "distribute_debug") {
    if (!readiness.canDistribute && !(readiness.canBuild && readiness.canUpload)) {
      return {
        ok: false,
        reason:
          "Distribute blocked: need all selected Targets buildable, and at least one uploadable (or all upload-skippable).",
      };
    }
    // Prefer all-buildable: if some can't build, block
    if (!readiness.targets.every((t) => t.canBuild)) {
      return {
        ok: false,
        reason: "Distribute blocked: every selected Target must be buildable.",
      };
    }
  }

  const slot = scheduler.start(lane);
  if (!slot.ok) return slot;

  const runId = slot.id;
  const summary = targetsSummary(targets);
  send("run:started", {
    id: runId,
    lane,
    targets,
    platform: targets[0].platform,
    mode: targets[0].mode,
    summary,
  });

  const batch = startCompositeRun({
    packRoot: PACK_ROOT,
    lane,
    targets,
    updateDescription,
    onLog: (chunk) => send("run:log", { id: runId, stream: "stdout", chunk }),
    onTargetStart: () => {},
  });
  processes.set(runId, batch);

  batch.done.then((result) => {
    processes.delete(runId);
    scheduler.finish(runId);
    send("run:finished", {
      id: runId,
      lane,
      targets,
      platform: targets[0].platform,
      mode: targets[0].mode,
      code: result.cancelled ? null : result.code,
      signal: result.signal,
      cancelled: Boolean(result.cancelled),
    });
    if (
      !result.cancelled &&
      result.code === 0 &&
      UPLOAD_LANES.has(lane) &&
      result.uploads &&
      result.uploads.length
    ) {
      try {
        openUploadQrWindow({ updateDescription });
      } catch (err) {
        send("run:log", {
          id: runId,
          stream: "stderr",
          chunk: `\n[qr] failed to open: ${err.message || err}\n`,
        });
      }
    }
  });

  return { ok: true, id: runId };
});

ipcMain.handle("qr:open-last", () => {
  try {
    return openUploadQrWindow();
  } catch (err) {
    return { ok: false, reason: String(err.message || err) };
  }
});

ipcMain.handle("run:cancel", (_event, runId) => {
  const handle = processes.get(runId);
  if (!handle) {
    return { ok: false, reason: `Unknown Run: ${runId}` };
  }
  handle.cancel();
  return { ok: true };
});
