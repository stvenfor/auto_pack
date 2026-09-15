"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  sanitizeBuildEnv,
  resolveFastlaneCommand,
} = require("./build-env");
const { readAppRoot } = require("./env");
const { isGitRepo, platformDirExists } = require("./git");

function resolveAppRoot(packRoot) {
  const fromEnv = (process.env.APP_ROOT || "").trim();
  if (fromEnv) return path.resolve(fromEnv);

  const envPath = path.join(packRoot, ".env");
  if (fs.existsSync(envPath)) {
    const fromFile = readAppRoot(envPath).trim();
    if (fromFile) return path.resolve(fromFile);
  }

  return "";
}

function flutterBinFor(appRoot) {
  return path.join(appRoot, ".fvm", "flutter_sdk", "bin", "flutter");
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function artifactsWritable(packRoot) {
  const dir = path.join(packRoot, "artifacts");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function fastlaneOk() {
  const env = sanitizeBuildEnv(process.env);
  const bin = resolveFastlaneCommand(env);
  const result = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    timeout: 15_000,
    env,
  });
  return result.status === 0;
}

function pgyerApiKeyConfigured(packRoot) {
  const fromEnv = (process.env.PGYER_API_KEY || "").trim();
  if (fromEnv) return true;

  const envPath = path.join(packRoot, ".env");
  if (!fs.existsSync(envPath)) return false;

  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq).trim() !== "PGYER_API_KEY") continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value.length > 0;
  }
  return false;
}

function gatherProbes(packRoot) {
  const appRoot = resolveAppRoot(packRoot);
  const flutterBin = appRoot ? flutterBinFor(appRoot) : "";
  const appRootExists =
    Boolean(appRoot) &&
    fs.existsSync(appRoot) &&
    fs.statSync(appRoot).isDirectory();
  return {
    appRoot,
    appRootExists,
    appRootIsGit: appRootExists && isGitRepo(appRoot),
    platformDirs: {
      android: appRootExists && platformDirExists(appRoot, "android"),
      ios: appRootExists && platformDirExists(appRoot, "ios"),
      harmony: appRootExists && platformDirExists(appRoot, "harmony"),
    },
    flutterBin,
    flutterExecutable: Boolean(flutterBin) && isExecutable(flutterBin),
    artifactsDir: path.join(packRoot, "artifacts"),
    artifactsWritable: artifactsWritable(packRoot),
    fastlaneOk: fastlaneOk(),
    pgyerApiKeyConfigured: pgyerApiKeyConfigured(packRoot),
  };
}

module.exports = {
  resolveAppRoot,
  flutterBinFor,
  gatherProbes,
};
