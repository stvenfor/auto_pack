"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyLine,
  buildLogView,
  escapeHtml,
} = require("../src/lib/log-filter");

describe("classifyLine", () => {
  it("keeps Auto Pack control lines", () => {
    assert.equal(classifyLine("===== [android/debug] build ====="), "ctrl");
    assert.equal(
      classifyLine("[android/debug] skip upload — this Target cannot upload to Pgyer"),
      "ctrl"
    );
    assert.equal(classifyLine("[exit 0]"), "ctrl");
    assert.equal(classifyLine("[cancelled]"), "ctrl");
    assert.equal(
      classifyLine("[android/debug] failed with exit 1"),
      "ctrl"
    );
  });

  it("drops common Fastlane/Gradle noise", () => {
    assert.equal(classifyLine("Resolving dependencies..."), "noise");
    assert.equal(classifyLine("Downloading https://example.com/x"), "noise");
    assert.equal(classifyLine("Starting a Gradle Daemon"), "noise");
    assert.equal(classifyLine("---------------------------------------"), "noise");
    assert.equal(classifyLine("[android/debug] "), "noise");
    assert.equal(classifyLine("14:02:11: ▸"), "noise");
  });

  it("highlights steps, errors, and success", () => {
    assert.equal(
      classifyLine("[android/debug] ▸ Running Gradle task 'assembleDebug'..."),
      "step"
    );
    assert.equal(classifyLine("Error: Gradle task assembleDebug failed"), "err");
    assert.equal(classifyLine("Successfully uploaded to Pgyer"), "ok");
    assert.equal(classifyLine("warning: unused import"), "warn");
  });
});

describe("buildLogView", () => {
  it("hides noise in focus mode and keeps it in all mode", () => {
    const log = [
      "===== [android/debug] build =====",
      "Resolving dependencies...",
      "▸ Running Gradle task 'assembleDebug'...",
      "Error: boom",
      "",
    ].join("\n");

    const focus = buildLogView(log, "focus");
    assert.equal(focus.hidden >= 1, true);
    assert.match(focus.html, /log-ctrl/);
    assert.match(focus.html, /log-step/);
    assert.match(focus.html, /log-err/);
    assert.equal(focus.html.includes("Resolving"), false);

    const all = buildLogView(log, "all");
    assert.equal(all.hidden, 0);
    assert.match(all.html, /Resolving/);
    assert.match(all.html, /log-noise/);
  });

  it("escapes HTML in log lines", () => {
    assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
    const view = buildLogView("<b>x</b>", "all");
    assert.equal(view.html.includes("<b>"), false);
    assert.match(view.html, /&lt;b&gt;/);
  });
});
