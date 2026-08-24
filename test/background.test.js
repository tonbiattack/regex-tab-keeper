"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const backgroundPath = path.resolve(__dirname, "../background.js");
const corePath = path.resolve(__dirname, "../core.js");

function loadBackground({ settings, tabs }) {
  const calls = { query: [], remove: [], listeners: [] };
  global.RegexTabKeeperCore = undefined;
  global.importScripts = (file) => {
    assert.equal(file, "core.js");
    delete require.cache[corePath];
    global.RegexTabKeeperCore = require(corePath);
  };
  global.chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener(listener) { calls.listeners.push(listener); } }
    },
    storage: {
      local: { get(_defaults, callback) { callback(settings); } }
    },
    tabs: {
      query(queryInfo, callback) { calls.query.push(queryInfo); callback(tabs); },
      remove(ids, callback) { calls.remove.push(ids); callback(); }
    }
  };
  delete require.cache[backgroundPath];
  const background = require(backgroundPath);
  return { background, calls };
}

function request(handler, message) {
  return new Promise((resolve) => {
    const keepChannelOpen = handler(message, {}, resolve);
    assert.equal(keepChannelOpen, true);
  });
}

test.afterEach(() => {
  delete global.chrome;
  delete global.importScripts;
  delete global.RegexTabKeeperCore;
  delete require.cache[backgroundPath];
  delete require.cache[corePath];
});

test("preview reads current-window tabs and returns a safe classification", async () => {
  const { background, calls } = loadBackground({
    settings: { enabled: true, rules: [{ id: "keep", pattern: "example\\.com", flags: "", enabled: true }] },
    tabs: [
      { id: 1, title: "Keep", url: "https://example.com/docs" },
      { id: 2, title: "Close", url: "https://other.test/" }
    ]
  });

  const response = await request(background.handleMessage, { type: "getPreview" });
  assert.equal(response.ok, true);
  assert.deepEqual(calls.query, [{ currentWindow: true }]);
  assert.deepEqual(response.preview.keep.map((tab) => tab.id), [1]);
  assert.deepEqual(response.preview.close.map((tab) => tab.id), [2]);
});

test("close request refuses to remove tabs without an enabled rule", async () => {
  const { background, calls } = loadBackground({
    settings: { enabled: true, rules: [{ id: "off", pattern: "example", flags: "", enabled: false }] },
    tabs: [{ id: 1, title: "Only tab", url: "https://example.com/" }]
  });

  const response = await request(background.handleMessage, { type: "closeNonMatchingTabs" });
  assert.equal(response.ok, false);
  assert.match(response.message, /有効な URL 正規表現がありません/);
  assert.deepEqual(calls.remove, []);
});

test("close request removes only nonmatching tab IDs and reports counts", async () => {
  const { background, calls } = loadBackground({
    settings: { enabled: true, rules: [{ id: "keep", pattern: "^https://keep\\.test/", flags: "", enabled: true }] },
    tabs: [
      { id: 10, title: "Keep", url: "https://keep.test/" },
      { id: 11, title: "Close", url: "https://close.test/" },
      { id: "not-an-id", title: "Ignored ID", url: "https://close.test/" }
    ]
  });

  const response = await request(background.handleMessage, { type: "closeNonMatchingTabs" });
  assert.deepEqual(calls.remove, [[11]]);
  assert.deepEqual(response, { ok: true, result: { closedCount: 1, keptCount: 1 } });
});
