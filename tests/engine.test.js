import test from "node:test";
import assert from "node:assert/strict";

import { CampaignEngine, CampaignEngineError } from "../scripts/engine/campaign-engine.js";
import { MemoryRepository, deterministicOptions } from "./helpers.js";

function engineWithRepo() {
  const repository = new MemoryRepository();
  const engine = new CampaignEngine(repository, deterministicOptions());
  return { engine, repository };
}

test("creates chapters, groups, and entries with valid defaults", async () => {
  const { engine } = engineWithRepo();

  const chapter = await engine.createGroup({ title: "Arc One", kind: "chapter" });
  const group = await engine.createGroup({ title: "Knowledge", parentId: chapter.id });
  const entry = await engine.createEntry({ title: "Ritual clue", type: "knowledge", parentId: group.id });

  assert.equal(chapter.kind, "chapter");
  assert.equal(chapter.parentId, null);
  assert.equal(group.parentId, chapter.id);
  assert.equal(entry.parentId, group.id);
  assert.equal(entry.status, "unknown");
});

test("explicit sessions only record changes while active", async () => {
  const { engine } = engineWithRepo();

  await engine.createEntry({ title: "Outside session", type: "quest" });
  let state = await engine.getState();
  assert.equal(state.sessions.length, 0);

  const session = await engine.startSession();
  const entry = await engine.createEntry({ title: "Inside session", type: "quest" });
  await engine.setEntryStatus(entry.id, "active");
  await engine.endSession();

  state = await engine.getState();
  const stored = state.sessions.find(s => s.id === session.id);
  assert.equal(stored.status, "closed");
  assert.equal(stored.changes.length, 2);
  assert.equal(stored.changes[0].action, "entry.created");
  assert.equal(stored.changes[1].action, "entry.status");
});

test("session numbers increment monotonically", async () => {
  const { engine } = engineWithRepo();

  const one = await engine.startSession();
  await engine.endSession();
  const two = await engine.startSession();

  assert.equal(one.number, 1);
  assert.equal(two.number, 2);
});

test("cannot start two sessions at once", async () => {
  const { engine } = engineWithRepo();

  await engine.startSession();
  await assert.rejects(
    () => engine.startSession(),
    error => error instanceof CampaignEngineError && error.code === "SESSION_ALREADY_ACTIVE"
  );
});

test("entry status is validated against its type", async () => {
  const { engine } = engineWithRepo();

  const entry = await engine.createEntry({ title: "A clue", type: "knowledge" });
  await engine.setEntryStatus(entry.id, "discovered");

  const state = await engine.getState();
  assert.equal(state.entries[0].status, "discovered");

  await assert.rejects(
    () => engine.setEntryStatus(entry.id, "failed"),
    error => error instanceof CampaignEngineError && error.code === "INVALID_STATUS"
  );
});

test("entries can move between groups and are re-sorted", async () => {
  const { engine } = engineWithRepo();

  const a = await engine.createGroup({ title: "A", kind: "chapter" });
  const b = await engine.createGroup({ title: "B", kind: "chapter" });
  const one = await engine.createEntry({ title: "One", parentId: a.id });
  const two = await engine.createEntry({ title: "Two", parentId: a.id });

  await engine.moveNode({
    nodeType: "entry",
    nodeId: two.id,
    parentId: b.id
  });

  await engine.moveNode({
    nodeType: "entry",
    nodeId: one.id,
    parentId: b.id,
    beforeType: "entry",
    beforeId: two.id
  });

  const state = await engine.getState();
  const entries = state.entries
    .filter(e => e.parentId === b.id)
    .sort((x, y) => x.sort - y.sort);

  assert.deepEqual(entries.map(e => e.title), ["One", "Two"]);
});

test("non-empty groups cannot be deleted", async () => {
  const { engine } = engineWithRepo();

  const group = await engine.createGroup({ title: "Group", kind: "chapter" });
  await engine.createEntry({ title: "Child", parentId: group.id });

  await assert.rejects(
    () => engine.deleteGroup(group.id),
    error => error instanceof CampaignEngineError && error.code === "GROUP_NOT_EMPTY"
  );
});

test("trackers clamp to optional min and max and log during sessions", async () => {
  const { engine } = engineWithRepo();

  const tracker = await engine.createTracker({
    title: "Reputation",
    value: 0,
    min: -2,
    max: 2
  });

  await engine.startSession();
  await engine.adjustTracker(tracker.id, 10);
  await engine.adjustTracker(tracker.id, -10);

  const state = await engine.getState();
  const stored = state.trackers.find(t => t.id === tracker.id);
  const session = state.sessions.find(s => s.status === "active");

  assert.equal(stored.value, -2);
  assert.equal(session.changes.length, 2);
  assert.equal(session.changes[0].action, "tracker.adjusted");
  assert.equal(session.changes[1].action, "tracker.adjusted");
});

test("chapters cannot be nested and group cycles are rejected", async () => {
  const { engine } = engineWithRepo();

  const chapter = await engine.createGroup({ title: "Chapter", kind: "chapter" });
  const group = await engine.createGroup({ title: "Group", parentId: chapter.id });
  const subgroup = await engine.createGroup({ title: "Subgroup", parentId: group.id });

  await assert.rejects(
    () => engine.moveNode({ nodeType: "group", nodeId: chapter.id, parentId: group.id }),
    error => error instanceof CampaignEngineError && error.code === "CHAPTER_MUST_BE_ROOT"
  );

  await assert.rejects(
    () => engine.moveNode({ nodeType: "group", nodeId: group.id, parentId: subgroup.id }),
    error => error instanceof CampaignEngineError && error.code === "GROUP_CYCLE"
  );
});


test("tracker ranges are validated and values are clamped on create/update", async () => {
  const { engine } = engineWithRepo();

  await assert.rejects(
    () => engine.createTracker({ title: "Broken", min: 5, max: 1 }),
    error => error instanceof CampaignEngineError && error.code === "INVALID_TRACKER_RANGE"
  );

  const tracker = await engine.createTracker({ title: "Bounded", value: 20, min: 0, max: 10 });
  assert.equal(tracker.value, 10);

  const updated = await engine.updateTracker(tracker.id, { value: -5 });
  assert.equal(updated.value, 0);
});


test("manual session changes can be added, edited, and removed while a session is active", async () => {
  const { engine } = engineWithRepo();

  await engine.startSession();
  const change = await engine.addManualSessionChange({
    title: "The party chooses the eastern passage",
    description: "This may matter later.",
    kind: "decision"
  });

  let state = await engine.getState();
  let session = state.sessions.find(s => s.status === "active");
  assert.equal(session.changes.length, 1);
  assert.equal(session.changes[0].action, "session.manual");
  assert.equal(session.changes[0].details.kind, "decision");
  assert.equal(session.changes[0].details.description, "This may matter later.");

  const edited = await engine.updateManualSessionChange(change.id, {
    title: "The party takes the western passage",
    description: "Corrected after checking the map.",
    kind: "event"
  });
  assert.equal(edited.targetTitle, "The party takes the western passage");
  assert.equal(edited.details.kind, "event");
  assert.equal(edited.details.description, "Corrected after checking the map.");
  assert.ok(edited.editedAt);

  state = await engine.getState();
  session = state.sessions.find(s => s.status === "active");
  assert.equal(session.changes.length, 1);
  assert.equal(session.changes[0].targetTitle, "The party takes the western passage");

  await engine.deleteManualSessionChange(change.id);
  state = await engine.getState();
  session = state.sessions.find(s => s.status === "active");
  assert.equal(session.changes.length, 0);
});

test("manual session changes require an active session and a valid kind", async () => {
  const { engine } = engineWithRepo();

  await assert.rejects(
    () => engine.addManualSessionChange({ title: "No session" }),
    error => error instanceof CampaignEngineError && error.code === "NO_ACTIVE_SESSION"
  );

  await engine.startSession();
  await assert.rejects(
    () => engine.addManualSessionChange({ title: "Bad kind", kind: "banana" }),
    error => error instanceof CampaignEngineError && error.code === "INVALID_SESSION_CHANGE_KIND"
  );
});
