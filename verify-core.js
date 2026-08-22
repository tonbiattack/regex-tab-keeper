"use strict";

const assert = require("node:assert/strict");
const core = require("./core.js");

function tab(id, url) {
  return { id, url, title: `Tab ${id}` };
}

function expectThrows(callback, message) {
  assert.throws(callback, message);
}

function run() {
  assert.deepEqual(core.validateRuleInput("^https://example\\.com/"), { valid: true });
  assert.equal(core.validateRuleInput("[broken").valid, false);
  assert.equal(core.validateRuleInput("https://example.com", "ii").valid, false);
  assert.equal(core.validateRuleInput("", "").valid, false);

  const rules = core.normalizeRules([
    { id: "docs", pattern: "^https://docs\\.example\\.com/", flags: "i", enabled: true },
    { id: "off", pattern: "^https://off\\.example\\.com/", flags: "", enabled: false },
    { id: "invalid", pattern: "[", flags: "", enabled: true }
  ]);
  assert.equal(rules.length, 2, "不正なルールは通常の読み込み時に除外する");

  const classification = core.classifyTabs([
    tab(1, "https://docs.example.com/guide"),
    tab(2, "https://DOCS.EXAMPLE.COM/api"),
    tab(3, "https://off.example.com/"),
    tab(4, "chrome://settings/")
  ], rules);
  assert.deepEqual(classification.keep.map((item) => item.id), [1, 2]);
  assert.deepEqual(classification.close.map((item) => item.id), [3, 4]);
  assert.equal(classification.activeRuleCount, 1);

  const globalRules = [{ id: "search", pattern: "example", flags: "g", enabled: true }];
  const globalClassification = core.classifyTabs([
    tab(1, "https://example.test/a"),
    tab(2, "https://example.test/b")
  ], globalRules);
  assert.deepEqual(globalClassification.keep.map((item) => item.id), [1, 2], "g フラグ付き正規表現でも各タブを独立して評価する");

  const exported = core.createExportPayload({ enabled: false, rules });
  const imported = core.parseImportedSettings(exported);
  assert.equal(imported.enabled, false);
  assert.equal(imported.rules.length, 2);

  expectThrows(
    () => core.parseImportedSettings({ format: "other-extension", settings: { enabled: true, rules: [] } }),
    "別拡張機能の設定ファイルは拒否する"
  );
  expectThrows(
    () => core.parseImportedSettings({ settings: { enabled: true, rules: [{ pattern: "[", flags: "" }] } }),
    "壊れた正規表現を含む設定ファイルは拒否する"
  );

  console.log("verify-core.js: all checks passed");
}

run();
