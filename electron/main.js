"use strict";

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const { ConsoleControl, UPLOAD_LANES } = require("../src/lib/console-control");
const {
  resolvePackRoot,
  resolveBundlePackRoot,
  ensurePackRootReady,
} = require("../src/lib/pack-root");
const {
  writeLastUpload,
  platformLabel,
  modeLabel,
} = require("../src/lib/upload-result");

const PACK_ROOT = resolvePackRoot({
  isPackaged: app.isPackaged,
  userDataPath: app.getPath("userData"),
  resourcesPath: process.resourcesPath,
  electronDirname: __dirname,
});
ensurePackRootReady(PACK_ROOT, {
  bundlePackRoot: app.isPackaged
    ? resolveBundlePackRoot(process.resourcesPath)
    : undefined,
});

let mainWindow = null;
/** @type {BrowserWindow | null} */
let qrWindow = null;

/** @type {ConsoleControl} */
const control = new ConsoleControl({
  packRoot: PACK_ROOT,
  onEvent: (event) => {
    if (event.type === "started") {
      send("run:started", event);
    } else if (event.type === "log") {
      send("run:log", event);
    } else if (event.type === "finished") {
      send("run:finished", event);
      if (
        !event.cancelled &&
        UPLOAD_LANES.has(event.lane) &&
        event.uploads &&
        event.uploads.length
      ) {
        try {
          openUploadQrWindow({
            updateDescription: "",
            product: event.product,
          });
        } catch (err) {
          send("run:log", {
            id: event.id,
            stream: "stderr",
            chunk: `\n[qr] failed to open: ${err.message || err}\n`,
          });
        }
      }
    }
  },
});

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function openUploadQrWindow(fallback = {}) {
  const presentation = control.getUploadPresentation();
  if (!presentation.ok) {
    return presentation;
  }

  const note =
    presentation.updateDescription || fallback.updateDescription || "";
  const product = Boolean(presentation.product ?? fallback.product ?? false);
  const merged = presentation.mergedInstallUrl || "";
  const uploads = presentation.uploads || [];

  const { htmlPath, payload } = writeLastUpload(PACK_ROOT, {
    uploads,
    updateDescription: note,
    mergedInstallUrl: merged,
    product,
  });

  const titleBase = merged
    ? "合并安装页"
    : uploads.length > 1
      ? "多平台安装"
      : `${platformLabel(payload.platform)} · ${modeLabel(payload.mode)}`;
  const title = product ? `${titleBase} · PRODUCT` : titleBase;

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
  return control.getReadiness(opts);
});

ipcMain.handle("appRoot:pick", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select App Root",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, cancelled: true };
  }
  return control.setAppRoot(result.filePaths[0]);
});

ipcMain.handle("pgyerKey:set", (_event, apiKey) => {
  return control.setPgyerApiKey(apiKey);
});

ipcMain.handle("branch:checkout", (_event, branchName) => {
  return control.checkoutBranch(branchName);
});

ipcMain.handle("run:start", (_event, payload) => {
  return control.startRun(payload);
});

ipcMain.handle("qr:open-last", () => {
  try {
    return openUploadQrWindow();
  } catch (err) {
    return { ok: false, reason: String(err.message || err) };
  }
});

ipcMain.handle("run:cancel", (_event, runId) => {
  return control.cancelRun(runId);
});
