"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Resolve Auto Pack engine root (Fastlane cwd, .env, artifacts).
 * Dev: repo root. Packaged: ~/Library/Application Support/<app>/pack
 * (survives .app updates; Resources/pack is only the bundled template).
 *
 * @param {{
 *   isPackaged?: boolean,
 *   resourcesPath?: string,
 *   userDataPath?: string,
 *   electronDirname?: string,
 * }} [opts]
 * @returns {string}
 */
function resolvePackRoot(opts = {}) {
  if (opts.isPackaged) {
    const userData = opts.userDataPath;
    if (!userData) {
      throw new Error("userDataPath is required when isPackaged is true");
    }
    return path.join(userData, "pack");
  }
  if (opts.electronDirname) {
    return path.resolve(opts.electronDirname, "..");
  }
  return path.resolve(__dirname, "..", "..");
}

/**
 * Bundled template shipped inside the .app (read-only-ish Resources).
 * @param {string} [resourcesPath]
 * @returns {string}
 */
function resolveBundlePackRoot(resourcesPath) {
  return path.join(resourcesPath || process.resourcesPath, "pack");
}

/**
 * Ensure pack root has Fastlane, artifacts/, and a starter .env.
 * When packaged, sync Fastlane/.env.example from the app bundle template.
 *
 * @param {string} packRoot
 * @param {{ bundlePackRoot?: string }} [opts]
 */
function ensurePackRootReady(packRoot, opts = {}) {
  fs.mkdirSync(packRoot, { recursive: true });
  fs.mkdirSync(path.join(packRoot, "artifacts"), { recursive: true });

  const bundle = opts.bundlePackRoot;
  if (bundle && fs.existsSync(bundle)) {
    const bundleFastlane = path.join(bundle, "fastlane");
    const destFastlane = path.join(packRoot, "fastlane");
    if (fs.existsSync(bundleFastlane) && !fs.existsSync(destFastlane)) {
      copyDirSync(bundleFastlane, destFastlane);
    }
    const bundleExample = path.join(bundle, ".env.example");
    const destExample = path.join(packRoot, ".env.example");
    if (fs.existsSync(bundleExample) && !fs.existsSync(destExample)) {
      fs.copyFileSync(bundleExample, destExample);
    }
    // One-time migrate: old builds wrote .env into Resources/pack
    const bundleEnv = path.join(bundle, ".env");
    const destEnv = path.join(packRoot, ".env");
    if (!fs.existsSync(destEnv) && fs.existsSync(bundleEnv)) {
      fs.copyFileSync(bundleEnv, destEnv);
    }
  }

  const envPath = path.join(packRoot, ".env");
  const examplePath = path.join(packRoot, ".env.example");
  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

module.exports = {
  resolvePackRoot,
  resolveBundlePackRoot,
  ensurePackRootReady,
};
