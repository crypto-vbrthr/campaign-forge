import { ENTRY_TYPES, OVERVIEW_REACHED_STATUSES, SORT_STEP } from "../core/constants.js";
import { cloneData } from "../data/state.js";

function bySort(a, b) {
  const av = Number(a?.sort ?? SORT_STEP);
  const bv = Number(b?.sort ?? SORT_STEP);
  if (av !== bv) return av - bv;
  return String(a?.title ?? a?.actorName ?? "").localeCompare(String(b?.title ?? b?.actorName ?? ""));
}

export function publicGroupProgress(state, groupId) {
  const groupIds = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of state.groups ?? []) {
      if (group.parentId && groupIds.has(group.parentId) && !groupIds.has(group.id)) {
        groupIds.add(group.id);
        changed = true;
      }
    }
  }
  const entries = (state.entries ?? []).filter(entry => entry.visible !== false && groupIds.has(entry.parentId));
  const reached = entries.filter(entry => (OVERVIEW_REACHED_STATUSES[entry.type] ?? []).includes(entry.status)).length;
  const total = entries.length;
  return { reached, total, percent: total ? Math.round((reached / total) * 100) : 0 };
}

function targetPublic(state, pin) {
  if (!pin?.playerVisible) return false;
  if (pin.targetType === "entry") return state.entries.some(entry => entry.id === pin.targetId && entry.visible !== false);
  if (pin.targetType === "group") return state.groups.some(group => group.id === pin.targetId && group.playerVisible === true);
  if (pin.targetType === "tracker") return state.trackers.some(tracker => tracker.id === pin.targetId && tracker.playerVisible === true);
  if (pin.targetType === "keyPlayer") return state.keyPlayers.some(keyPlayer => keyPlayer.id === pin.targetId && keyPlayer.playerVisible === true);
  return false;
}

/**
 * Build a read-only, player-safe projection. The projection deliberately omits
 * transition/reward rules, GM notes, sessions, provider payloads, hidden entries,
 * and hidden tracker/key-player data.
 */
export function buildPlayerProjection(state) {
  const publicEntries = (state.entries ?? [])
    .filter(entry => entry.visible !== false)
    .map(entry => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      description: entry.description ?? "",
      status: entry.status,
      active: entry.active !== false,
      parentId: entry.parentId ?? null,
      sort: Number(entry.sort ?? SORT_STEP),
      journalLinks: (entry.journalLinks ?? []).map(link => ({
        id: link.id,
        uuid: link.uuid,
        role: link.role,
        primary: Boolean(link.primary),
        label: link.label ?? ""
      }))
    }));

  const publicGroups = (state.groups ?? [])
    .filter(group => group.playerVisible === true)
    .map(group => ({
      id: group.id,
      title: group.title,
      kind: group.kind,
      parentId: group.parentId ?? null,
      sort: Number(group.sort ?? SORT_STEP)
    }));

  const visibleGroupIds = new Set(publicGroups.map(group => group.id));
  // Re-home visible entries/groups whose private ancestors must not be exposed.
  const nearestVisibleParent = parentId => {
    let current = parentId;
    const seen = new Set();
    while (current && !seen.has(current)) {
      if (visibleGroupIds.has(current)) return current;
      seen.add(current);
      current = state.groups?.find(group => group.id === current)?.parentId ?? null;
    }
    return null;
  };
  for (const group of publicGroups) group.parentId = nearestVisibleParent(group.parentId);
  for (const entry of publicEntries) entry.parentId = nearestVisibleParent(entry.parentId);

  const trackers = (state.trackers ?? [])
    .filter(tracker => tracker.playerVisible === true)
    .sort(bySort)
    .map(tracker => ({
      id: tracker.id,
      title: tracker.title,
      description: tracker.playerDescription ?? "",
      value: Number(tracker.value ?? 0),
      min: tracker.min ?? null,
      max: tracker.max ?? null,
      sort: Number(tracker.sort ?? SORT_STEP)
    }));

  const trackerById = new Map(trackers.map(tracker => [tracker.id, tracker]));
  const keyPlayers = (state.keyPlayers ?? [])
    .filter(keyPlayer => keyPlayer.playerVisible === true)
    .sort(bySort)
    .map(keyPlayer => ({
      id: keyPlayer.id,
      actorUuid: keyPlayer.actorUuid,
      actorName: keyPlayer.actorName,
      actorImg: keyPlayer.actorImg,
      role: keyPlayer.role,
      state: keyPlayer.state,
      note: keyPlayer.playerNote ?? "",
      relationshipTrackerId: trackerById.has(keyPlayer.relationshipTrackerId) ? keyPlayer.relationshipTrackerId : null,
      entryLinks: (keyPlayer.entryLinks ?? []).filter(id => publicEntries.some(entry => entry.id === id)),
      sort: Number(keyPlayer.sort ?? SORT_STEP)
    }));

  const overviewPins = (state.overviewPins ?? [])
    .filter(pin => targetPublic(state, pin))
    .sort(bySort)
    .map(pin => ({
      id: pin.id,
      targetType: pin.targetType,
      targetId: pin.targetId,
      sort: Number(pin.sort ?? SORT_STEP)
    }));

  return {
    schemaVersion: 1,
    groups: publicGroups.sort(bySort),
    entries: publicEntries.sort(bySort),
    trackers,
    keyPlayers,
    overviewPins
  };
}

export function playerEntryTypeDefinition(type) {
  return ENTRY_TYPES[type] ?? ENTRY_TYPES.note;
}

function canObserveForUser(document, user) {
  if (!document || !user) return false;
  try {
    if (typeof document.testUserPermission === "function") return document.testUserPermission(user, "OBSERVER");
    if (typeof document.parent?.testUserPermission === "function") return document.parent.testUserPermission(user, "OBSERVER");
  } catch { /* noop */ }
  return false;
}

/**
 * Build a projection tailored to one Foundry user. This keeps document UUIDs
 * out of other users' projection documents when they do not have permission to
 * open those documents.
 */
export async function buildPlayerProjectionForUser(state, user, { resolveDocument = async () => null } = {}) {
  const projection = buildPlayerProjection(state);

  for (const entry of projection.entries ?? []) {
    const allowed = [];
    for (const link of entry.journalLinks ?? []) {
      const document = await resolveDocument(link.uuid);
      if (canObserveForUser(document, user)) allowed.push(link);
    }
    entry.journalLinks = allowed;
  }

  for (const keyPlayer of projection.keyPlayers ?? []) {
    const actor = await resolveDocument(keyPlayer.actorUuid);
    if (!canObserveForUser(actor, user)) keyPlayer.actorUuid = "";
  }

  return projection;
}

/**
 * Convert an already-safe player projection back into the canonical-shaped
 * subset expected by CampaignEngine.normalizeState. This is intentionally a
 * one-way safety adapter: omitted GM-only fields remain absent/empty.
 */
export function inflatePlayerProjection(projection) {
  const source = cloneData(projection ?? {});
  return {
    schemaVersion: 2,
    groups: (source.groups ?? []).map(group => ({ ...group, playerVisible: true })),
    entries: (source.entries ?? []).map(entry => ({ ...entry, visible: true })),
    trackers: (source.trackers ?? []).map(tracker => ({
      ...tracker,
      playerVisible: true,
      playerDescription: tracker.description ?? "",
      description: ""
    })),
    keyPlayers: (source.keyPlayers ?? []).map(keyPlayer => ({
      ...keyPlayer,
      playerVisible: true,
      playerNote: keyPlayer.note ?? "",
      note: ""
    })),
    overviewPins: (source.overviewPins ?? []).map(pin => ({ ...pin, playerVisible: true })),
    sessions: [],
    meta: {
      nextSessionNumber: 1,
      revision: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    }
  };
}
