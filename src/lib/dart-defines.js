"use strict";

/**
 * Parse a single KEY=value dart-define spec.
 * @param {string} raw
 * @returns {{ key: string, value: string }}
 */
function parseDartDefine(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    throw new Error('Empty --dart-define (expected KEY=value).');
  }
  const eq = text.indexOf("=");
  if (eq <= 0) {
    throw new Error(
      `Invalid --dart-define "${raw}". Expected KEY=value.`
    );
  }
  const key = text.slice(0, eq).trim();
  const value = text.slice(eq + 1);
  if (!key) {
    throw new Error(
      `Invalid --dart-define "${raw}". Expected KEY=value.`
    );
  }
  return { key, value };
}

/**
 * Resolve --product + --dart-define list into a deduped set.
 * Same key with different values (including --product vs TF_NET_PRODUCT) → error.
 *
 * @param {{ product?: boolean, defines?: string[] }} [opts]
 * @returns {{
 *   product: boolean,
 *   pairs: Array<{ key: string, value: string }>,
 *   specs: string[],
 *   flutterArgs: string[],
 *   envValue: string,
 *   label: string,
 * }}
 */
function resolveDartDefines(opts = {}) {
  /** @type {Map<string, string>} */
  const map = new Map();
  /** @type {string[]} */
  const order = [];

  function add(key, value) {
    if (map.has(key)) {
      if (map.get(key) !== value) {
        throw new Error(
          `Conflicting dart-define for ${key}: "${map.get(key)}" vs "${value}".`
        );
      }
      return;
    }
    map.set(key, value);
    order.push(key);
  }

  for (const raw of opts.defines || []) {
    const { key, value } = parseDartDefine(raw);
    add(key, value);
  }

  if (opts.product) {
    if (map.has("TF_NET_PRODUCT") && map.get("TF_NET_PRODUCT") !== "true") {
      throw new Error(
        `Conflicting dart-define for TF_NET_PRODUCT: "${map.get("TF_NET_PRODUCT")}" vs "true" (--product).`
      );
    }
    add("TF_NET_PRODUCT", "true");
  }

  const pairs = order.map((key) => ({ key, value: map.get(key) }));
  const specs = pairs.map((p) => `${p.key}=${p.value}`);
  const product = map.get("TF_NET_PRODUCT") === "true";

  return {
    product,
    pairs,
    specs,
    flutterArgs: specs.map((s) => `--dart-define=${s}`),
    envValue: specs.join("\n"),
    label: product ? "PRODUCT" : "",
  };
}

/**
 * Encode resolved defines for PACK_DART_DEFINES env (newline-separated KEY=value).
 * @param {{ product?: boolean, defines?: string[] } | ReturnType<typeof resolveDartDefines>} input
 */
function packDartDefinesEnv(input) {
  if (input && Array.isArray(input.specs)) {
    return input.envValue || input.specs.join("\n");
  }
  return resolveDartDefines(input).envValue;
}

/**
 * Decode PACK_DART_DEFINES env back into specs.
 * @param {string} raw
 * @returns {string[]}
 */
function decodeDartDefinesEnv(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

module.exports = {
  parseDartDefine,
  resolveDartDefines,
  packDartDefinesEnv,
  decodeDartDefinesEnv,
};
