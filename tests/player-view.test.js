import test from "node:test";
import assert from "node:assert/strict";

import { buildPlayerProjection, publicGroupProgress } from "../scripts/player/player-projection.js";
import { normalizeState } from "../scripts/data/state.js";

function baseState() {
  return normalizeState({
    schemaVersion: 1,
    groups: [
      { id: "secret", title: "Der wahre Verräter", kind: "chapter", parentId: null, sort: 1000 },
      { id: "public", title: "Bekannte Hinweise", kind: "group", parentId: "secret", sort: 1000, playerVisible: true }
    ],
    entries: [
      { id: "known", type: "knowledge", title: "Gefundener Hinweis", description: "Öffentliche Beschreibung", status: "discovered", visible: true, active: true, parentId: "public", sort: 1000 },
      { id: "hidden", type: "knowledge", title: "Geheimer Hinweis", description: "Darf nicht erscheinen", status: "confirmed", visible: false, active: true, parentId: "public", sort: 2000 }
    ],
    trackers: [
      { id: "rep", title: "Ruf Ostwall", description: "GM secret", playerDescription: "Euer Ruf in Ostwall", playerVisible: true, value: 7, min: -10, max: 10, sort: 1000 },
      { id: "doom", title: "Untergangsuhr", description: "secret", playerVisible: false, value: 4, sort: 2000 }
    ],
    keyPlayers: [
      { id: "npc", actorUuid: "Actor.a", actorName: "Mushka", actorImg: "mushka.webp", role: "informant", state: "active", note: "GM secret", playerNote: "Eine bekannte Informantin", playerVisible: true, relationshipTrackerId: "rep", entryLinks: ["known", "hidden"], sort: 1000 }
    ],
    overviewPins: [
      { id: "pin-entry", targetType: "entry", targetId: "known", sort: 1000, playerVisible: true },
      { id: "pin-group", targetType: "group", targetId: "public", sort: 2000, playerVisible: true },
      { id: "pin-hidden", targetType: "tracker", targetId: "doom", sort: 3000, playerVisible: true }
    ],
    sessions: [{ id: "s1", number: 1, status: "closed", changes: [{ targetTitle: "secret" }] }],
    meta: { nextSessionNumber: 2, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }
  });
}

test("new player-publication fields migrate conservatively as private", () => {
  const state = normalizeState({ groups: [{ id: "g", title: "G", kind: "group" }], trackers: [{ id: "t", title: "T" }], keyPlayers: [{ id: "k", actorUuid: "Actor.k" }], overviewPins: [{ targetType: "group", targetId: "g" }] });
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.groups[0].playerVisible, false);
  assert.equal(state.trackers[0].playerVisible, false);
  assert.equal(state.keyPlayers[0].playerVisible, false);
  assert.equal(state.overviewPins[0].playerVisible, false);
});

test("player projection excludes GM-only campaign data and secret notes", () => {
  const projection = buildPlayerProjection(baseState());
  assert.deepEqual(projection.entries.map(e => e.id), ["known"]);
  assert.equal(projection.entries[0].description, "Öffentliche Beschreibung");
  assert.equal(projection.groups.some(g => g.id === "secret"), false);
  assert.equal(projection.groups.find(g => g.id === "public").parentId, null);
  assert.deepEqual(projection.trackers.map(t => t.id), ["rep"]);
  assert.equal(projection.trackers[0].description, "Euer Ruf in Ostwall");
  assert.equal(projection.keyPlayers[0].note, "Eine bekannte Informantin");
  assert.deepEqual(projection.keyPlayers[0].entryLinks, ["known"]);
  assert.deepEqual(projection.overviewPins.map(p => p.id), ["pin-entry", "pin-group"]);
  assert.equal("sessions" in projection, false);
  assert.equal(JSON.stringify(projection).includes("GM secret"), false);
  assert.equal(JSON.stringify(projection).includes("Geheimer Hinweis"), false);
  assert.equal(JSON.stringify(projection).includes("Untergangsuhr"), false);
});

test("public group progress never reveals hidden entries through its denominator", () => {
  const state = baseState();
  const progress = publicGroupProgress(state, "public");
  assert.deepEqual(progress, { reached: 1, total: 1, percent: 100 });
});

test("player overview pins require both pin publication and public target", () => {
  const state = baseState();
  state.overviewPins.push({ id: "pin-private-entry", targetType: "entry", targetId: "hidden", sort: 4000, playerVisible: true });
  state.overviewPins.push({ id: "pin-not-published", targetType: "tracker", targetId: "rep", sort: 5000, playerVisible: false });
  const projection = buildPlayerProjection(state);
  assert.deepEqual(projection.overviewPins.map(p => p.id), ["pin-entry", "pin-group"]);
});

import { CampaignEngine } from "../scripts/engine/campaign-engine.js";
import { MemoryRepository, deterministicOptions } from "./helpers.js";

test("GM publication controls persist on groups, trackers, key players, and overview pins", async () => {
  const engine = new CampaignEngine(new MemoryRepository(), deterministicOptions());
  const group = await engine.createGroup({ title: "Public", playerVisible: true });
  const tracker = await engine.createTracker({ title: "Ruf", value: 2, playerVisible: true, playerDescription: "Öffentlich" });
  const entry = await engine.createEntry({ title: "Hinweis", type: "knowledge", visible: true });
  const keyPlayer = await engine.createKeyPlayer({ actorUuid: "Actor.public", actorName: "Public NPC", playerVisible: true, playerNote: "Bekannt" });
  const pin = await engine.setOverviewPinned("entry", entry.id, true);
  await engine.setOverviewPlayerVisible(pin.id, true);
  const state = await engine.getState();
  assert.equal(state.groups.find(g => g.id === group.id).playerVisible, true);
  assert.equal(state.trackers.find(t => t.id === tracker.id).playerDescription, "Öffentlich");
  assert.equal(state.keyPlayers.find(k => k.id === keyPlayer.id).playerNote, "Bekannt");
  assert.equal(state.overviewPins.find(p => p.id === pin.id).playerVisible, true);
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("public module API does not hand full campaign state or transition previews to players", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const main = fs.readFileSync(path.join(root, "scripts/main.js"), "utf8");
  assert.match(main, /getState:\s*async \(\) => \{[\s\S]*game\.user\?\.isGM \? state : buildPlayerProjection\(state\)/);
  assert.match(main, /previewEntryStatusTransition:[\s\S]*requireGM\(\)/);
});


test("GM player-view preview calculates group progress from the published projection", () => {
  const source = fs.readFileSync(new URL("../scripts/player/player-campaign-forge-app.js", import.meta.url), "utf8");
  assert.match(source, /publicGroupProgress\(state, group\.id\)/);
  assert.doesNotMatch(source, /publicGroupProgress\(fullState, group\.id\)/);
});
