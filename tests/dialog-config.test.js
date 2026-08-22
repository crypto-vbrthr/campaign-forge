import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(here, "../scripts/app/campaign-forge-app.js");

test("Campaign Forge DialogV2 configurations never use an empty buttons array", () => {
  const source = fs.readFileSync(appPath, "utf8");
  assert.equal(/buttons\s*:\s*\[\s*\]/m.test(source), false);
});

test("provider editor dialogs expose a localized close action", () => {
  const source = fs.readFileSync(appPath, "utf8");
  const matches = source.match(/label:\s*localize\("CAMPAIGN_FORGE\.Actions\.Close"\)/g) ?? [];
  assert.ok(matches.length >= 3);
});
