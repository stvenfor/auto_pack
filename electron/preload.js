"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("autoPack", {
  getReadiness: (opts) => ipcRenderer.invoke("readiness:get", opts || {}),
  pickAppRoot: () => ipcRenderer.invoke("appRoot:pick"),
  setPgyerApiKey: (apiKey) => ipcRenderer.invoke("pgyerKey:set", apiKey),
  checkoutBranch: (branch) => ipcRenderer.invoke("branch:checkout", branch),
  startRun: (payload) => ipcRenderer.invoke("run:start", payload),
  cancelRun: (runId) => ipcRenderer.invoke("run:cancel", runId),
  openLastQr: () => ipcRenderer.invoke("qr:open-last"),
  onRunStarted: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("run:started", listener);
    return () => ipcRenderer.removeListener("run:started", listener);
  },
  onRunLog: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("run:log", listener);
    return () => ipcRenderer.removeListener("run:log", listener);
  },
  onRunFinished: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("run:finished", listener);
    return () => ipcRenderer.removeListener("run:finished", listener);
  },
});
