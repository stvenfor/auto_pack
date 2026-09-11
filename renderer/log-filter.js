"use strict";

/**
 * Console log line classifier: drop Fastlane/Flutter/Gradle chrome,
 * keep operator-relevant steps, errors, and Auto Pack control lines.
 *
 * Works in Electron renderer (script tag → window.AutoPackLogFilter)
 * and in Node tests (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AutoPackLogFilter = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function stripTargetPrefix(line) {
    return String(line ?? "").replace(/^\[[^\]]+\]\s*/, "");
  }

  const NOISE_PATTERNS = [
    /^\s*$/,
    /^[─\-═_\s|]{4,}$/,
    /^[+\-]{3,}\s*$/,
    /^▸\s*$/,
    /^DEBUG\b/i,
    /^Resolving dependencies/i,
    /^Got dependencies/i,
    /^Downloading\b/i,
    /^Download\b/i,
    /^Waiting for another flutter command/i,
    /^Found saved certificate/i,
    /^Setting CFBundleVersion/i,
    /^\$\s+cd\b/,
    /^\$\s+export\b/,
    /^\$\s+mkdir\b/,
    /^\$\s+rm\b/,
    /^\$\s+cp\b/,
    /^\$\s+chmod\b/,
    /^\$\s+xcrun\b/,
    /^Note:\s+/i,
    /^warning:\s+\[options\]/i,
    /^warning:\s+The following options were not recognized/i,
    /^warning:\s+\[deprecation\]/i,
    /^Note:\s+Some input files use or override/i,
    /^Note:\s+Recompile with -Xlint/i,
    /^Daemon will be stopped/i,
    /^Using daemon/i,
    /^Starting a Gradle Daemon/i,
    /^Deprecated Gradle features/i,
    /^You can use '--warning-mode all'/i,
    /^For more on this, please refer to/i,
    /^To honour the JVM settings/i,
    /^Configuration on demand is an incubating/i,
    /^Kotlin build report is not enabled/i,
    /^The Kotlin daemon/i,
    /^Transforming\b/i,
    /^Caching disabled/i,
    /^Resolve mutations/i,
    /^Task path '/,
    /^Build cache is (disabled|enabled)/i,
    /^Watching the file system/i,
    /^\d+\s+actionable tasks?/i,
    /^See https?:\/\//i,
    /^More information about/i,
    /^Visit https?:\/\//i,
    /^https?:\/\/\S+$/i,
    /^#{2,}\s*$/,
    /^Driving the lane/i,
    /^---------------------------------------$/,
    /^-------------------$/,
    /^Loading from '\.\/fastlane/i,
    /^Successfully loaded Appfile/i,
    /^Using recommended settings/i,
    /^Get started using a Gemfile/i,
  ];

  const CTRL_PATTERNS = [
    /^=====/,
    /^\[exit\b/,
    /^\[cancelled\]/,
    /\bfailed with exit\b/i,
    /\bskip upload\b/i,
    /\bbuild only\b/i,
    /^\[qr\]/,
  ];

  const ERR_PATTERNS = [
    /\berror\b/i,
    /\bfailed\b/i,
    /\bfailure\b/i,
    /\bfatal\b/i,
    /\bexception\b/i,
    /\bcrash\b/i,
    /\babort/i,
    /✗|✘|❌/,
    /\bexit code [1-9]/i,
    /\bnon-zero\b/i,
  ];

  const OK_PATTERNS = [
    /\bsuccess(fully)?\b/i,
    /\buploaded\b/i,
    /\bbuilt\b/i,
    /\barchive succeeded\b/i,
    /\bpgyer\b/i,
    /蒲公英/,
    /✓|✔|✅/,
    /\bcompleted\b/i,
    /^\[exit 0\]/,
  ];

  const WARN_PATTERNS = [
    /\bwarn(ing)?\b/i,
    /\bdeprecated\b/i,
    /\bskip(ped|ping)?\b/i,
  ];

  const STEP_PATTERNS = [
    /^\$\s+/,
    /^▸\s+/,
    /^Step:/i,
    /^Lane:/i,
    /^Running\b/i,
    /^fastlane\b/i,
    /\bflutter build\b/i,
    /\bassemble(Debug|Release|Profile)\b/i,
    /\bGradle task\b/i,
    /\bBuilding\b/i,
    /\bCompiling\b/i,
    /\bPackaging\b/i,
    /\bUploading\b/i,
    /\bSigning\b/i,
  ];

  /**
   * @param {string} line
   * @returns {"noise" | "ctrl" | "err" | "ok" | "warn" | "step" | "info"}
   */
  function classifyLine(line) {
    const raw = String(line ?? "");
    const body = stripTargetPrefix(raw).replace(
      /^\d{1,2}:\d{2}:\d{2}:\s*/,
      ""
    );

    if (CTRL_PATTERNS.some((re) => re.test(body) || re.test(raw))) return "ctrl";
    if (ERR_PATTERNS.some((re) => re.test(body))) return "err";
    if (OK_PATTERNS.some((re) => re.test(body) || re.test(raw))) return "ok";
    if (STEP_PATTERNS.some((re) => re.test(body))) return "step";
    if (WARN_PATTERNS.some((re) => re.test(body))) return "warn";
    if (NOISE_PATTERNS.some((re) => re.test(body))) return "noise";

    if (/^\[[^\]]+\]\s*$/.test(raw.trim())) return "noise";
    if (/^\d{1,2}:\d{2}:\d{2}:\s*[|▸]?\s*$/.test(body)) return "noise";
    if (/^\s*[|]\s*$/.test(body)) return "noise";

    return "info";
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @param {string} logText
   * @param {"focus" | "all"} mode
   */
  function buildLogView(logText, mode) {
    if (!logText) {
      return { html: "", shown: 0, hidden: 0, total: 0 };
    }

    const lines = logText.split("\n");
    const parts = [];
    let shown = 0;
    let hidden = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLast = i === lines.length - 1;
      if (isLast && line === "") continue;

      const kind = classifyLine(line);
      if (mode === "focus" && kind === "noise") {
        hidden += 1;
        continue;
      }

      const className =
        kind === "info"
          ? "log-line"
          : kind === "noise"
            ? "log-line log-noise"
            : `log-line log-${kind}`;
      parts.push(`<span class="${className}">${escapeHtml(line)}</span>`);
      shown += 1;
    }

    return {
      html: parts.join("\n"),
      shown,
      hidden,
      total: shown + hidden,
    };
  }

  return {
    classifyLine,
    buildLogView,
    escapeHtml,
    stripTargetPrefix,
  };
});
