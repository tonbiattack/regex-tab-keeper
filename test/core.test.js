"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const core = require("../core.js");

function tab(id, url, extras = {}) {
  return { id, url, title: `Tab ${id}`, ...extras };
}

test("validates patterns, flags, and input limits", () => {
  assert.deepEqual(core.validateRuleInput("^https://example\\.com/"), { valid: true });
  assert.equal(core.validateRuleInput("[broken").valid, false);
  assert.equal(core.validateRuleInput("https://example.com", "ii").valid, false);
  assert.equal(core.validateRuleInput("https://example.com", "q").valid, false);
  assert.equal(core.validateRuleInput("", "").valid, false);
  assert.equal(core.validateRuleInput("a".repeat(core.MAX_PATTERN_LENGTH + 1)).valid, false);
});

test("normalizes stored rules and skips malformed values outside strict imports", () => {
  const rules = core.normalizeRules([
    { id: "docs", pattern: " ^https://docs\\.example\\.com/ ", flags: " i ", enabled: true },
    { id: "off", pattern: "^https://off\\.example\\.com/", flags: "", enabled: false },
    { id: "invalid", pattern: "[", flags: "", enabled: true },
    null
  ]);

  assert.deepEqual(rules.map(({ id, pattern, flags, enabled }) => ({ id, pattern, flags, enabled })), [
    { id: "docs", pattern: "^https://docs\\.example\\.com/", flags: "i", enabled: true },
    { id: "off", pattern: "^https://off\\.example\\.com/", flags: "", enabled: false }
  ]);
});

test("classifies tabs independently, including global regexes and pending URLs", () => {
  const rules = [
    { id: "docs", pattern: "^https://docs\\.example\\.com/", flags: "i", enabled: true },
    { id: "off", pattern: "^https://off\\.example\\.com/", flags: "", enabled: false }
  ];
  const classification = core.classifyTabs([
    tab(1, "https://docs.example.com/guide"),
    tab(2, "https://DOCS.EXAMPLE.COM/api"),
    tab(3, "https://off.example.com/"),
    tab(4, "", { pendingUrl: "https://docs.example.com/loading" }),
    tab(5, "chrome://settings/")
  ], rules);

  assert.deepEqual(classification.keep.map((item) => item.id), [1, 2, 4]);
  assert.deepEqual(classification.close.map((item) => item.id), [3, 5]);
  assert.equal(classification.activeRuleCount, 1);

  const globalClassification = core.classifyTabs([
    tab(1, "https://example.test/a"),
    tab(2, "https://example.test/b")
  ], [{ id: "search", pattern: "example", flags: "g", enabled: true }]);
  assert.deepEqual(globalClassification.keep.map((item) => item.id), [1, 2]);
});

test("exports and strictly imports only valid compatible settings", () => {
  const exported = core.createExportPayload({
    enabled: false,
    rules: [{ id: "docs", pattern: "^https://docs\\.example\\.com/", flags: "i", enabled: true }]
  });
  const imported = core.parseImportedSettings(exported);
  assert.equal(imported.enabled, false);
  assert.equal(imported.rules.length, 1);

  assert.throws(() => core.parseImportedSettings({ format: "other-extension", settings: { enabled: true, rules: [] } }));
  assert.throws(() => core.parseImportedSettings({ settings: { enabled: true, rules: [{ pattern: "[", flags: "" }] } }));
  assert.throws(() => core.parseImportedSettings({ settings: { enabled: "yes", rules: [] } }));
  assert.throws(() => core.parseImportedSettings({ settings: { enabled: true, rules: Array(core.MAX_RULES + 1).fill({ pattern: "a" }) } }));
});
