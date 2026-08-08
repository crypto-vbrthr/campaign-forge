import { ENTRY_TYPES, OVERVIEW_REACHED_STATUSES, SORT_STEP } from "../core/constants.js";

function nowIso() {
  return new Date().toISOString();
}

export function cloneData(value) {
  if (value === undefined) return undefined;
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultState() {
  return {
    schemaVersion: 1,
    groups: [],
    entries: [],
    trackers: [],
    keyPlayers: [],
    overviewPins: [],
    sessions: [],
    meta: {
      nextSessionNumber: 1,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  };
}

export function normalizeState(raw) {
  const base = createDefaultState();
  const state = raw && typeof raw === "object" ? cloneData(raw) : {};

  state.schemaVersion = Number(state.schemaVersion ?? base.schemaVersion);
  state.groups = Array.isArray(state.groups) ? state.groups : [];
  state.entries = Array.isArray(state.entries) ? state.entries : [];
  state.trackers = Array.isArray(state.trackers) ? state.trackers : [];
  state.keyPlayers = Array.isArray(state.keyPlayers) ? state.keyPlayers : [];
  state.overviewPins = Array.isArray(state.overviewPins) ? state.overviewPins : [];
  state.sessions = Array.isArray(state.sessions) ? state.sessions : [];
  state.meta = { ...base.meta, ...(state.meta ?? {}) };
  state.meta.nextSessionNumber = Math.max(
    1,
    Number(state.meta.nextSessionNumber ?? 1)
  );

  for (const group of state.groups) {
    group.kind = group.kind === "chapter" ? "chapter" : "group";
    group.parentId = group.kind === "chapter" ? null : (group.parentId ?? null);
    group.sort = Number.isFinite(Number(group.sort)) ? Number(group.sort) : SORT_STEP;
    group.description ??= "";
    group.createdAt ??= state.meta.createdAt;
    group.updatedAt ??= group.createdAt;
  }

  for (const entry of state.entries) {
    if (!ENTRY_TYPES[entry.type]) entry.type = "note";
    const statuses = ENTRY_TYPES[entry.type].statuses;
    if (!statuses.includes(entry.status)) entry.status = statuses[0];
    entry.parentId ??= null;
    entry.sort = Number.isFinite(Number(entry.sort)) ? Number(entry.sort) : SORT_STEP;
    entry.description ??= "";
    entry.active = entry.active !== false;
    entry.visible = entry.visible !== false;
    entry.tags = Array.isArray(entry.tags) ? entry.tags : [];
    entry.journalLinks = Array.isArray(entry.journalLinks) ? entry.journalLinks : [];
    entry.relations = Array.isArray(entry.relations) ? entry.relations : [];
    entry.transitionRules = Array.isArray(entry.transitionRules) ? entry.transitionRules : [];
    entry.createdAt ??= state.meta.createdAt;
    entry.updatedAt ??= entry.createdAt;
  }

  state.overviewPins = state.overviewPins
    .filter(pin => pin && ["entry", "group", "tracker"].includes(pin.targetType) && pin.targetId)
    .map((pin, index) => ({
      id: String(pin.id ?? `overview-${pin.targetType}-${pin.targetId}`),
      targetType: pin.targetType,
      targetId: String(pin.targetId),
      sort: Number.isFinite(Number(pin.sort)) ? Number(pin.sort) : (index + 1) * SORT_STEP,
      createdAt: pin.createdAt ?? state.meta.createdAt
    }));

  for (const tracker of state.trackers) {
    tracker.value = Number(tracker.value ?? 0);
    tracker.min = tracker.min === null || tracker.min === "" || tracker.min === undefined
      ? null
      : Number(tracker.min);
    tracker.max = tracker.max === null || tracker.max === "" || tracker.max === undefined
      ? null
      : Number(tracker.max);
    tracker.sort = Number.isFinite(Number(tracker.sort)) ? Number(tracker.sort) : SORT_STEP;
    tracker.description ??= "";
    tracker.createdAt ??= state.meta.createdAt;
    tracker.updatedAt ??= tracker.createdAt;
  }

  for (const session of state.sessions) {
    session.number = Number(session.number ?? 0);
    session.status = session.status === "active" ? "active" : "closed";
    session.changes = Array.isArray(session.changes) ? session.changes : [];
    session.startedAt ??= state.meta.createdAt;
    session.endedAt ??= null;
    session.gameTimeStart ??= null;
    session.gameTimeEnd ??= null;
  }

  return state;
}

export function getChildren(state, parentId) {
  const groups = state.groups
    .filter(g => g.parentId === parentId)
    .map(g => ({ nodeType: "group", id: g.id, sort: g.sort, data: g }));
  const entries = state.entries
    .filter(e => e.parentId === parentId)
    .map(e => ({ nodeType: "entry", id: e.id, sort: e.sort, data: e }));

  return [...groups, ...entries].sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort;
    if (a.nodeType !== b.nodeType) return a.nodeType.localeCompare(b.nodeType);
    return String(a.data.title ?? "").localeCompare(String(b.data.title ?? ""));
  });
}

export function nextSort(state, parentId) {
  const siblings = getChildren(state, parentId);
  if (!siblings.length) return SORT_STEP;
  return Number(siblings[siblings.length - 1].sort ?? 0) + SORT_STEP;
}


export function getDescendantEntries(state, groupId) {
  const entries = [];
  const pending = [groupId];
  const seen = new Set();

  while (pending.length) {
    const current = pending.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    entries.push(...state.entries.filter(entry => entry.parentId === current));
    for (const child of state.groups.filter(group => group.parentId === current)) {
      pending.push(child.id);
    }
  }

  return entries;
}

export function getGroupProgress(state, groupId) {
  const entries = getDescendantEntries(state, groupId);
  const reached = entries.filter(entry =>
    (OVERVIEW_REACHED_STATUSES[entry.type] ?? []).includes(entry.status)
  ).length;
  const total = entries.length;
  return {
    reached,
    total,
    percent: total ? Math.round((reached / total) * 100) : 0
  };
}
