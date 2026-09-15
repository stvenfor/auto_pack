"use strict";

const path = require("node:path");
const { assessReadiness } = require("./readiness");
const { gatherProbes, resolveAppRoot } = require("./probe");
const { writeAppRoot, writePgyerApiKey } = require("./env");
const { RunScheduler, BUILD_LANES } = require("./run-scheduler");
const {
  listLocalBranches,
  currentBranch,
  checkout,
  isGitRepo,
} = require("./git");
const { normalizeTargets, targetsSummary } = require("./targets");
const { startCompositeRun } = require("./composite-run");
const {
  readLastUpload,
  readMergedInstallUrl,
} = require("./upload-result");
const { BuildRunLock } = require("./build-run-lock");

const UPLOAD_LANES = new Set(["upload_pgyer", "distribute", "distribute_debug"]);

/**
 * Shared Console control surface for Electron IPC and the HTTP Agent.
 */
class ConsoleControl {
  /**
   * @param {object} opts
   * @param {string} opts.packRoot
   * @param {(e: object) => void} [opts.onEvent]
   * @param {typeof gatherProbes} [opts.gatherProbesFn]
   * @param {typeof assessReadiness} [opts.assessReadinessFn]
   * @param {typeof startCompositeRun} [opts.startCompositeRunFn]
   * @param {BuildRunLock} [opts.buildLock]
   * @param {RunScheduler} [opts.scheduler]
   */
  constructor(opts) {
    this.packRoot = opts.packRoot;
    this.onEvent = opts.onEvent || (() => {});
    this.gatherProbesFn = opts.gatherProbesFn || gatherProbes;
    this.assessReadinessFn = opts.assessReadinessFn || assessReadiness;
    this.startCompositeRunFn = opts.startCompositeRunFn || startCompositeRun;
    this.scheduler = opts.scheduler || new RunScheduler();
    this.buildLock = opts.buildLock || new BuildRunLock(opts.packRoot);
    /** @type {Map<string, { cancel: () => void }>} */
    this._processes = new Map();
  }

  dispose() {
    for (const [id, handle] of this._processes) {
      try {
        handle.cancel();
      } catch {
        // ignore
      }
      this.scheduler.finish(id);
    }
    this._processes.clear();
    this.buildLock.release();
  }

  /**
   * @param {object} [opts]
   */
  getReadiness(opts = {}) {
    const probes = this.gatherProbesFn(this.packRoot);
    const readiness = this.assessReadinessFn(probes, opts);
    let branch = null;
    let branches = [];
    if (probes.appRootIsGit) {
      try {
        branch = currentBranch(probes.appRoot);
        branches = listLocalBranches(probes.appRoot);
      } catch {
        branch = null;
        branches = [];
      }
    }
    return {
      packRoot: this.packRoot,
      appRoot: probes.appRoot,
      flutterBin: probes.flutterBin,
      appRootIsGit: Boolean(probes.appRootIsGit),
      platformDirs: probes.platformDirs,
      branch,
      branches,
      buildActive:
        this.scheduler.hasActiveBuild() || this.buildLock.isHeldByOther(),
      mergedInstallUrlConfigured: Boolean(readMergedInstallUrl(this.packRoot)),
      ...readiness,
    };
  }

  /**
   * @param {string} appRootPath
   */
  setAppRoot(appRootPath) {
    const chosen = String(appRootPath || "").trim();
    if (!chosen) {
      return { ok: false, reason: "App Root path is required." };
    }
    if (!path.isAbsolute(chosen)) {
      return { ok: false, reason: "App Root must be an absolute path." };
    }
    writeAppRoot(path.join(this.packRoot, ".env"), chosen);
    return { ok: true, readiness: this.getReadiness() };
  }

  /**
   * Persist PGYER_API_KEY when non-empty. Empty input leaves .env unchanged.
   * @param {string} apiKey
   */
  setPgyerApiKey(apiKey) {
    const envPath = path.join(this.packRoot, ".env");
    const result = writePgyerApiKey(envPath, apiKey);
    return {
      ok: true,
      wrote: result.wrote,
      configured: result.configured,
      readiness: this.getReadiness(),
    };
  }

  /**
   * @param {string} branchName
   */
  checkoutBranch(branchName) {
    if (this.scheduler.hasActiveBuild() || this.buildLock.isHeldByOther()) {
      return {
        ok: false,
        reason: "Cannot switch branch while a build Run is active.",
      };
    }
    const appRoot = resolveAppRoot(this.packRoot);
    if (!isGitRepo(appRoot)) {
      return { ok: false, reason: "App Root is not a git repository." };
    }
    try {
      const result = checkout(appRoot, branchName);
      return { ok: true, ...result, readiness: this.getReadiness() };
    } catch (err) {
      return { ok: false, reason: String(err.message || err) };
    }
  }

  /**
   * @param {string | object} payload
   */
  startRun(payload) {
    const lane = typeof payload === "string" ? payload : payload?.lane;
    const updateDescription =
      typeof payload === "object" && payload
        ? String(payload.updateDescription || "").trim()
        : "";
    const product =
      typeof payload === "object" && payload
        ? Boolean(payload.product)
        : false;

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

    const readiness = this.getReadiness({ targets });

    if (lane === "upload_pgyer") {
      if (!readiness.canUpload) {
        return {
          ok: false,
          reason: "Upload blocked: no selected Target can upload.",
        };
      }
    }
    if ((lane === "build" || lane === "build_debug") && !readiness.canBuild) {
      return { ok: false, reason: "Build blocked: Readiness canBuild is false." };
    }
    if (lane === "distribute" || lane === "distribute_debug") {
      if (
        !readiness.canDistribute &&
        !(readiness.canBuild && readiness.canUpload)
      ) {
        return {
          ok: false,
          reason:
            "Distribute blocked: need all selected Targets buildable, and at least one uploadable (or all upload-skippable).",
        };
      }
      if (!readiness.targets.every((t) => t.canBuild)) {
        return {
          ok: false,
          reason: "Distribute blocked: every selected Target must be buildable.",
        };
      }
    }

    if (BUILD_LANES.has(lane) && this.buildLock.isHeldByOther()) {
      return {
        ok: false,
        code: "build_busy",
        reason:
          "A build Run is already active (build / distribute are mutually exclusive).",
      };
    }

    const slot = this.scheduler.start(lane);
    if (!slot.ok) {
      return { ...slot, code: slot.code || "build_busy" };
    }

    const runId = slot.id;

    if (BUILD_LANES.has(lane)) {
      const locked = this.buildLock.tryAcquire({ runId, lane });
      if (!locked.ok) {
        this.scheduler.finish(runId);
        return { ...locked, code: "build_busy" };
      }
    }

    const summary = targetsSummary(targets);
    this.onEvent({
      type: "started",
      id: runId,
      lane,
      targets,
      platform: targets[0].platform,
      mode: targets[0].mode,
      summary,
      product,
    });

    const batch = this.startCompositeRunFn({
      packRoot: this.packRoot,
      lane,
      targets,
      updateDescription,
      product,
      onLog: (chunk) =>
        this.onEvent({
          type: "log",
          id: runId,
          stream: "stdout",
          chunk,
        }),
      onTargetStart: () => {},
    });
    this._processes.set(runId, batch);

    batch.done
      .then((result) => {
        this.onEvent({
          type: "finished",
          id: runId,
          lane,
          targets,
          platform: targets[0].platform,
          mode: targets[0].mode,
          code: result.cancelled ? null : result.code,
          signal: result.signal,
          cancelled: Boolean(result.cancelled),
          product,
          uploads: result.uploads || [],
        });
      })
      .catch((err) => {
        this.onEvent({
          type: "finished",
          id: runId,
          lane,
          targets,
          platform: targets[0].platform,
          mode: targets[0].mode,
          code: 1,
          signal: null,
          cancelled: false,
          product,
          uploads: [],
          reason: String(err && err.message ? err.message : err),
        });
      })
      .finally(() => {
        this._processes.delete(runId);
        this.scheduler.finish(runId);
        if (BUILD_LANES.has(lane)) {
          this.buildLock.release();
        }
      });

    return { ok: true, id: runId };
  }

  /**
   * @param {string} runId
   */
  cancelRun(runId) {
    const handle = this._processes.get(runId);
    if (!handle) {
      return { ok: false, reason: `Unknown Run: ${runId}` };
    }
    handle.cancel();
    return { ok: true };
  }

  getUploadPresentation() {
    const saved = readLastUpload(this.packRoot) || {};
    const merged =
      saved.mergedInstallUrl || readMergedInstallUrl(this.packRoot) || "";
    const uploads =
      Array.isArray(saved.uploads) && saved.uploads.length
        ? saved.uploads
        : saved.platform
          ? [
              {
                platform: saved.platform || "android",
                mode: saved.mode || "debug",
                buildName: saved.buildName || "",
                buildVersion: saved.buildVersion || "",
                buildVersionNo: saved.buildVersionNo || "",
                installUrl: saved.installUrl || "",
                buildQRCodeURL: saved.buildQRCodeURL || "",
              },
            ]
          : [];
    const note = saved.updateDescription || "";
    if (!merged && !uploads.some((u) => u.buildQRCodeURL || u.installUrl)) {
      return { ok: false, reason: "No QR / install URL in last upload result." };
    }
    return {
      ok: true,
      presentation: merged ? "merged" : "cards",
      mergedInstallUrl: merged,
      updateDescription: note,
      product: Boolean(saved.product),
      uploads,
    };
  }
}

module.exports = { ConsoleControl, UPLOAD_LANES };
