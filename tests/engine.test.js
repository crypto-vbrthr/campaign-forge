import test from "node:test";
import assert from "node:assert/strict";

import { CampaignEngine, CampaignEngineError } from "../scripts/engine/campaign-engine.js";
import { MemoryRepository, deterministicOptions } from "./helpers.js";
import { getGroupProgress } from "../scripts/data/state.js";

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


test("overview pins can reference entries, groups, and trackers without duplicates", async () => {
  const { engine } = engineWithRepo();

  const chapter = await engine.createGroup({ title: "Arc", kind: "chapter" });
  const entry = await engine.createEntry({ title: "Clue", type: "knowledge", parentId: chapter.id });
  const tracker = await engine.createTracker({ title: "Reputation", value: 2, min: 0, max: 10 });

  const one = await engine.setOverviewPinned("group", chapter.id, true);
  const two = await engine.setOverviewPinned("entry", entry.id, true);
  const three = await engine.setOverviewPinned("tracker", tracker.id, true);
  const duplicate = await engine.setOverviewPinned("entry", entry.id, true);

  const state = await engine.getState();
  assert.equal(state.overviewPins.length, 3);
  assert.equal(duplicate.id, two.id);
  assert.deepEqual(state.overviewPins.map(pin => pin.id), [one.id, two.id, three.id]);
});

test("overview pins can be reordered and unpinned", async () => {
  const { engine } = engineWithRepo();

  const one = await engine.createEntry({ title: "One" });
  const two = await engine.createEntry({ title: "Two" });
  const three = await engine.createEntry({ title: "Three" });
  const p1 = await engine.setOverviewPinned("entry", one.id, true);
  const p2 = await engine.setOverviewPinned("entry", two.id, true);
  const p3 = await engine.setOverviewPinned("entry", three.id, true);

  await engine.moveOverviewPinByOffset(p3.id, -2);
  let state = await engine.getState();
  assert.deepEqual(
    [...state.overviewPins].sort((a, b) => a.sort - b.sort).map(pin => pin.targetId),
    [three.id, one.id, two.id]
  );

  await engine.setOverviewPinned("entry", one.id, false);
  state = await engine.getState();
  assert.deepEqual(
    [...state.overviewPins].sort((a, b) => a.sort - b.sort).map(pin => pin.targetId),
    [three.id, two.id]
  );
  assert.ok(p1.id);
  assert.ok(p2.id);
});

test("deleting a target also removes its overview pin", async () => {
  const { engine } = engineWithRepo();

  const entry = await engine.createEntry({ title: "Temporary" });
  await engine.setOverviewPinned("entry", entry.id, true);
  await engine.deleteEntry(entry.id);

  const state = await engine.getState();
  assert.equal(state.overviewPins.length, 0);
});

test("group progress includes nested entries and recognizes type-specific reached states", async () => {
  const { engine } = engineWithRepo();

  const chapter = await engine.createGroup({ title: "Ritual", kind: "chapter" });
  const clues = await engine.createGroup({ title: "Clues", parentId: chapter.id });
  const knowledge = await engine.createEntry({ title: "Formula", type: "knowledge", parentId: clues.id });
  const item = await engine.createEntry({ title: "Focus", type: "item", parentId: chapter.id });
  await engine.createEntry({ title: "Final question", type: "mystery", parentId: chapter.id });

  await engine.setEntryStatus(knowledge.id, "discovered");
  await engine.setEntryStatus(item.id, "acquired");

  const state = await engine.getState();
  assert.deepEqual(getGroupProgress(state, chapter.id), { reached: 2, total: 3, percent: 67 });
});

test("key players can link actors, reputation values, and campaign entries", async () => {
  const { engine } = engineWithRepo();

  const reputation = await engine.createTracker({ title: "Mushka relationship", value: 2, min: -10, max: 10 });
  const clue = await engine.createEntry({ title: "Mushka knows Codros", type: "knowledge" });
  const keyPlayer = await engine.createKeyPlayer({
    actorUuid: "Actor.mushka",
    actorName: "Madame Mushka",
    actorImg: "icons/mushka.webp"
  });

  const updated = await engine.updateKeyPlayer(keyPlayer.id, {
    role: "informant",
    state: "active",
    note: "Knows more than she admits.",
    relationshipTrackerId: reputation.id,
    entryLinks: [clue.id]
  });

  assert.equal(updated.actorUuid, "Actor.mushka");
  assert.equal(updated.role, "informant");
  assert.equal(updated.relationshipTrackerId, reputation.id);
  assert.deepEqual(updated.entryLinks, [clue.id]);
});

test("an actor can only be registered once as a key player", async () => {
  const { engine } = engineWithRepo();

  await engine.createKeyPlayer({ actorUuid: "Actor.unique", actorName: "Unique NPC" });
  await assert.rejects(
    () => engine.createKeyPlayer({ actorUuid: "Actor.unique", actorName: "Duplicate NPC" }),
    error => error instanceof CampaignEngineError && error.code === "KEY_PLAYER_ALREADY_EXISTS"
  );
});

test("key player appearances are tied to explicit sessions and logged once per session", async () => {
  const { engine } = engineWithRepo();
  const keyPlayer = await engine.createKeyPlayer({ actorUuid: "Actor.appearance", actorName: "Simmur" });

  await assert.rejects(
    () => engine.markKeyPlayerSeen(keyPlayer.id),
    error => error instanceof CampaignEngineError && error.code === "NO_ACTIVE_SESSION"
  );

  const session = await engine.startSession();
  await engine.markKeyPlayerSeen(keyPlayer.id);
  await engine.markKeyPlayerSeen(keyPlayer.id);

  const state = await engine.getState();
  const stored = state.keyPlayers.find(item => item.id === keyPlayer.id);
  const active = state.sessions.find(item => item.id === session.id);
  assert.equal(stored.lastSeenSessionId, session.id);
  assert.equal(active.changes.length, 1);
  assert.equal(active.changes[0].action, "keyPlayer.appeared");
});

test("key players can be pinned, reordered, and cleaned up with deleted references", async () => {
  const { engine } = engineWithRepo();

  const tracker = await engine.createTracker({ title: "Relationship", value: 1 });
  const entry = await engine.createEntry({ title: "Secret" });
  const first = await engine.createKeyPlayer({ actorUuid: "Actor.first", actorName: "First" });
  const second = await engine.createKeyPlayer({ actorUuid: "Actor.second", actorName: "Second" });
  await engine.updateKeyPlayer(first.id, { relationshipTrackerId: tracker.id, entryLinks: [entry.id] });
  await engine.setOverviewPinned("keyPlayer", first.id, true);

  await engine.moveKeyPlayerByOffset(second.id, -1);
  let state = await engine.getState();
  assert.deepEqual([...state.keyPlayers].sort((a, b) => a.sort - b.sort).map(item => item.id), [second.id, first.id]);

  await engine.deleteEntry(entry.id);
  await engine.deleteTracker(tracker.id);
  state = await engine.getState();
  const storedFirst = state.keyPlayers.find(item => item.id === first.id);
  assert.deepEqual(storedFirst.entryLinks, []);
  assert.equal(storedFirst.relationshipTrackerId, null);

  await engine.deleteKeyPlayer(first.id);
  state = await engine.getState();
  assert.equal(state.overviewPins.some(pin => pin.targetType === "keyPlayer" && pin.targetId === first.id), false);
});

test("transition rules can change status, activity, visibility, and trackers in one transaction", async () => {
  const { engine } = engineWithRepo();

  const source = await engine.createEntry({ title: "Mine", type: "quest", status: "active" });
  const knowledge = await engine.createEntry({ title: "Codros", type: "knowledge", status: "unknown", active: false, visible: false });
  const followup = await engine.createEntry({ title: "Mushka", type: "quest", status: "available", active: false });
  const reputation = await engine.createTracker({ title: "Ostwall", value: 0, min: -10, max: 10 });

  await engine.createTransitionRule(source.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [
      { type: "setEntryStatus", targetId: knowledge.id, status: "discovered" },
      { type: "setEntryVisible", targetId: knowledge.id, value: true },
      { type: "setEntryActive", targetId: followup.id, value: true },
      { type: "adjustTracker", targetId: reputation.id, delta: 2 }
    ]
  });

  const preview = await engine.previewEntryStatusTransition(source.id, "completed");
  assert.equal(preview.consequences.length, 4);
  assert.equal(preview.blocked, false);

  await engine.startSession();
  await engine.setEntryStatus(source.id, "completed");

  const state = await engine.getState();
  assert.equal(state.entries.find(entry => entry.id === source.id).status, "completed");
  assert.equal(state.entries.find(entry => entry.id === knowledge.id).status, "discovered");
  assert.equal(state.entries.find(entry => entry.id === knowledge.id).visible, true);
  assert.equal(state.entries.find(entry => entry.id === followup.id).active, true);
  assert.equal(state.trackers.find(tracker => tracker.id === reputation.id).value, 2);

  const session = state.sessions.find(item => item.status === "active");
  assert.equal(session.changes.length, 5);
  assert.ok(session.changes.every(change => change.transactionId === session.changes[0].transactionId));
  assert.equal(session.changes[0].source, "manual");
  assert.ok(session.changes.slice(1).every(change => change.source === "transition"));
});

test("status consequences can trigger further transition rules", async () => {
  const { engine } = engineWithRepo();

  const a = await engine.createEntry({ title: "A", type: "quest", status: "active" });
  const b = await engine.createEntry({ title: "B", type: "knowledge", status: "unknown" });
  const c = await engine.createEntry({ title: "C", type: "event", status: "pending" });

  await engine.createTransitionRule(a.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [{ type: "setEntryStatus", targetId: b.id, status: "discovered" }]
  });
  await engine.createTransitionRule(b.id, {
    fromStatus: "unknown",
    toStatus: "discovered",
    actions: [{ type: "setEntryStatus", targetId: c.id, status: "occurred" }]
  });

  const preview = await engine.previewEntryStatusTransition(a.id, "completed");
  assert.deepEqual(preview.actions.map(action => action.targetTitle), ["A", "B", "C"]);

  await engine.setEntryStatus(a.id, "completed");
  const state = await engine.getState();
  assert.equal(state.entries.find(entry => entry.id === c.id).status, "occurred");
});

test("transition cycles are detected before data is changed", async () => {
  const { engine } = engineWithRepo();

  const a = await engine.createEntry({ title: "A", type: "note", status: "active" });
  const b = await engine.createEntry({ title: "B", type: "note", status: "active" });

  await engine.createTransitionRule(a.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [{ type: "setEntryStatus", targetId: b.id, status: "completed" }]
  });
  await engine.createTransitionRule(b.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [{ type: "setEntryStatus", targetId: a.id, status: "active" }]
  });
  await engine.createTransitionRule(a.id, {
    fromStatus: "completed",
    toStatus: "active",
    actions: [{ type: "setEntryStatus", targetId: b.id, status: "active" }]
  });
  await engine.createTransitionRule(b.id, {
    fromStatus: "completed",
    toStatus: "active",
    actions: [{ type: "setEntryStatus", targetId: a.id, status: "completed" }]
  });

  const preview = await engine.previewEntryStatusTransition(a.id, "completed");
  assert.equal(preview.blocked, true);
  assert.ok(preview.warnings.some(warning => warning.code === "TRANSITION_CYCLE"));

  await assert.rejects(
    () => engine.setEntryStatus(a.id, "completed"),
    error => error instanceof CampaignEngineError && error.code === "TRANSITION_CYCLE"
  );
  const state = await engine.getState();
  assert.equal(state.entries.find(entry => entry.id === a.id).status, "active");
  assert.equal(state.entries.find(entry => entry.id === b.id).status, "active");
});

test("transition rules are validated, editable, removable, and cleaned when targets are deleted", async () => {
  const { engine } = engineWithRepo();
  const source = await engine.createEntry({ title: "Source", type: "quest", status: "active" });
  const target = await engine.createEntry({ title: "Target", type: "knowledge" });

  const rule = await engine.createTransitionRule(source.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [{ type: "setEntryStatus", targetId: target.id, status: "discovered" }]
  });
  const updated = await engine.updateTransitionRule(source.id, rule.id, {
    enabled: false,
    actions: [{ type: "setEntryVisible", targetId: target.id, value: false }]
  });
  assert.equal(updated.enabled, false);
  assert.equal(updated.actions[0].type, "setEntryVisible");

  await engine.deleteEntry(target.id);
  let state = await engine.getState();
  assert.equal(state.entries.find(entry => entry.id === source.id).transitionRules.length, 0);

  const other = await engine.createEntry({ title: "Other", type: "knowledge" });
  const second = await engine.createTransitionRule(source.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [{ type: "setEntryStatus", targetId: other.id, status: "discovered" }]
  });
  await engine.deleteTransitionRule(source.id, second.id);
  state = await engine.getState();
  assert.equal(state.entries.find(entry => entry.id === source.id).transitionRules.length, 0);
});

test("entries can manage multiple Journal references with one primary link", async () => {
  const { engine } = engineWithRepo();
  const entry = await engine.createEntry({ title: "Ritual", type: "knowledge" });

  const first = await engine.addJournalLink(entry.id, {
    uuid: "JournalEntry.ritual",
    role: "details",
    label: "Ritual Notes"
  });
  const second = await engine.addJournalLink(entry.id, {
    uuid: "JournalEntry.ritual.JournalEntryPage.sources",
    role: "source",
    label: "Sources"
  });

  let state = await engine.getState();
  let stored = state.entries.find(candidate => candidate.id === entry.id);
  assert.equal(stored.journalLinks.length, 2);
  assert.equal(stored.journalLinks.find(link => link.id === first.id).primary, true);
  assert.equal(stored.journalLinks.find(link => link.id === second.id).primary, false);

  await engine.updateJournalLink(entry.id, second.id, { primary: true, role: "handout" });
  state = await engine.getState();
  stored = state.entries.find(candidate => candidate.id === entry.id);
  assert.equal(stored.journalLinks.find(link => link.id === first.id).primary, false);
  assert.equal(stored.journalLinks.find(link => link.id === second.id).primary, true);
  assert.equal(stored.journalLinks.find(link => link.id === second.id).role, "handout");
});

test("duplicate and invalid Journal links are rejected", async () => {
  const { engine } = engineWithRepo();
  const entry = await engine.createEntry({ title: "Journal test" });
  await engine.addJournalLink(entry.id, { uuid: "JournalEntry.one" });

  await assert.rejects(
    () => engine.addJournalLink(entry.id, { uuid: "JournalEntry.one" }),
    error => error instanceof CampaignEngineError && error.code === "JOURNAL_LINK_EXISTS"
  );
  await assert.rejects(
    () => engine.addJournalLink(entry.id, { uuid: "JournalEntry.two", role: "banana" }),
    error => error instanceof CampaignEngineError && error.code === "INVALID_JOURNAL_LINK_ROLE"
  );
});

test("removing a primary Journal link promotes the next reference", async () => {
  const { engine } = engineWithRepo();
  const entry = await engine.createEntry({ title: "Journal cleanup" });
  const first = await engine.addJournalLink(entry.id, { uuid: "JournalEntry.first" });
  const second = await engine.addJournalLink(entry.id, { uuid: "JournalEntry.second" });

  await engine.removeJournalLink(entry.id, first.id);
  const state = await engine.getState();
  const stored = state.entries.find(candidate => candidate.id === entry.id);
  assert.equal(stored.journalLinks.length, 1);
  assert.equal(stored.journalLinks[0].id, second.id);
  assert.equal(stored.journalLinks[0].primary, true);
});

test("Journal reference changes are recorded as structural session changes", async () => {
  const { engine } = engineWithRepo();
  const entry = await engine.createEntry({ title: "Journal logging" });
  await engine.startSession();
  const link = await engine.addJournalLink(entry.id, { uuid: "JournalEntry.log" });
  await engine.updateJournalLink(entry.id, link.id, { role: "source" });
  await engine.removeJournalLink(entry.id, link.id);

  const state = await engine.getState();
  const session = state.sessions.find(candidate => candidate.status === "active");
  assert.deepEqual(session.changes.map(change => change.action), [
    "entry.journal.added",
    "entry.journal.updated",
    "entry.journal.removed"
  ]);
  assert.ok(session.changes.every(change => change.structural));
});

test("status changes originating from Journals use the normal transition transaction", async () => {
  const { engine } = engineWithRepo();
  const source = await engine.createEntry({ title: "Journal quest", type: "quest", status: "active" });
  const target = await engine.createEntry({ title: "Journal clue", type: "knowledge", status: "unknown" });
  await engine.createTransitionRule(source.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [{ type: "setEntryStatus", targetId: target.id, status: "discovered" }]
  });

  await engine.startSession();
  await engine.setEntryStatus(source.id, "completed", { source: "journal" });
  const state = await engine.getState();
  const session = state.sessions.find(candidate => candidate.status === "active");
  assert.equal(session.changes[0].source, "journal");
  assert.equal(session.changes[1].source, "transition");
  assert.equal(session.changes[0].transactionId, session.changes[1].transactionId);
  assert.equal(state.entries.find(candidate => candidate.id === target.id).status, "discovered");
});
