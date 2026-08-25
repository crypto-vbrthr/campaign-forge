import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../scripts/app/campaign-forge-app.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/campaign-forge.hbs", import.meta.url), "utf8");
const mainSource = fs.readFileSync(new URL("../scripts/main.js", import.meta.url), "utf8");

test("Campaign entry editor exposes Chase Forge prepared-link, new, open, and start controls", () => {
  assert.match(template, /data-cf-chase-link-target/);
  assert.match(template, /data-action="addChaseExternalLink"/);
  assert.match(template, /data-action="openNewChaseForge"/);
  assert.match(template, /data-action="startExternalChase"/);
  assert.match(appSource, /providers\?\.getChaseContext/);
  assert.match(appSource, /providers\?\.startChase/);
  assert.match(appSource, /provider === "chaseForge"/);
});

test("Campaign public API keeps stable v1 while adding a GM-gated Chase integration facade", () => {
  assert.match(mainSource, /apiVersion: 1/);
  assert.match(mainSource, /chaseIntegration: 1/);
  assert.match(mainSource, /chase: Object\.freeze/);
  assert.match(mainSource, /listPrepared: options => \{\s*requireGM\(\)/s);
  assert.match(mainSource, /start: \(kind, targetId, context = \{\}\) => \{\s*requireGM\(\)/s);
  assert.match(mainSource, /pf2eChaseForge\.sessionCompleted/);
});
