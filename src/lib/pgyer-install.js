"use strict";

const path = require("node:path");
const { readEnvKey } = require("./env");

const DEFAULT_INSTALL_TYPE = "2";

/**
 * @param {string} packRoot
 * @param {string} key
 */
function readPackEnv(packRoot, key) {
  const fromEnv = (process.env[key] || "").trim();
  if (fromEnv) return fromEnv;
  return readEnvKey(path.join(packRoot, ".env"), key).trim();
}

/**
 * Normalize to "1" (public) or "2" (password). Empty / unknown → default.
 * @param {unknown} value
 * @param {string} [fallback]
 */
function normalizeInstallType(value, fallback = DEFAULT_INSTALL_TYPE) {
  const t = String(value ?? "").trim();
  if (t === "1" || t === "2") return t;
  return fallback === "1" ? "1" : DEFAULT_INSTALL_TYPE;
}

/**
 * Default install type from process ENV / .env (default password = "2").
 * @param {string} packRoot
 */
function readDefaultInstallType(packRoot) {
  return normalizeInstallType(
    readPackEnv(packRoot, "PGYER_INSTALL_TYPE"),
    DEFAULT_INSTALL_TYPE
  );
}

/**
 * Default download password from process ENV / .env (never returned to UI).
 * @param {string} packRoot
 */
function readDefaultPassword(packRoot) {
  return readPackEnv(packRoot, "PGYER_PASSWORD");
}

/**
 * Resolve effective install type + password for a Console/CLI run.
 *
 * - installType from UI: "1" | "2" | "" (empty → .env / default 2)
 * - password from UI: non-empty overrides .env for this run; empty uses .env
 * - public ("1") always clears password for the upload API
 *
 * @param {{ packRoot: string, installType?: string, password?: string }} opts
 * @returns {{ installType: "1"|"2", password: string, passwordConfigured: boolean }}
 */
function resolvePgyerInstall(opts) {
  const packRoot = opts.packRoot;
  const uiType = String(opts.installType ?? "").trim();
  const installType =
    uiType === "1" || uiType === "2"
      ? uiType
      : readDefaultInstallType(packRoot);

  if (installType === "1") {
    return {
      installType: "1",
      password: "",
      passwordConfigured: true,
    };
  }

  const uiPassword = String(opts.password ?? "").trim();
  const password = uiPassword || readDefaultPassword(packRoot);
  return {
    installType: "2",
    password,
    passwordConfigured: Boolean(password),
  };
}

/**
 * Facts for Readiness / Console UI (no password plaintext).
 * @param {string} packRoot
 */
function pgyerInstallProbes(packRoot) {
  const installType = readDefaultInstallType(packRoot);
  const passwordConfigured = Boolean(readDefaultPassword(packRoot));
  return {
    pgyerInstallType: installType,
    pgyerPasswordConfigured: passwordConfigured,
  };
}

module.exports = {
  DEFAULT_INSTALL_TYPE,
  normalizeInstallType,
  readDefaultInstallType,
  readDefaultPassword,
  resolvePgyerInstall,
  pgyerInstallProbes,
};
