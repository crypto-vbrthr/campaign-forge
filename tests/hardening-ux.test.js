import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CampaignEngine, CampaignEngineError } from "../scripts/engine/campaign-engine.js";
import { auditStateIntegrity, createDefaultState, getGroupProgress, normalizeState } from "../scripts/data/state.js";
import { MemoryRepository, deterministicOptions } from "./helpers.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

class SlowMemoryRepository extends MemoryRepository {
  async load() {
    const value = await super.load();
    await new Promise(resolve => setTimeout(resolve, 4));
    return value;
  }
  async save(state) {
    await new Promise(resolve => setTimeout(resolve, 4));
    return super.save(state);
  }
}

test("client-side mutations are serialized so overlapping edits do not overwrite each other", async () => {
  const repository = new SlowMemoryRepository();
  const engine = new CampaignEngine(repository, deterministicOptions());

  await Promise.all([
    engine.createEntry({ title: "First" }),
    engine.createEntry({ title: "Second" })
  ]);

  const state = await engine.getState();
  assert.equal(state.entries.length, 2);
  assert.deepEqual(new Set(state.entries.map(entry => entry.title)), new Set(["First", "Second"]));
  assert.equal(state.meta.revision, 2);
});

test("normalization repairs safe orphan references and disables invalid transition rules", () => {
  const raw = createDefaultState();
  raw.groups = [
    { id: "g1", title: "Orphan", kind: "group", parentId: "missing", sort: 1000 },
    { id: "g2", title: "Cycle A", kind: "group", parentId: "g3", sort: 2000 },
    { id: "g3", title: "Cycle B", kind: "group", parentId: "g2", sort: 3000 }
  ];
  raw.entries = [{
    id: "e1", title: "Entry", type: "quest", status: "active", parentId: "missing", sort: 1000,
    transitionRules: [{
      id: "r1", enabled: true, fromStatus: "active", toStatus: "completed", conditions: [],
      actions: [{ id: "a1", type: "setEntryStatus", targetId: "missing-entry", status: "completed" }]
    }]
  }];
  raw.overviewPins = [
    { id: "p1", targetType: "entry", targetId: "e1", sort: 1000 },
    { id: "p2", targetType: "entry", targetId: "e1", sort: 2000 },
    { id: "p3", targetType: "entry", targetId: "gone", sort: 3000 }
  ];

  const state = normalizeState(raw);
  assert.equal(state.groups.find(group => group.id === "g1").parentId, null);
  assert.equal(state.entries[0].parentId, null);
  assert.equal(state.overviewPins.length, 1);
  assert.equal(state.entries[0].transitionRules[0].enabled, false);

  // The cycle must no longer survive normalization.
  const g2 = state.groups.find(group => group.id === "g2");
  const g3 = state.groups.find(group => group.id === "g3");
  assert.ok(g2.parentId === null || g3.parentId === null);
});

test("integrity auditor and guarded import reject duplicate IDs", async () => {
  const raw = createDefaultState();
  raw.entries = [
    { id: "same", title: "A", type: "note", status: "active" },
    { id: "same", title: "B", type: "note", status: "active" }
  ];
  const audit = auditStateIntegrity(normalizeState(raw));
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some(issue => issue.code === "duplicateId"));

  const engine = new CampaignEngine(new MemoryRepository(), deterministicOptions());
  await assert.rejects(
    () => engine.replaceState(raw),
    error => error instanceof CampaignEngineError && error.code === "IMPORT_INVALID_STATE"
  );
});

test("group progress remains correct for large campaign branches", () => {
  const state = createDefaultState();
  state.groups.push({ id: "root", title: "Root", kind: "chapter", parentId: null, sort: 1000 });
  for (let g = 0; g < 20; g++) {
    state.groups.push({ id: `g-${g}`, title: `Group ${g}`, kind: "group", parentId: "root", sort: (g + 1) * 1000 });
    for (let e = 0; e < 100; e++) {
      state.entries.push({
        id: `e-${g}-${e}`, title: `Entry ${g}-${e}`, type: "knowledge",
        status: e % 2 === 0 ? "discovered" : "unknown", parentId: `g-${g}`, sort: (e + 1) * 1000
      });
    }
  }
  const progress = getGroupProgress(normalizeState(state), "root");
  assert.equal(progress.total, 2000);
  assert.equal(progress.reached, 1000);
  assert.equal(progress.percent, 50);
});

test("hardening UX exposes campaign filters, data health and guarded backups", () => {
  const template = fs.readFileSync(path.join(ROOT, "templates", "campaign-forge.hbs"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "scripts", "app", "campaign-forge-app.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles", "campaign-forge.css"), "utf8");

  assert.match(template, /data-cf-campaign-query/);
  assert.match(template, /data-cf-campaign-type-filter/);
  assert.match(template, /data-action="exportBackup"/);
  assert.match(template, /data-action="importBackup"/);
  assert.match(template, /data-action="refreshDataHealth"/);
  assert.match(app, /replaceState\(candidate\)/);
  assert.match(app, /campaign-forge-backup/);
  assert.match(css, /\.campaign-forge \.cf-campaign-filter-bar/);
  assert.match(css, /\.campaign-forge \.cf-health-summary/);
});


test("campaign live search preserves focus and caret across debounced rerenders", () => {
  const app = fs.readFileSync(path.join(ROOT, "scripts", "app", "campaign-forge-app.js"), "utf8");

  assert.match(app, /const input = event\.currentTarget;[\s\S]*document\.activeElement === input/);
  assert.match(app, /campaignQuery\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /campaignQuery\.setSelectionRange\(start, end, focus\.direction\)/);
});
