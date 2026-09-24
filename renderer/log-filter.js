"use strict";

/**
 * Console log line classifier: drop Fastlane/Flutter/Gradle chrome,
 * keep operator-relevant steps, errors, and Auto Pack control lines.
 *
 * Focus mode is a strict allowlist (ctrl / err / build·upload success /
 * brief meta) — switch to「全部」for the raw stream.
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
  /** Kinds retained in「精简」mode. Everything else is hidden. */
  const FOCUS_KINDS = new Set([
    "ctrl",
    "err",
    "ok-build",
    "ok-upload",
    "meta",
  ]);

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
    // Fastlane release-note / plugin changelog spam
    /^\*\s+\[[\w.-]+\]/,
    /\(#\d+\)\s+via\s+/i,
    /^Update available/i,
    /^Please update (fastlane|bundler)/i,
    /^To update fastlane/i,
    /^Your Fastlane is outdated/i,
    /^fastlane \d[\d.]+\s+is available/i,
    // Flutter / Xcode / Gradle chrome that used to leak as "info"/"step"
    /^Building with sound null safety/i,
    /^Running "flutter /i,
    /^Running pod install/i,
    /^Running Xcode build/i,
    /^Xcode build done/i,
    /^Font asset ".*" was tree-shaken/i,
    /^\[\s*\+*\s*\]/i,
    /^> Task :/i,
    /^> Configure project/i,
    /^BUILD SUCCESSFUL/i,
    /^Generating( debug)? symbols/i,
    /^Info\.plist/i,
    /^Provisioning Profile/i,
    /^Shell Script/i,
    /^Compile(C|Swift|Storyboard)/i,
    /^Ld\b/,
    /^CpResource/i,
    /^PhaseScriptExecution/i,
    /^Touch\b/,
    /^ProcessInfoPlistFile/i,
    /^Copy(PNG|Swift)/i,
    /^lib\/.*\.dart:\d+/i,
    /^package:.*:\d+/i,
    /^\|/,
  ];

  /**
   * Matched against the line *after* stripping a `[target]` / `[shared]` prefix.
   * Do NOT match `/^\[shared\]/` on the raw line — that would keep every
   * Fastlane stdout line from prep_deps (they are all prefixed `[shared]`).
   */
  const CTRL_BODY_PATTERNS = [
    /^=====/,
    /\bfailed with exit\b/i,
    /\bskip upload\b/i,
    /\bbuild only\b/i,
    /^\[qr\]/,
    /^building \d+ Target/i,
    /^uploading \d+ Target/i,
    /^build partial success/i,
    /^all builds failed/i,
    /^upload finished with failures/i,
    /^building Harmony alone/i,
    /^skip upload for failed builds/i,
    /^Harmony 构建失败/i,
    /^prep_deps failed/i,
    /^build finished with partial success/i,
  ];

  /** Short context lines operators need without the full Fastlane chatter. */
  const META_PATTERNS = [
    /^App Root:/i,
    /^Flutter:\s/i,
    /^Target:\s/i,
    /^Shared prep:/i,
    /^PACK_SKIP_PUB_GET/i,
    /^Artifact missing:/i,
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
    /\buser_error\b/i,
  ];

  /** Build finished / artifact ready — shown more prominently than generic ok. */
  const BUILD_OK_PATTERNS = [
    /^▸?\s*Artifact:/i,
    /\bprep_deps done\b/i,
    /\barchive succeeded\b/i,
    /\bbuild (finished|succeeded|complete[d]?)\b/i,
    /构建成功/,
    /\bBuilt\b.+\.(apk|ipa|aab|hap|app)\b/i,
    /✓\s*Built\b/i,
  ];

  /** Upload / Pgyer success — separate visual treatment from build success. */
  const UPLOAD_OK_PATTERNS = [
    /Pgyer:\s*file uploaded/i,
    /Pgyer:\s*build ready/i,
    /^▸?\s*Pgyer App:/i,
    /^▸?\s*Install URL:/i,
    /^▸?\s*QR Code:/i,
    /^▸?\s*Upload result/i,
    /Successfully uploaded/i,
    /\buploaded to Pgyer\b/i,
    /Removed local artifact/i,
    /上传成功/,
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
   * @returns {"noise" | "ctrl" | "meta" | "err" | "ok-build" | "ok-upload" | "ok" | "warn" | "step" | "info"}
   */
  function classifyLine(line) {
    const raw = String(line ?? "");
    const trimmed = raw.trim();

    // These whole-line markers would be eaten by stripTargetPrefix.
    if (/^\[exit\b/.test(trimmed) || /^\[cancelled\]/.test(trimmed)) {
      return "ctrl";
    }

    const body = stripTargetPrefix(raw)
      .replace(/^\d{1,2}:\d{2}:\d{2}:\s*/, "")
      .replace(/^✓\s+/, "");

    if (
      /^=====/.test(raw) ||
      CTRL_BODY_PATTERNS.some((re) => re.test(body))
    ) {
      return "ctrl";
    }
    if (ERR_PATTERNS.some((re) => re.test(body))) return "err";
    if (BUILD_OK_PATTERNS.some((re) => re.test(body) || re.test(raw))) {
      return "ok-build";
    }
    if (UPLOAD_OK_PATTERNS.some((re) => re.test(body) || re.test(raw))) {
      return "ok-upload";
    }
    if (META_PATTERNS.some((re) => re.test(body))) return "meta";
    // Noise before step/ok so Flutter/Xcode / Fastlane changelog is not "step".
    if (NOISE_PATTERNS.some((re) => re.test(body))) return "noise";
    if (/^\[[^\]]+\]\s*$/.test(raw.trim())) return "noise";
    if (/^\d{1,2}:\d{2}:\d{2}:\s*[|▸]?\s*$/.test(body)) return "noise";
    if (/^\s*[|]\s*$/.test(body)) return "noise";
    if (OK_PATTERNS.some((re) => re.test(body) || re.test(raw))) return "ok";
    if (STEP_PATTERNS.some((re) => re.test(body))) return "step";
    if (WARN_PATTERNS.some((re) => re.test(body))) return "warn";

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
   * Escape a line and wrap case-insensitive query hits in <mark>.
   * @param {string} line
   * @param {string} query
   */
  function highlightMatches(line, query) {
    const q = String(query || "").trim();
    if (!q) return escapeHtml(line);

    const lower = line.toLowerCase();
    const needle = q.toLowerCase();
    let out = "";
    let i = 0;
    while (i < line.length) {
      const at = lower.indexOf(needle, i);
      if (at < 0) {
        out += escapeHtml(line.slice(i));
        break;
      }
      out += escapeHtml(line.slice(i, at));
      out += `<mark class="log-hit">${escapeHtml(
        line.slice(at, at + needle.length)
      )}</mark>`;
      i = at + needle.length;
    }
    return out;
  }

  /**
   * @param {string} logText
   * @param {"focus" | "all"} mode
   * @param {string} [query]
   */
  function buildLogView(logText, mode, query = "") {
    if (!logText) {
      return { html: "", shown: 0, hidden: 0, filtered: 0, total: 0 };
    }

    const needle = String(query || "").trim().toLowerCase();
    const lines = logText.split("\n");
    const parts = [];
    let shown = 0;
    let hidden = 0;
    let filtered = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLast = i === lines.length - 1;
      if (isLast && line === "") continue;

      const kind = classifyLine(line);

      if (needle) {
        if (!line.toLowerCase().includes(needle)) {
          filtered += 1;
          continue;
        }
      } else if (mode === "focus" && !FOCUS_KINDS.has(kind)) {
        hidden += 1;
        continue;
      }

      const className =
        kind === "info"
          ? "log-line"
          : kind === "noise"
            ? "log-line log-noise"
            : `log-line log-${kind}`;
      parts.push(
        `<span class="${className}">${highlightMatches(line, needle)}</span>`
      );
      shown += 1;
    }

    return {
      html: parts.join("\n"),
      shown,
      hidden,
      filtered,
      total: shown + hidden + filtered,
    };
  }

  return {
    classifyLine,
    buildLogView,
    escapeHtml,
    highlightMatches,
    stripTargetPrefix,
    FOCUS_KINDS,
  };
});
