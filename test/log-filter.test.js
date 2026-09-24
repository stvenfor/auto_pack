"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyLine,
  buildLogView,
  escapeHtml,
  highlightMatches,
} = require("../src/lib/log-filter");

describe("classifyLine", () => {
  it("keeps Auto Pack control lines", () => {
    assert.equal(classifyLine("===== [android/debug] build ====="), "ctrl");
    assert.equal(
      classifyLine(
        "[android/debug] skip upload — this Target cannot upload to Pgyer"
      ),
      "ctrl"
    );
    assert.equal(classifyLine("[exit 0]"), "ctrl");
    assert.equal(classifyLine("[cancelled]"), "ctrl");
    assert.equal(classifyLine("[android/debug] failed with exit 1"), "ctrl");
    assert.equal(
      classifyLine(
        "[parallel] building 2 Target(s) concurrently (android/debug, ios/debug)"
      ),
      "ctrl"
    );
    assert.equal(
      classifyLine("[auto_pack] skip upload for failed builds: [ios/debug]"),
      "ctrl"
    );
    assert.equal(
      classifyLine(
        "[serial] building Harmony alone (avoid ohpm/hvigor racing Android/iOS)"
      ),
      "ctrl"
    );
  });

  it("drops Fastlane changelog lines even with [shared] prefix", () => {
    assert.equal(
      classifyLine(
        "[shared] * [gym][scan][snapshot] Add disallow_xcodebuild_settings_lookup option (#30112) via Brett Best (@Brett-Best)"
      ),
      "noise"
    );
    assert.equal(
      classifyLine(
        "[shared] * [gem] move to rubyzip v3 (#30176) via Connor Tumbleson (@iBotPeaches)"
      ),
      "noise"
    );
  });

  it("drops common Fastlane/Gradle noise", () => {
    assert.equal(classifyLine("Resolving dependencies..."), "noise");
    assert.equal(classifyLine("Downloading https://example.com/x"), "noise");
    assert.equal(classifyLine("Starting a Gradle Daemon"), "noise");
    assert.equal(classifyLine("---------------------------------------"), "noise");
    assert.equal(classifyLine("[android/debug] "), "noise");
    assert.equal(classifyLine("14:02:11: ▸"), "noise");
    assert.equal(classifyLine("> Task :app:assembleDebug"), "noise");
    assert.equal(classifyLine("Running Xcode build..."), "noise");
  });

  it("highlights steps, errors, and success", () => {
    assert.equal(
      classifyLine("[android/debug] ▸ Running Gradle task 'assembleDebug'..."),
      "step"
    );
    assert.equal(classifyLine("Error: Gradle task assembleDebug failed"), "err");
    assert.equal(classifyLine("Successfully uploaded to Pgyer"), "ok-upload");
    assert.equal(classifyLine("warning: unused import"), "warn");
  });

  it("marks build and upload success distinctly", () => {
    assert.equal(
      classifyLine("Artifact: /tmp/auto_pack/artifacts/android-debug.apk"),
      "ok-build"
    );
    assert.equal(classifyLine("prep_deps done"), "ok-build");
    assert.equal(classifyLine("Pgyer: file uploaded"), "ok-upload");
    assert.equal(classifyLine("Pgyer App: Demo 1.0.0 (42)"), "ok-upload");
    assert.equal(
      classifyLine("Install URL: https://www.pgyer.com/x"),
      "ok-upload"
    );
  });

  it("keeps brief meta context", () => {
    assert.equal(classifyLine("App Root: /Users/me/app"), "meta");
    assert.equal(classifyLine("Flutter:  /Users/me/app/.fvm/flutter_sdk/bin/flutter"), "meta");
    assert.equal(classifyLine("Target:   android / debug"), "meta");
  });
});

describe("buildLogView", () => {
  it("focus mode keeps only essentials", () => {
    const log = [
      "===== [android/debug] build =====",
      "App Root: /tmp/app",
      "Resolving dependencies...",
      "▸ Running Gradle task 'assembleDebug'...",
      "> Task :app:compileDebugKotlin",
      "[shared] * [gym][scan] Add option (#30112) via Brett Best (@Brett-Best)",
      "Artifact: /tmp/artifacts/android-debug.apk",
      "Pgyer: file uploaded",
      "Successfully loaded Appfile",
      "Error: boom",
      "warning: unused import",
      "",
    ].join("\n");

    const focus = buildLogView(log, "focus");
    assert.match(focus.html, /log-ctrl/);
    assert.match(focus.html, /log-meta/);
    assert.match(focus.html, /log-ok-build/);
    assert.match(focus.html, /log-ok-upload/);
    assert.match(focus.html, /log-err/);
    assert.equal(focus.html.includes("Resolving"), false);
    assert.equal(focus.html.includes("Running Gradle"), false);
    assert.equal(focus.html.includes("compileDebugKotlin"), false);
    assert.equal(focus.html.includes("Successfully loaded"), false);
    assert.equal(focus.html.includes("unused import"), false);
    assert.equal(focus.html.includes("Brett Best"), false);
    assert.equal(focus.shown < focus.total, true);
    assert.equal(focus.hidden >= 4, true);

    const all = buildLogView(log, "all");
    assert.equal(all.hidden, 0);
    assert.match(all.html, /Resolving/);
    assert.match(all.html, /log-step/);
  });

  it("escapes HTML in log lines", () => {
    assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
    const view = buildLogView("<b>x</b>", "all");
    assert.equal(view.html.includes("<b>"), false);
    assert.match(view.html, /&lt;b&gt;/);
  });

  it("filters and highlights search matches", () => {
    const log = [
      "Artifact: /tmp/app.apk",
      "Pgyer: file uploaded",
      "Resolving dependencies...",
    ].join("\n");

    const view = buildLogView(log, "focus", "pgyer");
    assert.equal(view.shown, 1);
    assert.equal(view.filtered >= 1, true);
    assert.match(view.html, /log-ok-upload/);
    assert.match(view.html, /<mark class="log-hit">Pgyer<\/mark>/i);
    assert.equal(view.html.includes("Artifact"), false);
  });

  it("styles build and upload success lines", () => {
    const log = ["Artifact: /tmp/app.apk", "Pgyer: file uploaded"].join("\n");
    const view = buildLogView(log, "all");
    assert.match(view.html, /log-ok-build/);
    assert.match(view.html, /log-ok-upload/);
  });
});

describe("highlightMatches", () => {
  it("wraps case-insensitive hits without breaking escape", () => {
    const html = highlightMatches("Foo <bar> FOO", "foo");
    assert.match(html, /<mark class="log-hit">Foo<\/mark>/);
    assert.match(html, /&lt;bar&gt;/);
    assert.match(html, /<mark class="log-hit">FOO<\/mark>/);
  });
});
