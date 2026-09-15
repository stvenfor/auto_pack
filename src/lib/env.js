"use strict";

const fs = require("node:fs");

/**
 * Read a single key from a dotenv-style file. Process ENV is not applied here.
 * @param {string} envPath
 * @param {string} key
 * @returns {string}
 */
function readEnvKey(envPath, key) {
  if (!fs.existsSync(envPath)) return "";
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq).trim() !== key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

/**
 * Read APP_ROOT from a dotenv-style file.
 */
function readAppRoot(envPath) {
  return readEnvKey(envPath, "APP_ROOT");
}

/**
 * Upsert a KEY=value line in a .env file, preserving other keys and comments.
 * @param {string} envPath
 * @param {string} key
 * @param {string} value
 */
function writeEnvKey(envPath, key, value) {
  let text = "";
  if (fs.existsSync(envPath)) {
    text = fs.readFileSync(envPath, "utf8");
  }

  const lines = text.length ? text.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  let found = false;
  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return line;
    const lineKey = trimmed.slice(0, eq).trim();
    if (lineKey !== key) return line;
    found = true;
    return `${key}=${value}`;
  });

  if (!found) {
    next.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, `${next.join("\n")}\n`, "utf8");
}

/**
 * Upsert APP_ROOT in a .env file, preserving other keys and comments.
 */
function writeAppRoot(envPath, appRoot) {
  writeEnvKey(envPath, "APP_ROOT", appRoot);
}

/**
 * Upsert PGYER_API_KEY when a non-empty value is provided.
 * Empty / whitespace-only input is a no-op (keep existing).
 * @param {string} envPath
 * @param {string} apiKey
 * @returns {{ wrote: boolean, configured: boolean }}
 */
function writePgyerApiKey(envPath, apiKey) {
  const next = String(apiKey || "").trim();
  if (!next) {
    return {
      wrote: false,
      configured: Boolean(readEnvKey(envPath, "PGYER_API_KEY")),
    };
  }
  writeEnvKey(envPath, "PGYER_API_KEY", next);
  return { wrote: true, configured: true };
}

module.exports = {
  readEnvKey,
  readAppRoot,
  writeEnvKey,
  writeAppRoot,
  writePgyerApiKey,
};
