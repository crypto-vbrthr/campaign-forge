import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleJson = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const mainSource = fs.readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");
const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
const apiContract = fs.readFileSync(new URL("../API-CONTRACT.md", import.meta.url), "utf8");

test("stable package and public API versions stay aligned", () => {
  assert.equal(moduleJson.version, "1.0.0");
  assert.equal(packageJson.version, moduleJson.version);
  assert.match(mainSource, /version: module\.version \?\? "1\.0\.0"/);
  assert.match(mainSource, /apiVersion: 1/);
  assert.match(mainSource, /schemaVersion: 2/);
  assert.match(mainSource, /stability: "stable"/);
});

test("stable documentation reflects protected persistence", () => {
  assert.doesNotMatch(readme, /canonical Campaign Forge state is currently persisted in a \*\*non-configurable world-scoped Foundry setting\*\*/);
  assert.doesNotMatch(readme, /Campaign data is stored in a non-configurable world setting\./);
  assert.match(readme, /ownership-protected `JournalEntry`/);
  assert.match(apiContract, /Public API v1/);
  assert.match(readme, /^# Campaign Forge v1\.0\.0/m);
  assert.match(readme, /## v1\.0\.0 Stable Release/);
  assert.match(apiContract, /Stable Contract/);
  assert.match(apiContract, /campaign\.stability === "stable"/);
});

test("raw provider and storage internals are GM-gated in the public API", () => {
  const integrationBlock = mainSource.slice(mainSource.indexOf("integrations: Object.freeze"), mainSource.indexOf("addJournalLink:"));
  assert.match(integrationBlock, /getApi: providerId => \{\s*requireGM\(\)/s);
  assert.match(integrationBlock, /getStatus: \(\) => \{\s*requireGM\(\)/s);
});

test("Campaign Forge exposes a ready discovery hook for suite consumers", () => {
  assert.match(mainSource, /ready: "campaignForge\.ready"/);
  assert.match(mainSource, /if \(storageReady\) Hooks\.callAll\("campaignForge\.ready"/);
});

test("all literal Campaign Forge localization keys used by scripts/templates exist in both locales", () => {
  const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const en = JSON.parse(fs.readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  const de = JSON.parse(fs.readFileSync(new URL("../lang/de.json", import.meta.url), "utf8"));
  const hasKey = (object, key) => key.split(".").every(part => {
    if (!object || typeof object !== "object" || !(part in object)) return false;
    object = object[part];
    return true;
  });
  const files = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:js|hbs)$/.test(entry.name)) files.push(full);
    }
  };
  walk(`${rootPath}/scripts`);
  walk(`${rootPath}/templates`);
  const keys = new Set();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/CAMPAIGN_FORGE(?:\.[A-Za-z0-9_-]+)+/g)) keys.add(match[0]);
  }
  for (const key of keys) {
    assert.equal(hasKey(en, key), true, `Missing EN localization: ${key}`);
    assert.equal(hasKey(de, key), true, `Missing DE localization: ${key}`);
  }
});
