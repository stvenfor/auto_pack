"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { RunScheduler } = require("../src/lib/run-scheduler");

describe("run-scheduler", () => {
  it("rejects a second build while one build is running", () => {
    const scheduler = new RunScheduler();
    const first = scheduler.start("build");
    assert.equal(first.ok, true);

    const second = scheduler.start("distribute");
    assert.equal(second.ok, false);
    assert.match(second.reason, /build/i);
  });

  it("allows upload_pgyer alongside an active build", () => {
    const scheduler = new RunScheduler();
    assert.equal(scheduler.start("build").ok, true);

    const upload = scheduler.start("upload_pgyer");
    assert.equal(upload.ok, true);
    assert.equal(scheduler.active().length, 2);
  });

  it("frees the build slot after finish or cancel", () => {
    const scheduler = new RunScheduler();
    const first = scheduler.start("build");
    assert.equal(first.ok, true);

    scheduler.cancel(first.id);
    const next = scheduler.start("distribute");
    assert.equal(next.ok, true);

    scheduler.finish(next.id);
    assert.equal(scheduler.start("build").ok, true);
  });

  it("reports hasActiveBuild for branch-switch gating", () => {
    const scheduler = new RunScheduler();
    assert.equal(scheduler.hasActiveBuild(), false);
    scheduler.start("build");
    assert.equal(scheduler.hasActiveBuild(), true);
  });
});
