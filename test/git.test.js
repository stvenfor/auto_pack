"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  isGitRepo,
  currentBranch,
  listLocalBranches,
  isClean,
  checkout,
} = require("../src/lib/git");

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-git-"));
  const run = (args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  };
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(dir, "README"), "hi\n");
  run(["add", "README"]);
  run(["commit", "-m", "init"]);
  run(["branch", "-M", "main"]);
  run(["branch", "feature"]);
  return dir;
}

describe("git", () => {
  it("lists local branches and reports current branch", () => {
    const dir = initRepo();
    assert.equal(isGitRepo(dir), true);
    assert.equal(currentBranch(dir), "main");
    const branches = listLocalBranches(dir);
    assert.ok(branches.includes("main"));
    assert.ok(branches.includes("feature"));
  });

  it("checkouts a clean worktree and refuses when dirty", () => {
    const dir = initRepo();
    assert.equal(isClean(dir), true);
    const result = checkout(dir, "feature");
    assert.equal(result.ok, true);
    assert.equal(result.branch, "feature");

    fs.writeFileSync(path.join(dir, "dirty.txt"), "x");
    assert.equal(isClean(dir), false);
    assert.throws(() => checkout(dir, "main"), /dirty/i);
  });

  it("returns false for non-git directories", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-pack-nogit-"));
    assert.equal(isGitRepo(dir), false);
  });
});
