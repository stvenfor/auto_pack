"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

/**
 * Resolve App Root FVM Flutter SDK root (directory containing bin/flutter).
 * @param {string} appRoot
 * @returns {string|null}
 */
function resolveFvmFlutterRoot(appRoot) {
  const flutterBin = path.join(appRoot, ".fvm", "flutter_sdk", "bin", "flutter");
  if (!fs.existsSync(flutterBin)) return null;
  try {
    return fs.realpathSync(path.join(appRoot, ".fvm", "flutter_sdk"));
  } catch {
    return path.resolve(appRoot, ".fvm", "flutter_sdk");
  }
}

function defaultAndroidSdkDir() {
  const fromEnv =
    (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "").trim();
  if (fromEnv) return fromEnv;
  const macDefault = path.join(os.homedir(), "Library", "Android", "sdk");
  return fs.existsSync(macDefault) ? macDefault : "";
}

function defaultJavaHome() {
  const fromEnv = (process.env.JAVA_HOME || "").trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const brew17 = "/opt/homebrew/opt/openjdk@17";
  if (fs.existsSync(brew17)) return brew17;
  return "";
}

function isUtf8Locale(value) {
  return /utf-?8/i.test(String(value || "").trim());
}

/**
 * Finder/Dock-launched Electron often has no LANG; Fastlane then warns/fails
 * with "requires your locale to be set to UTF-8".
 *
 * @param {NodeJS.ProcessEnv} env
 */
function ensureUtf8Locale(env) {
  const lang = (env.LANG || "").trim();
  const lcAll = (env.LC_ALL || "").trim();
  if (isUtf8Locale(lang) || isUtf8Locale(lcAll)) {
    if (!isUtf8Locale(lcAll) && isUtf8Locale(lang)) env.LC_ALL = lang;
    if (!isUtf8Locale(lang) && isUtf8Locale(lcAll)) env.LANG = lcAll;
    return env;
  }
  env.LANG = "en_US.UTF-8";
  env.LC_ALL = "en_US.UTF-8";
  return env;
}

/**
 * Resolve Harmony / DevEco SDK root for GUI-launched builds.
 * Flutter OHOS looks at DEVECO_SDK_HOME then HOS_SDK_HOME.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function defaultHarmonySdkDir(env = process.env) {
  for (const key of ["DEVECO_SDK_HOME", "HOS_SDK_HOME"]) {
    const fromEnv = (env[key] || process.env[key] || "").trim();
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  }
  const candidates = [
    "/Applications/DevEco-Studio.app/Contents/sdk",
    path.join(os.homedir(), "Library", "Huawei", "Sdk"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return "";
}

/**
 * DevEco ships a Node under Contents/tools/node (sibling of sdk/).
 * @param {string} harmonySdkDir
 * @returns {string}
 */
function defaultNodeHome(harmonySdkDir) {
  if (!harmonySdkDir) return "";
  const nodeHome = path.join(path.dirname(harmonySdkDir), "tools", "node");
  return fs.existsSync(nodeHome) ? nodeHome : "";
}

/**
 * Build a sanitized env for Fastlane/Flutter so a broken shell FLUTTER_HOME
 * (or missing JAVA_HOME/ANDROID_HOME/locale/Harmony SDK in GUI-launched
 * Electron) cannot derail builds.
 *
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {{ appRoot?: string, flutterRoot?: string }} [opts]
 */
function sanitizeBuildEnv(baseEnv, opts = {}) {
  const env = { ...baseEnv };
  ensureUtf8Locale(env);

  const flutterRoot =
    opts.flutterRoot ||
    (opts.appRoot ? resolveFvmFlutterRoot(opts.appRoot) : null);

  if (flutterRoot) {
    env.FLUTTER_ROOT = flutterRoot;
    // Override stale/broken FLUTTER_HOME from the parent shell.
    env.FLUTTER_HOME = flutterRoot;
  }

  const javaHome = defaultJavaHome();
  if (javaHome && !(env.JAVA_HOME || "").trim()) {
    env.JAVA_HOME = javaHome;
  }

  const androidSdk = defaultAndroidSdkDir();
  if (androidSdk) {
    if (!(env.ANDROID_HOME || "").trim()) env.ANDROID_HOME = androidSdk;
    if (!(env.ANDROID_SDK_ROOT || "").trim()) env.ANDROID_SDK_ROOT = androidSdk;
  }

  const harmonySdk = defaultHarmonySdkDir(env);
  if (harmonySdk) {
    if (!(env.DEVECO_SDK_HOME || "").trim()) env.DEVECO_SDK_HOME = harmonySdk;
    if (!(env.HOS_SDK_HOME || "").trim()) env.HOS_SDK_HOME = harmonySdk;
  }
  const nodeHome = defaultNodeHome(harmonySdk);
  if (nodeHome && !(env.NODE_HOME || "").trim()) {
    env.NODE_HOME = nodeHome;
  }

  // Prefer Homebrew tools when Electron PATH is minimal.
  const brewBin = "/opt/homebrew/bin";
  const pathParts = String(env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  if (fs.existsSync(brewBin) && !pathParts.includes(brewBin)) {
    pathParts.unshift(brewBin);
    env.PATH = pathParts.join(path.delimiter);
  }
  if (javaHome) {
    const javaBin = path.join(javaHome, "bin");
    const parts = String(env.PATH || "")
      .split(path.delimiter)
      .filter(Boolean);
    if (fs.existsSync(javaBin) && !parts.includes(javaBin)) {
      parts.unshift(javaBin);
      env.PATH = parts.join(path.delimiter);
    }
  }
  if (nodeHome) {
    const nodeBin = path.join(nodeHome, "bin");
    const parts = String(env.PATH || "")
      .split(path.delimiter)
      .filter(Boolean);
    const inject = fs.existsSync(nodeBin) ? nodeBin : nodeHome;
    if (fs.existsSync(inject) && !parts.includes(inject)) {
      parts.unshift(inject);
      env.PATH = parts.join(path.delimiter);
    }
  }

  // Drop Ruby gem isolation vars so CocoaPods is not polluted by a parent
  // shell / Electron / leftover Fastlane GEM_PATH (MissingSpecError: ffi, …).
  // Homebrew Fastlane re-sets its own GEM_* in its wrapper; Fastfile then
  // strips them again for flutter/pod child processes.
  delete env.GEM_HOME;
  delete env.GEM_PATH;
  delete env.BUNDLE_GEMFILE;

  return env;
}

/**
 * Resolve an absolute fastlane binary, preferring Homebrew on GUI-launched apps.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function resolveFastlaneCommand(env = process.env) {
  const candidates = [];
  for (const dir of String(env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)) {
    candidates.push(path.join(dir, "fastlane"));
  }
  candidates.push(
    "/opt/homebrew/bin/fastlane",
    "/usr/local/bin/fastlane"
  );
  for (const file of candidates) {
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {
      // try next
    }
  }
  return "fastlane";
}

/**
 * Keep android/local.properties flutter.sdk aligned with the FVM SDK we invoke.
 * Gradle's compileFlutterBuild* uses this path; a stale value causes release
 * failures that look like "Process 'command …/flutter' finished with non-zero exit value 1".
 *
 * @param {string} appRoot
 * @param {string} flutterRoot
 */
function syncAndroidLocalProperties(appRoot, flutterRoot) {
  const androidDir = path.join(appRoot, "android");
  if (!fs.existsSync(androidDir)) return null;

  const propsPath = path.join(androidDir, "local.properties");
  const map = {};
  if (fs.existsSync(propsPath)) {
    for (const line of fs.readFileSync(propsPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }

  map["flutter.sdk"] = flutterRoot;
  const sdkDir = defaultAndroidSdkDir();
  if (sdkDir) map["sdk.dir"] = sdkDir;

  const body =
    Object.entries(map)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n";
  fs.writeFileSync(propsPath, body, "utf8");
  return propsPath;
}

module.exports = {
  resolveFvmFlutterRoot,
  sanitizeBuildEnv,
  resolveFastlaneCommand,
  syncAndroidLocalProperties,
  defaultAndroidSdkDir,
  defaultJavaHome,
  defaultHarmonySdkDir,
  ensureUtf8Locale,
};
