import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../scripts/app/campaign-forge-app.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/campaign-forge.hbs", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles/campaign-forge.css", import.meta.url), "utf8");

test("transition entry targets expose optional live filters", () => {
  assert.match(template, /data-cf-entry-target-filter=/);
  assert.match(template, /data-cf-entry-target-filter-query=/);
  assert.match(template, /data-cf-entry-target-filter-type=/);
  assert.match(template, /data-cf-entry-target-filter-scope=/);
  assert.match(template, /data-cf-entry-target-select=/);
  assert.match(source, /_applyEntryTargetFilter\(root, key\)/);
  assert.match(source, /option\.selected \|\| matches/);
  assert.match(source, /scope === "inactive"/);
  assert.match(css, /\.cf-entry-target-filter-controls/);
});

test("transition target filters are ephemeral UI state", () => {
  assert.match(source, /this\._entryTargetFilters = new Map\(\)/);
  assert.doesNotMatch(source, /payload[^\n]*entryTargetFilters/);
});


test("transition rule editor exposes an any-previous-status trigger", () => {
  assert.match(source, /TRANSITION_ANY_STATUS/);
  assert.match(source, /transitionFromStatusOptions/);
  assert.match(template, /data-cf-rule-field="fromStatus"/);
});


test("reward rule editor also exposes an any-previous-status trigger", () => {
  assert.match(source, /fromStatus: TRANSITION_ANY_STATUS,[\s\S]*rewards: \[\]/);
  assert.match(source, /fromStatuses: transitionFromStatusOptions\(source\.type, draft\.fromStatus\)/);
  assert.match(template, /data-cf-reward-field="fromStatus"/);
});
