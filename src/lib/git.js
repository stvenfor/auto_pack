"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function runGit(appRoot, args) {
  const result = spawnSync("git", args, {
    cwd: appRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) {
    throw new Error(`git failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || `git ${args.join(" ")} exited ${result.status}`);
  }
  return (result.stdout || "").trim();
}

function isGitRepo(appRoot) {
  try {
    if (!fs.existsSync(appRoot) || !fs.statSync(appRoot).isDirectory()) {
      return false;
    }
    runGit(appRoot, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

function currentBranch(appRoot) {
  return runGit(appRoot, ["branch", "--show-current"]);
}

function listLocalBranches(appRoot) {
  const out = runGit(appRoot, ["branch", "--format=%(refname:short)"]);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * True when there are no staged/unstaged/untracked changes.
 */
function isClean(appRoot) {
  const out = runGit(appRoot, ["status", "--porcelain"]);
  return out.length === 0;
}

function dirtySummary(appRoot) {
  return runGit(appRoot, ["status", "--porcelain"]);
}

/**
 * Checkout a local branch. Refuses if the worktree is dirty.
 */
function checkout(appRoot, branch) {
  const name = String(branch || "").trim();
  if (!name) {
    throw new Error("Branch name is empty.");
  }
  if (!isClean(appRoot)) {
    const summary = dirtySummary(appRoot);
    throw new Error(
      `App Root worktree is dirty; refuse checkout.\n${summary}`
    );
  }
  runGit(appRoot, ["checkout", name]);
  return { ok: true, branch: currentBranch(appRoot) };
}

function platformDirExists(appRoot, platform) {
  const folder =
    platform === "harmony" ? "ohos" : platform === "ios" ? "ios" : "android";
  const dir = path.join(appRoot, folder);
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

module.exports = {
  isGitRepo,
  currentBranch,
  listLocalBranches,
  isClean,
  dirtySummary,
  checkout,
  platformDirExists,
  runGit,
};
