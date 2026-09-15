"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Cross-process exclusive lock for build-class Runs on a Build Host.
 * Stored under packRoot/artifacts/.build-run.lock
 */
class BuildRunLock {
  /**
   * @param {string} packRoot
   */
  constructor(packRoot) {
    this.packRoot = packRoot;
    this.lockPath = path.join(packRoot, "artifacts", ".build-run.lock");
    /** @type {{ runId: string, lane: string, pid: number } | null} */
    this._held = null;
  }

  /**
   * @param {{ runId: string, lane: string }} meta
   * @returns {{ ok: true } | { ok: false, reason: string }}
   */
  tryAcquire(meta) {
    fs.mkdirSync(path.dirname(this.lockPath), { recursive: true });
    this._clearStaleLock();

    const payload = {
      pid: process.pid,
      runId: String(meta.runId || ""),
      lane: String(meta.lane || ""),
      at: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(this.lockPath, `${JSON.stringify(payload)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (err) {
      if (err && err.code === "EEXIST") {
        return {
          ok: false,
          code: "build_busy",
          reason:
            "A build Run is already active (build / distribute are mutually exclusive).",
        };
      }
      throw err;
    }

    this._held = payload;
    return { ok: true };
  }

  _clearStaleLock() {
    if (!fs.existsSync(this.lockPath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.lockPath, "utf8"));
      if (raw && typeof raw.pid === "number" && isPidAlive(raw.pid)) {
        return;
      }
      fs.unlinkSync(this.lockPath);
    } catch {
      try {
        fs.unlinkSync(this.lockPath);
      } catch {
        // ignore
      }
    }
  }

  release() {
    if (!this._held) return;
    try {
      if (fs.existsSync(this.lockPath)) {
        const raw = JSON.parse(fs.readFileSync(this.lockPath, "utf8"));
        if (raw && raw.pid === process.pid && raw.runId === this._held.runId) {
          fs.unlinkSync(this.lockPath);
        }
      }
    } catch {
      // ignore
    }
    this._held = null;
  }

  /**
   * @returns {boolean}
   */
  isHeldByOther() {
    if (!fs.existsSync(this.lockPath)) return false;
    try {
      const raw = JSON.parse(fs.readFileSync(this.lockPath, "utf8"));
      if (!raw || typeof raw.pid !== "number") return false;
      if (raw.pid === process.pid && this._held) return false;
      return isPidAlive(raw.pid);
    } catch {
      return false;
    }
  }
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === "EPERM";
  }
}

module.exports = { BuildRunLock };
