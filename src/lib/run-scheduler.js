"use strict";

const BUILD_LANES = new Set(["build", "distribute", "build_debug", "distribute_debug"]);

/**
 * Tracks Console Runs: build lanes are mutually exclusive;
 * upload_pgyer may run alongside a build.
 */
class RunScheduler {
  constructor() {
    /** @type {Map<string, { id: string, lane: string }>} */
    this._runs = new Map();
    this._seq = 0;
  }

  start(lane) {
    if (BUILD_LANES.has(lane) && this._hasActiveBuild()) {
      return {
        ok: false,
        code: "build_busy",
        reason:
          "A build Run is already active (build / distribute are mutually exclusive).",
      };
    }

    const id = `run-${++this._seq}`;
    this._runs.set(id, { id, lane });
    return { ok: true, id };
  }

  finish(id) {
    this._runs.delete(id);
  }

  cancel(id) {
    if (!this._runs.has(id)) {
      return { ok: false, reason: `Unknown Run: ${id}` };
    }
    this._runs.delete(id);
    return { ok: true };
  }

  active() {
    return [...this._runs.values()];
  }

  hasActiveBuild() {
    return this._hasActiveBuild();
  }

  _hasActiveBuild() {
    for (const run of this._runs.values()) {
      if (BUILD_LANES.has(run.lane)) return true;
    }
    return false;
  }
}

module.exports = { RunScheduler, BUILD_LANES };
