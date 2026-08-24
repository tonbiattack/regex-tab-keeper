"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest declares a loadable Manifest V3 extension", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest.permissions.sort(), ["storage", "tabs"]);
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.background.service_worker, "background.js");

  for (const file of [manifest.action.default_popup, manifest.background.service_worker, "core.js"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must be included in the extension package`);
  }
});
