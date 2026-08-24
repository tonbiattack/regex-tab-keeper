"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

function readPngDimensions(file) {
  const buffer = fs.readFileSync(file);
  assert.deepEqual(buffer.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

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

test("manifest icons exist at their declared PNG dimensions", () => {
  const expectedIcons = {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png"
  };
  assert.deepEqual(manifest.icons, expectedIcons);
  assert.deepEqual(manifest.action.default_icon, {
    16: expectedIcons[16],
    32: expectedIcons[32]
  });

  for (const [size, iconPath] of Object.entries(expectedIcons)) {
    assert.deepEqual(readPngDimensions(path.join(root, iconPath)), { width: Number(size), height: Number(size) });
  }
});
