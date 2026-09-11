"use strict";

const fs = require("node:fs");

/**
 * Read APP_ROOT from a dotenv-style file. Process ENV is not applied here —
 * callers that need ENV-over-dotenv should check process.env first.
 */
function readAppRoot(envPath) {
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== "APP_ROOT") continue;
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
 * Upsert APP_ROOT in a .env file, preserving other keys and comments.
 */
function writeAppRoot(envPath, appRoot) {
  let text = "";
  if (fs.existsSync(envPath)) {
    text = fs.readFileSync(envPath, "utf8");
  }

  const lines = text.length ? text.split(/\r?\n/) : [];
  // Drop trailing empty line from split so we control final newline.
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  let found = false;
  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return line;
    const key = trimmed.slice(0, eq).trim();
    if (key !== "APP_ROOT") return line;
    found = true;
    return `APP_ROOT=${appRoot}`;
  });

  if (!found) {
    next.push(`APP_ROOT=${appRoot}`);
  }

  fs.writeFileSync(envPath, `${next.join("\n")}\n`, "utf8");
}

module.exports = { readAppRoot, writeAppRoot };
