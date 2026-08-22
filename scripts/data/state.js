import { ENTRY_TYPES, GROUP_PROGRESS_METRICS, JOURNAL_LINK_ROLES, KEY_PLAYER_ROLES, KEY_PLAYER_STATES, NUMERIC_CONDITION_OPERATORS, OVERVIEW_REACHED_STATUSES, REWARD_STATES, REWARD_TYPES, SORT_STEP, STATUS_CONDITION_OPERATORS, TRANSITION_ACTION_TYPES, TRANSITION_CONDITION_MODES, TRANSITION_CONDITION_TYPES } from "../core/constants.js";

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
    entry.journalLinks = (Array.isArray(entry.journalLinks) ? entry.journalLinks : [])
      .map((link, index) => {
        if (typeof link === "string") {
          return {
            id: `journal-${entry.id}-${index + 1}`,
            uuid: link,
            role: "details",
            primary: index === 0,
            label: ""
          };
        }
        if (!link || typeof link !== "object" || !link.uuid) return null;
        return {
          id: String(link.id ?? `journal-${entry.id}-${index + 1}`),
          uuid: String(link.uuid),
          role: JOURNAL_LINK_ROLES[link.role] ? link.role : "details",
          primary: Boolean(link.primary),
          label: String(link.label ?? "")
        };
      })
      .filter(Boolean);
    let primarySeen = false;
    for (const link of entry.journalLinks) {
      if (!link.primary) continue;
      if (primarySeen) link.primary = false;
      else primarySeen = true;
    }
    entry.externalLinks = (Array.isArray(entry.externalLinks) ? entry.externalLinks : [])
      .filter(link => link && typeof link === "object" && link.provider && link.targetId)
      .map((link, index) => ({
        id: String(link.id ?? `external-${entry.id}-${index + 1}`),
        provider: String(link.provider),
        kind: String(link.kind ?? "reference"),
        targetId: String(link.targetId),
        subTargetId: link.subTargetId == null ? null : String(link.subTargetId),
        label: String(link.label ?? ""),
        meta: link.meta && typeof link.meta === "object" ? cloneData(link.meta) : {}
      }));
    entry.relations = Array.isArray(entry.relations) ? entry.relations : [];
    entry.transitionRules = Array.isArray(entry.transitionRules) ? entry.transitionRules : [];
    entry.rewardRules = Array.isArray(entry.rewardRules) ? entry.rewardRules : [];
    entry.transitionRules = entry.transitionRules
      .filter(rule => rule && typeof rule === "object")
      .map((rule, ruleIndex) => ({
        id: String(rule.id ?? `rule-${entry.id}-${ruleIndex + 1}`),
        enabled: rule.enabled !== false,
        fromStatus: String(rule.fromStatus ?? entry.status),
        toStatus: String(rule.toStatus ?? entry.status),
        conditionMode: TRANSITION_CONDITION_MODES[rule.conditionMode] ? rule.conditionMode : "all",
        conditions: (Array.isArray(rule.conditions) ? rule.conditions : [])
          .filter(condition => condition && TRANSITION_CONDITION_TYPES[condition.type])
          .map((condition, conditionIndex) => {
            const normalized = {
              id: String(condition.id ?? `condition-${entry.id}-${ruleIndex + 1}-${conditionIndex + 1}`),
              type: String(condition.type),
              targetId: String(condition.targetId ?? "")
            };
            if (condition.type === "entryStatus") {
              normalized.operator = STATUS_CONDITION_OPERATORS[condition.operator] ? condition.operator : "eq";
              normalized.status = String(condition.status ?? "");
            } else if (condition.type === "entryActive" || condition.type === "entryVisible") {
              normalized.value = Boolean(condition.value);
            } else if (condition.type === "trackerValue") {
              normalized.operator = NUMERIC_CONDITION_OPERATORS[condition.operator] ? condition.operator : "gte";
              normalized.value = Number(condition.value ?? 0);
            } else if (condition.type === "groupProgress") {
              normalized.operator = NUMERIC_CONDITION_OPERATORS[condition.operator] ? condition.operator : "gte";
              normalized.metric = GROUP_PROGRESS_METRICS[condition.metric] ? condition.metric : "reached";
              normalized.value = Number(condition.value ?? 0);
            }
            return normalized;
          }),
        actions: (Array.isArray(rule.actions) ? rule.actions : [])
          .filter(action => action && TRANSITION_ACTION_TYPES[action.type])
          .map((action, actionIndex) => ({
            id: String(action.id ?? `action-${entry.id}-${ruleIndex + 1}-${actionIndex + 1}`),
            type: String(action.type),
            targetId: String(action.targetId ?? ""),
            ...(action.status !== undefined ? { status: String(action.status) } : {}),
            ...(action.value !== undefined ? { value: Boolean(action.value) } : {}),
            ...(action.delta !== undefined ? { delta: Number(action.delta) } : {}),
            ...(action.provider !== undefined ? { provider: String(action.provider) } : {}),
            ...(action.action !== undefined ? { action: String(action.action) } : {}),
            ...(action.payload !== undefined ? { payload: cloneData(action.payload ?? {}) } : {})
          }))
      }));
    entry.rewardRules = entry.rewardRules
      .filter(rule => rule && typeof rule === "object")
      .map((rule, ruleIndex) => ({
        id: String(rule.id ?? `reward-rule-${entry.id}-${ruleIndex + 1}`),
        enabled: rule.enabled !== false,
        fromStatus: String(rule.fromStatus ?? entry.status),
        toStatus: String(rule.toStatus ?? entry.status),
        rewards: (Array.isArray(rule.rewards) ? rule.rewards : [])
          .filter(reward => reward && REWARD_TYPES[reward.type])
          .map((reward, rewardIndex) => {
            const stateId = REWARD_STATES[reward.state] ? reward.state : "locked";
            return {
              id: String(reward.id ?? `reward-${entry.id}-${ruleIndex + 1}-${rewardIndex + 1}`),
              type: String(reward.type),
              state: stateId,
              actorUuid: String(reward.actorUuid ?? ""),
              amount: Number(reward.amount ?? 0),
              coins: {
                pp: Number(reward.coins?.pp ?? 0),
                gp: Number(reward.coins?.gp ?? 0),
                sp: Number(reward.coins?.sp ?? 0),
                cp: Number(reward.coins?.cp ?? 0)
              },
              itemUuid: String(reward.itemUuid ?? ""),
              itemName: String(reward.itemName ?? ""),
              quantity: Math.max(1, Math.trunc(Number(reward.quantity ?? 1) || 1)),
              lootConfig: reward.lootConfig && typeof reward.lootConfig === "object" && !Array.isArray(reward.lootConfig) ? cloneData(reward.lootConfig) : null,
              itemRequest: reward.itemRequest && typeof reward.itemRequest === "object" && !Array.isArray(reward.itemRequest) ? cloneData(reward.itemRequest) : null,
              itemPreviewName: String(reward.itemPreviewName ?? ""),
              previewSummary: reward.previewSummary && typeof reward.previewSummary === "object" ? cloneData(reward.previewSummary) : null,
              mystifyMagicItems: reward.mystifyMagicItems === true,
              trackerId: String(reward.trackerId ?? ""),
              delta: Number(reward.delta ?? 0),
              triggeredAt: reward.triggeredAt ?? null,
              triggerTransactionId: reward.triggerTransactionId ?? null,
              grantedAt: reward.grantedAt ?? null,
              skippedAt: reward.skippedAt ?? null,
              failedAt: reward.failedAt ?? null,
              lastError: reward.lastError ?? null,
              lastResult: reward.lastResult ?? null
            };
          })
      }));
    entry.createdAt ??= state.meta.createdAt;
    entry.updatedAt ??= entry.createdAt;
  }

  state.overviewPins = state.overviewPins
    .filter(pin => pin && ["entry", "group", "tracker", "keyPlayer"].includes(pin.targetType) && pin.targetId)
    .map((pin, index) => ({
      id: String(pin.id ?? `overview-${pin.targetType}-${pin.targetId}`),
      targetType: pin.targetType,
      targetId: String(pin.targetId),
      sort: Number.isFinite(Number(pin.sort)) ? Number(pin.sort) : (index + 1) * SORT_STEP,
      createdAt: pin.createdAt ?? state.meta.createdAt
    }));

  for (const keyPlayer of state.keyPlayers) {
    keyPlayer.actorUuid = String(keyPlayer.actorUuid ?? "");
    keyPlayer.actorName = String(keyPlayer.actorName ?? "");
    keyPlayer.actorImg = String(keyPlayer.actorImg ?? "");
    if (!KEY_PLAYER_ROLES[keyPlayer.role]) keyPlayer.role = "neutral";
    if (!KEY_PLAYER_STATES[keyPlayer.state]) keyPlayer.state = "active";
    keyPlayer.note = String(keyPlayer.note ?? "");
    keyPlayer.relationshipTrackerId = keyPlayer.relationshipTrackerId || null;
    keyPlayer.entryLinks = Array.isArray(keyPlayer.entryLinks)
      ? [...new Set(keyPlayer.entryLinks.filter(Boolean).map(String))]
      : [];
    keyPlayer.lastSeenSessionId = keyPlayer.lastSeenSessionId || null;
    keyPlayer.sort = Number.isFinite(Number(keyPlayer.sort)) ? Number(keyPlayer.sort) : SORT_STEP;
    keyPlayer.createdAt ??= state.meta.createdAt;
    keyPlayer.updatedAt ??= keyPlayer.createdAt;
  }

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

  const trackerIds = new Set(state.trackers.map(tracker => tracker.id));
  const entryIds = new Set(state.entries.map(entry => entry.id));
  const sessionIds = new Set(state.sessions.map(session => session.id));
  for (const keyPlayer of state.keyPlayers) {
    if (keyPlayer.relationshipTrackerId && !trackerIds.has(keyPlayer.relationshipTrackerId)) {
      keyPlayer.relationshipTrackerId = null;
    }
    keyPlayer.entryLinks = keyPlayer.entryLinks.filter(entryId => entryIds.has(entryId));
    if (keyPlayer.lastSeenSessionId && !sessionIds.has(keyPlayer.lastSeenSessionId)) {
      keyPlayer.lastSeenSessionId = null;
    }
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
