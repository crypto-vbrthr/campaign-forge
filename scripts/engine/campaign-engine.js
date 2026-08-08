import {
  ENTRY_TYPES,
  JOURNAL_LINK_ROLES,
  KEY_PLAYER_ROLES,
  KEY_PLAYER_STATES,
  MAX_TRANSITION_ACTIONS,
  MAX_TRANSITION_DEPTH,
  REWARD_STATES,
  REWARD_TYPES,
  SESSION_CHANGE_KINDS,
  SORT_STEP,
  TRANSITION_ACTION_TYPES
} from "../core/constants.js";
import { cloneData, getChildren, nextSort, normalizeState } from "../data/state.js";

export class CampaignEngineError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "CampaignEngineError";
    this.code = code;
    this.details = details;
  }
}

export class CampaignEngine {
  constructor(repository, {
    now = () => Date.now(),
    idFactory = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    userId = () => null,
    gameTime = () => null,
    rewardExecutor = null
  } = {}) {
    this.repository = repository;
    this._now = now;
    this._idFactory = idFactory;
    this._userId = userId;
    this._gameTime = gameTime;
    this._rewardExecutor = rewardExecutor;
  }

  async getState() {
    return normalizeState(await this.repository.load());
  }

  async _mutate(mutator) {
    const state = await this.getState();
    const result = await mutator(state);
    state.meta.updatedAt = new Date(this._now()).toISOString();
    await this.repository.save(state);
    return result;
  }

  _newId() {
    return String(this._idFactory());
  }

  _activeSession(state) {
    return state.sessions.find(s => s.status === "active") ?? null;
  }

  _recordChange(state, {
    action,
    targetType,
    targetId,
    targetTitle = "",
    before = null,
    after = null,
    source = "manual",
    structural = false,
    transactionId = null,
    details = {}
  }) {
    const session = this._activeSession(state);
    if (!session) return null;

    const change = {
      id: this._newId(),
      timestamp: this._now(),
      gameTime: this._gameTime(),
      userId: this._userId(),
      action,
      targetType,
      targetId,
      targetTitle,
      before: cloneData(before),
      after: cloneData(after),
      source,
      structural,
      transactionId,
      details: cloneData(details)
    };
    session.changes.push(change);
    return change;
  }

  _findGroup(state, id) {
    const group = state.groups.find(g => g.id === id);
    if (!group) throw new CampaignEngineError("GROUP_NOT_FOUND", { id });
    return group;
  }

  _findEntry(state, id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) throw new CampaignEngineError("ENTRY_NOT_FOUND", { id });
    return entry;
  }

  _findTracker(state, id) {
    const tracker = state.trackers.find(t => t.id === id);
    if (!tracker) throw new CampaignEngineError("TRACKER_NOT_FOUND", { id });
    return tracker;
  }

  _findKeyPlayer(state, id) {
    const keyPlayer = state.keyPlayers.find(k => k.id === id);
    if (!keyPlayer) throw new CampaignEngineError("KEY_PLAYER_NOT_FOUND", { id });
    return keyPlayer;
  }

  _findOverviewTarget(state, targetType, targetId) {
    if (targetType === "entry") return this._findEntry(state, targetId);
    if (targetType === "group") return this._findGroup(state, targetId);
    if (targetType === "tracker") return this._findTracker(state, targetId);
    if (targetType === "keyPlayer") return this._findKeyPlayer(state, targetId);
    throw new CampaignEngineError("INVALID_OVERVIEW_TARGET", { targetType, targetId });
  }

  _overviewTargetTitle(targetType, target) {
    return targetType === "keyPlayer" ? (target.actorName || target.actorUuid) : target.title;
  }

  _validateKeyPlayerLinks(state, { relationshipTrackerId = null, entryLinks = [] } = {}) {
    if (relationshipTrackerId) this._findTracker(state, relationshipTrackerId);
    const normalized = [...new Set((Array.isArray(entryLinks) ? entryLinks : []).filter(Boolean).map(String))];
    for (const entryId of normalized) this._findEntry(state, entryId);
    return normalized;
  }



  _normalizeTransitionActions(state, actions = []) {
    if (!Array.isArray(actions) || !actions.length) {
      throw new CampaignEngineError("TRANSITION_ACTION_REQUIRED");
    }

    return actions.map(raw => {
      const type = String(raw?.type ?? "");
      if (!TRANSITION_ACTION_TYPES[type]) {
        throw new CampaignEngineError("INVALID_TRANSITION_ACTION", { type });
      }

      const targetId = String(raw?.targetId ?? "").trim();
      if (!targetId) throw new CampaignEngineError("TRANSITION_TARGET_REQUIRED", { type });

      if (type === "adjustTracker") {
        this._findTracker(state, targetId);
        const delta = Number(raw?.delta);
        if (!Number.isFinite(delta)) throw new CampaignEngineError("INVALID_TRANSITION_DELTA", { delta: raw?.delta });
        return {
          id: String(raw?.id ?? this._newId()),
          type,
          targetId,
          delta
        };
      }

      const target = this._findEntry(state, targetId);
      if (type === "setEntryStatus") {
        const status = String(raw?.status ?? "");
        if (!ENTRY_TYPES[target.type].statuses.includes(status)) {
          throw new CampaignEngineError("INVALID_STATUS", { type: target.type, status });
        }
        return {
          id: String(raw?.id ?? this._newId()),
          type,
          targetId,
          status
        };
      }

      return {
        id: String(raw?.id ?? this._newId()),
        type,
        targetId,
        value: raw?.value === true || raw?.value === "true" || raw?.value === 1 || raw?.value === "1"
      };
    });
  }

  _validateTransitionRule(state, entry, data = {}, existingRule = null) {
    const statuses = ENTRY_TYPES[entry.type].statuses;
    const fromStatus = String(data.fromStatus ?? existingRule?.fromStatus ?? entry.status);
    const toStatus = String(data.toStatus ?? existingRule?.toStatus ?? entry.status);
    if (!statuses.includes(fromStatus) || !statuses.includes(toStatus)) {
      throw new CampaignEngineError("INVALID_TRANSITION_TRIGGER", { fromStatus, toStatus, type: entry.type });
    }
    if (fromStatus === toStatus) {
      throw new CampaignEngineError("TRANSITION_TRIGGER_SAME_STATUS", { status: fromStatus });
    }

    const actions = this._normalizeTransitionActions(state, data.actions ?? existingRule?.actions ?? []);
    return {
      id: String(existingRule?.id ?? data.id ?? this._newId()),
      enabled: data.enabled !== undefined ? Boolean(data.enabled) : (existingRule?.enabled !== false),
      fromStatus,
      toStatus,
      actions
    };
  }

  _normalizeRewards(state, rewards = [], existingRewards = []) {
    if (!Array.isArray(rewards) || !rewards.length) {
      throw new CampaignEngineError("REWARD_REQUIRED");
    }

    return rewards.map(raw => {
      const type = String(raw?.type ?? "");
      if (!REWARD_TYPES[type]) throw new CampaignEngineError("INVALID_REWARD_TYPE", { type });
      const id = String(raw?.id ?? this._newId());
      const existing = existingRewards.find(reward => reward.id === id) ?? null;
      const runtime = {
        state: REWARD_STATES[existing?.state] ? existing.state : "locked",
        triggeredAt: existing?.triggeredAt ?? null,
        triggerTransactionId: existing?.triggerTransactionId ?? null,
        grantedAt: existing?.grantedAt ?? null,
        skippedAt: existing?.skippedAt ?? null,
        failedAt: existing?.failedAt ?? null,
        lastError: existing?.lastError ?? null,
        lastResult: cloneData(existing?.lastResult ?? null)
      };

      if (type === "xp") {
        const actorUuid = String(raw?.actorUuid ?? "").trim();
        const amount = Number(raw?.amount);
        if (!actorUuid) throw new CampaignEngineError("REWARD_ACTOR_REQUIRED", { type });
        if (!Number.isFinite(amount) || amount <= 0) throw new CampaignEngineError("INVALID_REWARD_AMOUNT", { amount: raw?.amount });
        return { id, type, actorUuid, amount: Math.trunc(amount), ...runtime };
      }

      if (type === "currency") {
        const actorUuid = String(raw?.actorUuid ?? "").trim();
        if (!actorUuid) throw new CampaignEngineError("REWARD_ACTOR_REQUIRED", { type });
        const coins = Object.fromEntries(["pp", "gp", "sp", "cp"].map(denom => {
          const value = Math.max(0, Math.trunc(Number(raw?.coins?.[denom] ?? 0) || 0));
          return [denom, value];
        }));
        if (!Object.values(coins).some(value => value > 0)) throw new CampaignEngineError("REWARD_CURRENCY_REQUIRED");
        return { id, type, actorUuid, coins, ...runtime };
      }

      if (type === "item") {
        const actorUuid = String(raw?.actorUuid ?? "").trim();
        const itemUuid = String(raw?.itemUuid ?? "").trim();
        const quantity = Math.max(1, Math.trunc(Number(raw?.quantity ?? 1) || 1));
        if (!actorUuid) throw new CampaignEngineError("REWARD_ACTOR_REQUIRED", { type });
        if (!itemUuid) throw new CampaignEngineError("REWARD_ITEM_REQUIRED");
        return {
          id,
          type,
          actorUuid,
          itemUuid,
          itemName: String(raw?.itemName ?? existing?.itemName ?? ""),
          quantity,
          ...runtime
        };
      }

      const trackerId = String(raw?.trackerId ?? raw?.targetId ?? "").trim();
      const delta = Number(raw?.delta);
      if (!trackerId) throw new CampaignEngineError("REWARD_TRACKER_REQUIRED");
      this._findTracker(state, trackerId);
      if (!Number.isFinite(delta) || delta === 0) throw new CampaignEngineError("INVALID_REWARD_DELTA", { delta: raw?.delta });
      return { id, type, trackerId, delta, ...runtime };
    });
  }

  _validateRewardRule(state, entry, data = {}, existingRule = null) {
    const statuses = ENTRY_TYPES[entry.type].statuses;
    const fromStatus = String(data.fromStatus ?? existingRule?.fromStatus ?? entry.status);
    const toStatus = String(data.toStatus ?? existingRule?.toStatus ?? entry.status);
    if (!statuses.includes(fromStatus) || !statuses.includes(toStatus)) {
      throw new CampaignEngineError("INVALID_REWARD_TRIGGER", { fromStatus, toStatus, type: entry.type });
    }
    if (fromStatus === toStatus) throw new CampaignEngineError("REWARD_TRIGGER_SAME_STATUS", { status: fromStatus });
    const rewards = this._normalizeRewards(state, data.rewards ?? existingRule?.rewards ?? [], existingRule?.rewards ?? []);
    return {
      id: String(existingRule?.id ?? data.id ?? this._newId()),
      enabled: data.enabled !== undefined ? Boolean(data.enabled) : (existingRule?.enabled !== false),
      fromStatus,
      toStatus,
      rewards
    };
  }

  _findReward(state, entryId, ruleId, rewardId) {
    const entry = this._findEntry(state, entryId);
    const rule = (entry.rewardRules ?? []).find(candidate => candidate.id === ruleId);
    if (!rule) throw new CampaignEngineError("REWARD_RULE_NOT_FOUND", { entryId, ruleId });
    const reward = (rule.rewards ?? []).find(candidate => candidate.id === rewardId);
    if (!reward) throw new CampaignEngineError("REWARD_NOT_FOUND", { entryId, ruleId, rewardId });
    return { entry, rule, reward };
  }

  _rewardPreviewData(state, entry, rule, reward, causedByEntryId = null) {
    const data = {
      entryId: entry.id,
      entryTitle: entry.title,
      ruleId: rule.id,
      rewardId: reward.id,
      type: reward.type,
      causedByEntryId,
      actorUuid: reward.actorUuid ?? "",
      amount: reward.amount ?? 0,
      coins: cloneData(reward.coins ?? null),
      itemUuid: reward.itemUuid ?? "",
      itemName: reward.itemName ?? "",
      quantity: reward.quantity ?? 1,
      trackerId: reward.trackerId ?? "",
      delta: reward.delta ?? 0
    };
    if (reward.type === "tracker") {
      const tracker = state.trackers.find(candidate => candidate.id === reward.trackerId);
      data.targetTitle = tracker?.title ?? reward.trackerId;
    }
    return data;
  }

  async _grantRewardInState(state, entryId, ruleId, rewardId, { transactionId = null, source = "reward" } = {}) {
    const { entry, reward } = this._findReward(state, entryId, ruleId, rewardId);
    const previousState = reward.state;
    if (reward.state === "granted") throw new CampaignEngineError("REWARD_ALREADY_GRANTED", { rewardId });
    if (reward.state === "skipped") throw new CampaignEngineError("REWARD_SKIPPED", { rewardId });
    if (!["pending", "failed"].includes(reward.state)) throw new CampaignEngineError("REWARD_NOT_PENDING", { rewardId });

    const tx = transactionId || this._newId();
    const timestamp = this._now();
    try {
      let result = null;
      if (reward.type === "tracker") {
        const tracker = this._findTracker(state, reward.trackerId);
        const previousValue = Number(tracker.value ?? 0);
        let nextValue = previousValue + Number(reward.delta);
        if (Number.isFinite(tracker.min)) nextValue = Math.max(tracker.min, nextValue);
        if (Number.isFinite(tracker.max)) nextValue = Math.min(tracker.max, nextValue);
        tracker.value = nextValue;
        tracker.updatedAt = new Date(timestamp).toISOString();
        result = { trackerId: tracker.id, previousValue, value: nextValue, delta: nextValue - previousValue };
        if (nextValue !== previousValue) {
          this._recordChange(state, {
            action: "tracker.adjusted",
            targetType: "tracker",
            targetId: tracker.id,
            targetTitle: tracker.title,
            before: { value: previousValue },
            after: { value: nextValue },
            source,
            structural: false,
            transactionId: tx,
            details: { delta: nextValue - previousValue, rewardId, entryId }
          });
        }
      } else {
        if (!this._rewardExecutor?.execute) throw new CampaignEngineError("REWARD_PROVIDER_UNAVAILABLE", { type: reward.type });
        result = await this._rewardExecutor.execute(cloneData(reward));
      }

      reward.state = "granted";
      reward.grantedAt = timestamp;
      reward.failedAt = null;
      reward.lastError = null;
      reward.lastResult = cloneData(result ?? null);
      this._recordChange(state, {
        action: "reward.granted",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before: { state: previousState },
        after: { state: "granted" },
        source,
        structural: false,
        transactionId: tx,
        details: { rewardId, ruleId, rewardType: reward.type, result: cloneData(result ?? null) }
      });
      return cloneData(reward);
    } catch (error) {
      reward.state = "failed";
      reward.failedAt = timestamp;
      reward.lastError = error?.code ?? error?.message ?? String(error);
      this._recordChange(state, {
        action: "reward.failed",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before: { state: "pending" },
        after: { state: "failed" },
        source,
        structural: false,
        transactionId: tx,
        details: { rewardId, ruleId, rewardType: reward.type, error: reward.lastError }
      });
      if (error instanceof CampaignEngineError) throw error;
      throw new CampaignEngineError("REWARD_EXECUTION_FAILED", { rewardId, message: reward.lastError });
    }
  }

  _buildTransitionPlan(state, entryId, status) {
    const scratch = cloneData(state);
    const root = this._findEntry(scratch, entryId);
    const allowed = ENTRY_TYPES[root.type].statuses;
    if (!allowed.includes(status)) {
      throw new CampaignEngineError("INVALID_STATUS", { type: root.type, status });
    }

    const transactionId = this._newId();
    const actions = [];
    const rewardOffers = [];
    const warnings = [];
    const transitionStack = [];
    const executedRules = new Set();
    let actionCount = 0;

    const pushAction = action => {
      actionCount += 1;
      if (actionCount > MAX_TRANSITION_ACTIONS) {
        throw new CampaignEngineError("TRANSITION_TOO_MANY_ACTIONS", { max: MAX_TRANSITION_ACTIONS });
      }
      actions.push(action);
    };

    const applyStatus = (targetId, nextStatus, { depth = 0, ruleId = null, causedByEntryId = null, rootAction = false } = {}) => {
      if (depth > MAX_TRANSITION_DEPTH) {
        throw new CampaignEngineError("TRANSITION_TOO_DEEP", { max: MAX_TRANSITION_DEPTH });
      }
      const target = this._findEntry(scratch, targetId);
      const statuses = ENTRY_TYPES[target.type].statuses;
      if (!statuses.includes(nextStatus)) {
        throw new CampaignEngineError("INVALID_STATUS", { type: target.type, status: nextStatus });
      }
      const previousStatus = target.status;
      if (previousStatus === nextStatus) return;

      const transitionKey = `${targetId}:${previousStatus}->${nextStatus}`;
      if (transitionStack.includes(transitionKey)) {
        warnings.push({ code: "TRANSITION_CYCLE", entryId: targetId, fromStatus: previousStatus, toStatus: nextStatus });
        return;
      }

      pushAction({
        kind: "entry.status",
        targetType: "entry",
        targetId,
        targetTitle: target.title,
        before: { status: previousStatus },
        after: { status: nextStatus },
        ruleId,
        causedByEntryId,
        depth,
        root: rootAction
      });
      target.status = nextStatus;
      target.updatedAt = new Date(this._now()).toISOString();

      transitionStack.push(transitionKey);
      const matchingRules = (target.transitionRules ?? []).filter(rule =>
        rule.enabled !== false && rule.fromStatus === previousStatus && rule.toStatus === nextStatus
      );

      for (const rule of matchingRules) {
        const executionKey = `${targetId}:${rule.id}:${previousStatus}->${nextStatus}`;
        if (executedRules.has(executionKey)) continue;
        executedRules.add(executionKey);

        for (const ruleAction of rule.actions ?? []) {
          if (ruleAction.type === "setEntryStatus") {
            applyStatus(ruleAction.targetId, ruleAction.status, {
              depth: depth + 1,
              ruleId: rule.id,
              causedByEntryId: targetId
            });
            continue;
          }

          if (ruleAction.type === "setEntryActive" || ruleAction.type === "setEntryVisible") {
            const actionTarget = this._findEntry(scratch, ruleAction.targetId);
            const field = ruleAction.type === "setEntryActive" ? "active" : "visible";
            const nextValue = Boolean(ruleAction.value);
            const previousValue = Boolean(actionTarget[field]);
            if (previousValue === nextValue) continue;
            pushAction({
              kind: `entry.${field}`,
              targetType: "entry",
              targetId: actionTarget.id,
              targetTitle: actionTarget.title,
              before: { [field]: previousValue },
              after: { [field]: nextValue },
              ruleId: rule.id,
              causedByEntryId: targetId,
              depth: depth + 1
            });
            actionTarget[field] = nextValue;
            actionTarget.updatedAt = new Date(this._now()).toISOString();
            continue;
          }

          if (ruleAction.type === "adjustTracker") {
            const tracker = this._findTracker(scratch, ruleAction.targetId);
            const previousValue = Number(tracker.value ?? 0);
            let nextValue = previousValue + Number(ruleAction.delta);
            if (Number.isFinite(tracker.min)) nextValue = Math.max(tracker.min, nextValue);
            if (Number.isFinite(tracker.max)) nextValue = Math.min(tracker.max, nextValue);
            if (nextValue === previousValue) continue;
            pushAction({
              kind: "tracker.adjusted",
              targetType: "tracker",
              targetId: tracker.id,
              targetTitle: tracker.title,
              before: { value: previousValue },
              after: { value: nextValue },
              details: {
                delta: nextValue - previousValue,
                requestedDelta: Number(ruleAction.delta)
              },
              ruleId: rule.id,
              causedByEntryId: targetId,
              depth: depth + 1
            });
            tracker.value = nextValue;
            tracker.updatedAt = new Date(this._now()).toISOString();
          }
        }
      }

      const matchingRewardRules = (target.rewardRules ?? []).filter(rule =>
        rule.enabled !== false && rule.fromStatus === previousStatus && rule.toStatus === nextStatus
      );
      for (const rewardRule of matchingRewardRules) {
        for (const reward of rewardRule.rewards ?? []) {
          if (reward.state !== "locked") continue;
          rewardOffers.push(this._rewardPreviewData(scratch, target, rewardRule, reward, causedByEntryId));
          reward.state = "pending";
          reward.triggeredAt = this._now();
          reward.triggerTransactionId = transactionId;
        }
      }
      transitionStack.pop();
    };

    applyStatus(entryId, status, { rootAction: true });

    return {
      transactionId,
      root: {
        entryId: root.id,
        title: root.title,
        fromStatus: state.entries.find(entry => entry.id === entryId)?.status ?? root.status,
        toStatus: status
      },
      actions,
      consequences: actions.filter(action => !action.root),
      rewardOffers,
      warnings,
      blocked: warnings.some(warning => warning.code === "TRANSITION_CYCLE")
    };
  }

  _applyTransitionPlan(state, plan, { source = "manual" } = {}) {
    if (plan.blocked) throw new CampaignEngineError("TRANSITION_CYCLE");
    const timestamp = new Date(this._now()).toISOString();

    for (const action of plan.actions) {
      if (action.kind === "entry.status") {
        const entry = this._findEntry(state, action.targetId);
        entry.status = action.after.status;
        entry.updatedAt = timestamp;
        this._recordChange(state, {
          action: "entry.status",
          targetType: "entry",
          targetId: entry.id,
          targetTitle: entry.title,
          before: action.before,
          after: action.after,
          source: action.root ? source : "transition",
          structural: false,
          transactionId: plan.transactionId,
          details: {
            ruleId: action.ruleId,
            causedByEntryId: action.causedByEntryId,
            depth: action.depth
          }
        });
        continue;
      }

      if (action.kind === "entry.active" || action.kind === "entry.visible") {
        const entry = this._findEntry(state, action.targetId);
        const field = action.kind === "entry.active" ? "active" : "visible";
        entry[field] = action.after[field];
        entry.updatedAt = timestamp;
        this._recordChange(state, {
          action: action.kind,
          targetType: "entry",
          targetId: entry.id,
          targetTitle: entry.title,
          before: action.before,
          after: action.after,
          source: "transition",
          structural: false,
          transactionId: plan.transactionId,
          details: {
            ruleId: action.ruleId,
            causedByEntryId: action.causedByEntryId,
            depth: action.depth
          }
        });
        continue;
      }

      if (action.kind === "tracker.adjusted") {
        const tracker = this._findTracker(state, action.targetId);
        tracker.value = action.after.value;
        tracker.updatedAt = timestamp;
        this._recordChange(state, {
          action: "tracker.adjusted",
          targetType: "tracker",
          targetId: tracker.id,
          targetTitle: tracker.title,
          before: action.before,
          after: action.after,
          source: "transition",
          structural: false,
          transactionId: plan.transactionId,
          details: action.details ?? {}
        });
      }
    }
  }

  _assertValidParent(state, parentId) {
    if (parentId === null || parentId === undefined || parentId === "") return null;
    return this._findGroup(state, parentId);
  }

  _isDescendant(state, candidateParentId, groupId) {
    let current = candidateParentId;
    const seen = new Set();
    while (current) {
      if (current === groupId) return true;
      if (seen.has(current)) return true;
      seen.add(current);
      const parent = state.groups.find(g => g.id === current);
      current = parent?.parentId ?? null;
    }
    return false;
  }

  async createGroup({ title, description = "", kind = "group", parentId = null }) {
    const cleanTitle = String(title ?? "").trim();
    if (!cleanTitle) throw new CampaignEngineError("TITLE_REQUIRED");
    return this._mutate(state => {
      if (kind === "chapter") parentId = null;
      else this._assertValidParent(state, parentId);

      const timestamp = new Date(this._now()).toISOString();
      const group = {
        id: this._newId(),
        title: cleanTitle,
        description: String(description ?? ""),
        kind: kind === "chapter" ? "chapter" : "group",
        parentId: parentId || null,
        sort: nextSort(state, parentId || null),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.groups.push(group);
      this._recordChange(state, {
        action: "group.created",
        targetType: "group",
        targetId: group.id,
        targetTitle: group.title,
        after: group,
        structural: true
      });
      return cloneData(group);
    });
  }

  async updateGroup(id, patch = {}) {
    return this._mutate(state => {
      const group = this._findGroup(state, id);
      const before = cloneData(group);
      if (patch.title !== undefined) {
        const title = String(patch.title).trim();
        if (!title) throw new CampaignEngineError("TITLE_REQUIRED");
        group.title = title;
      }
      if (patch.description !== undefined) group.description = String(patch.description ?? "");
      group.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "group.updated",
        targetType: "group",
        targetId: group.id,
        targetTitle: group.title,
        before,
        after: group,
        structural: true
      });
      return cloneData(group);
    });
  }

  async deleteGroup(id) {
    return this._mutate(state => {
      const group = this._findGroup(state, id);
      const hasChildren = state.groups.some(g => g.parentId === id) || state.entries.some(e => e.parentId === id);
      if (hasChildren) throw new CampaignEngineError("GROUP_NOT_EMPTY", { id });
      const before = cloneData(group);
      state.groups = state.groups.filter(g => g.id !== id);
      state.overviewPins = state.overviewPins.filter(pin => !(pin.targetType === "group" && pin.targetId === id));
      this._recordChange(state, {
        action: "group.deleted",
        targetType: "group",
        targetId: id,
        targetTitle: group.title,
        before,
        structural: true
      });
      return before;
    });
  }

  async createEntry({
    title,
    description = "",
    type = "quest",
    status = null,
    parentId = null,
    active = true,
    visible = true
  }) {
    const cleanTitle = String(title ?? "").trim();
    if (!cleanTitle) throw new CampaignEngineError("TITLE_REQUIRED");
    if (!ENTRY_TYPES[type]) throw new CampaignEngineError("INVALID_ENTRY_TYPE", { type });

    return this._mutate(state => {
      this._assertValidParent(state, parentId);
      const statuses = ENTRY_TYPES[type].statuses;
      const selectedStatus = statuses.includes(status) ? status : statuses[0];
      const timestamp = new Date(this._now()).toISOString();
      const entry = {
        id: this._newId(),
        type,
        title: cleanTitle,
        description: String(description ?? ""),
        status: selectedStatus,
        active: Boolean(active),
        visible: Boolean(visible),
        parentId: parentId || null,
        sort: nextSort(state, parentId || null),
        tags: [],
        journalLinks: [],
        relations: [],
        transitionRules: [],
        rewardRules: [],
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.entries.push(entry);
      this._recordChange(state, {
        action: "entry.created",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        after: entry,
        structural: true
      });
      return cloneData(entry);
    });
  }

  async updateEntry(id, patch = {}) {
    return this._mutate(state => {
      const entry = this._findEntry(state, id);
      const before = cloneData(entry);

      if (patch.title !== undefined) {
        const title = String(patch.title).trim();
        if (!title) throw new CampaignEngineError("TITLE_REQUIRED");
        entry.title = title;
      }
      if (patch.description !== undefined) entry.description = String(patch.description ?? "");
      if (patch.active !== undefined) entry.active = Boolean(patch.active);
      if (patch.visible !== undefined) entry.visible = Boolean(patch.visible);

      if (patch.type !== undefined && patch.type !== entry.type) {
        if (!ENTRY_TYPES[patch.type]) throw new CampaignEngineError("INVALID_ENTRY_TYPE", { type: patch.type });
        entry.type = patch.type;
        const statuses = ENTRY_TYPES[entry.type].statuses;
        if (!statuses.includes(patch.status) && !statuses.includes(entry.status)) entry.status = statuses[0];
        entry.transitionRules = (entry.transitionRules ?? []).filter(rule =>
          statuses.includes(rule.fromStatus) && statuses.includes(rule.toStatus)
        );
        entry.rewardRules = (entry.rewardRules ?? []).filter(rule =>
          statuses.includes(rule.fromStatus) && statuses.includes(rule.toStatus)
        );
      }

      if (patch.status !== undefined) {
        const statuses = ENTRY_TYPES[entry.type].statuses;
        if (!statuses.includes(patch.status)) {
          throw new CampaignEngineError("INVALID_STATUS", { type: entry.type, status: patch.status });
        }
        entry.status = patch.status;
      }

      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.updated",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before,
        after: entry,
        structural: true
      });
      return cloneData(entry);
    });
  }

  async addJournalLink(entryId, { uuid, role = "details", primary = false, label = "" } = {}) {
    const cleanUuid = String(uuid ?? "").trim();
    if (!cleanUuid) throw new CampaignEngineError("JOURNAL_UUID_REQUIRED");
    if (!JOURNAL_LINK_ROLES[role]) throw new CampaignEngineError("INVALID_JOURNAL_LINK_ROLE", { role });

    return this._mutate(state => {
      const entry = this._findEntry(state, entryId);
      if ((entry.journalLinks ?? []).some(link => link.uuid === cleanUuid)) {
        throw new CampaignEngineError("JOURNAL_LINK_EXISTS", { uuid: cleanUuid });
      }
      const link = {
        id: this._newId(),
        uuid: cleanUuid,
        role,
        primary: Boolean(primary) || !(entry.journalLinks ?? []).some(existing => existing.primary),
        label: String(label ?? "")
      };
      if (link.primary) {
        for (const existing of entry.journalLinks ?? []) existing.primary = false;
      }
      entry.journalLinks ??= [];
      entry.journalLinks.push(link);
      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.journal.added",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        after: link,
        structural: true
      });
      return cloneData(link);
    });
  }

  async updateJournalLink(entryId, linkId, patch = {}) {
    return this._mutate(state => {
      const entry = this._findEntry(state, entryId);
      const link = (entry.journalLinks ?? []).find(candidate => candidate.id === linkId);
      if (!link) throw new CampaignEngineError("JOURNAL_LINK_NOT_FOUND", { entryId, linkId });
      const before = cloneData(link);
      if (patch.role !== undefined) {
        if (!JOURNAL_LINK_ROLES[patch.role]) throw new CampaignEngineError("INVALID_JOURNAL_LINK_ROLE", { role: patch.role });
        link.role = patch.role;
      }
      if (patch.label !== undefined) link.label = String(patch.label ?? "");
      if (patch.primary !== undefined) {
        link.primary = Boolean(patch.primary);
        if (link.primary) {
          for (const other of entry.journalLinks ?? []) {
            if (other.id !== link.id) other.primary = false;
          }
        }
      }
      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.journal.updated",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before,
        after: link,
        structural: true
      });
      return cloneData(link);
    });
  }

  async removeJournalLink(entryId, linkId) {
    return this._mutate(state => {
      const entry = this._findEntry(state, entryId);
      const index = (entry.journalLinks ?? []).findIndex(candidate => candidate.id === linkId);
      if (index < 0) throw new CampaignEngineError("JOURNAL_LINK_NOT_FOUND", { entryId, linkId });
      const [link] = entry.journalLinks.splice(index, 1);
      if (link.primary && entry.journalLinks.length) entry.journalLinks[0].primary = true;
      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.journal.removed",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before: link,
        structural: true
      });
      return cloneData(link);
    });
  }

  async previewEntryStatusTransition(id, status) {
    const state = await this.getState();
    return cloneData(this._buildTransitionPlan(state, id, status));
  }

  async setEntryStatus(id, status, { source = "manual", applyRules = true, rewardMode = "defer" } = {}) {
    return this._mutate(async state => {
      const entry = this._findEntry(state, id);
      const statuses = ENTRY_TYPES[entry.type].statuses;
      if (!statuses.includes(status)) {
        throw new CampaignEngineError("INVALID_STATUS", { type: entry.type, status });
      }
      if (entry.status === status) return cloneData(entry);

      if (!applyRules) {
        const before = { status: entry.status };
        entry.status = status;
        entry.updatedAt = new Date(this._now()).toISOString();
        this._recordChange(state, {
          action: "entry.status",
          targetType: "entry",
          targetId: entry.id,
          targetTitle: entry.title,
          before,
          after: { status },
          source,
          structural: false
        });
        return cloneData(entry);
      }

      const plan = this._buildTransitionPlan(state, id, status);
      if (plan.blocked) throw new CampaignEngineError("TRANSITION_CYCLE");
      this._applyTransitionPlan(state, plan, { source });

      for (const offer of plan.rewardOffers ?? []) {
        const { reward } = this._findReward(state, offer.entryId, offer.ruleId, offer.rewardId);
        if (reward.state !== "locked") continue;
        reward.state = "pending";
        reward.triggeredAt = this._now();
        reward.triggerTransactionId = plan.transactionId;
        reward.failedAt = null;
        reward.lastError = null;
        this._recordChange(state, {
          action: "reward.pending",
          targetType: "entry",
          targetId: offer.entryId,
          targetTitle: offer.entryTitle,
          before: { state: "locked" },
          after: { state: "pending" },
          source: "reward",
          structural: false,
          transactionId: plan.transactionId,
          details: { rewardId: offer.rewardId, ruleId: offer.ruleId, rewardType: offer.type }
        });
      }

      if (rewardMode === "grant") {
        for (const offer of plan.rewardOffers ?? []) {
          try {
            await this._grantRewardInState(state, offer.entryId, offer.ruleId, offer.rewardId, {
              transactionId: plan.transactionId,
              source: "reward"
            });
          } catch {
            // A failed reward is recorded and remains retryable without rolling back the campaign transition.
          }
        }
      }
      return cloneData(this._findEntry(state, id));
    });
  }

  async createTransitionRule(entryId, data = {}) {
    return this._mutate(state => {
      const entry = this._findEntry(state, entryId);
      const rule = this._validateTransitionRule(state, entry, data);
      entry.transitionRules.push(rule);
      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.rule.created",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        after: rule,
        structural: true
      });
      return cloneData(rule);
    });
  }

  async updateTransitionRule(entryId, ruleId, patch = {}) {
    return this._mutate(state => {
      const entry = this._findEntry(state, entryId);
      const index = entry.transitionRules.findIndex(rule => rule.id === ruleId);
      if (index < 0) throw new CampaignEngineError("TRANSITION_RULE_NOT_FOUND", { entryId, ruleId });
      const before = cloneData(entry.transitionRules[index]);
      const rule = this._validateTransitionRule(state, entry, patch, entry.transitionRules[index]);
      entry.transitionRules[index] = rule;
      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.rule.updated",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before,
        after: rule,
        structural: true
      });
      return cloneData(rule);
    });
  }

  async deleteTransitionRule(entryId, ruleId) {
    return this._mutate(state => {
      const entry = this._findEntry(state, entryId);
      const index = entry.transitionRules.findIndex(rule => rule.id === ruleId);
      if (index < 0) throw new CampaignEngineError("TRANSITION_RULE_NOT_FOUND", { entryId, ruleId });
      const [rule] = entry.transitionRules.splice(index, 1);
      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.rule.deleted",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before: rule,
        structural: true
      });
      return cloneData(rule);
    });
  }

  async createRewardRule(entryId, data = {}) {
    return this._mutate(state => {
      const entry = this._findEntry(state, entryId);
      entry.rewardRules ??= [];
      const rule = this._validateRewardRule(state, entry, data);
      entry.rewardRules.push(rule);
      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.rewardRule.created",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        after: rule,
        structural: true
      });
      return cloneData(rule);
    });
  }

  async updateRewardRule(entryId, ruleId, patch = {}) {
    return this._mutate(state => {
      const entry = this._findEntry(state, entryId);
      const index = (entry.rewardRules ?? []).findIndex(rule => rule.id === ruleId);
      if (index < 0) throw new CampaignEngineError("REWARD_RULE_NOT_FOUND", { entryId, ruleId });
      const before = cloneData(entry.rewardRules[index]);
      const rule = this._validateRewardRule(state, entry, patch, entry.rewardRules[index]);
      entry.rewardRules[index] = rule;
      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.rewardRule.updated",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before,
        after: rule,
        structural: true
      });
      return cloneData(rule);
    });
  }

  async deleteRewardRule(entryId, ruleId) {
    return this._mutate(state => {
      const entry = this._findEntry(state, entryId);
      const index = (entry.rewardRules ?? []).findIndex(rule => rule.id === ruleId);
      if (index < 0) throw new CampaignEngineError("REWARD_RULE_NOT_FOUND", { entryId, ruleId });
      const [rule] = entry.rewardRules.splice(index, 1);
      entry.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "entry.rewardRule.deleted",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before: rule,
        structural: true
      });
      return cloneData(rule);
    });
  }

  async grantReward(entryId, ruleId, rewardId) {
    return this._mutate(state => this._grantRewardInState(state, entryId, ruleId, rewardId, {
      transactionId: this._newId(),
      source: "reward"
    }));
  }

  async skipReward(entryId, ruleId, rewardId) {
    return this._mutate(state => {
      const { entry, reward } = this._findReward(state, entryId, ruleId, rewardId);
      if (reward.state === "granted") throw new CampaignEngineError("REWARD_ALREADY_GRANTED", { rewardId });
      if (![
        "pending",
        "failed"
      ].includes(reward.state)) throw new CampaignEngineError("REWARD_NOT_PENDING", { rewardId });
      const before = { state: reward.state };
      reward.state = "skipped";
      reward.skippedAt = this._now();
      reward.lastError = null;
      this._recordChange(state, {
        action: "reward.skipped",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before,
        after: { state: "skipped" },
        source: "reward",
        structural: false,
        transactionId: this._newId(),
        details: { rewardId, ruleId, rewardType: reward.type }
      });
      return cloneData(reward);
    });
  }

  async resetReward(entryId, ruleId, rewardId) {
    return this._mutate(state => {
      const { entry, reward } = this._findReward(state, entryId, ruleId, rewardId);
      const before = { state: reward.state };
      reward.state = reward.triggeredAt ? "pending" : "locked";
      reward.grantedAt = null;
      reward.skippedAt = null;
      reward.failedAt = null;
      reward.lastError = null;
      reward.lastResult = null;
      this._recordChange(state, {
        action: "reward.reset",
        targetType: "entry",
        targetId: entry.id,
        targetTitle: entry.title,
        before,
        after: { state: reward.state },
        source: "reward",
        structural: false,
        transactionId: this._newId(),
        details: { rewardId, ruleId, rewardType: reward.type }
      });
      return cloneData(reward);
    });
  }

  async deleteEntry(id) {
    return this._mutate(state => {
      const entry = this._findEntry(state, id);
      const before = cloneData(entry);
      state.entries = state.entries.filter(e => e.id !== id);
      state.overviewPins = state.overviewPins.filter(pin => !(pin.targetType === "entry" && pin.targetId === id));
      for (const remainingEntry of state.entries) {
        for (const rule of remainingEntry.transitionRules ?? []) {
          rule.actions = (rule.actions ?? []).filter(action => !(
            ["setEntryStatus", "setEntryActive", "setEntryVisible"].includes(action.type) && action.targetId === id
          ));
        }
        remainingEntry.transitionRules = (remainingEntry.transitionRules ?? []).filter(rule => (rule.actions ?? []).length > 0);
      }
      for (const keyPlayer of state.keyPlayers) {
        keyPlayer.entryLinks = keyPlayer.entryLinks.filter(entryId => entryId !== id);
      }
      this._recordChange(state, {
        action: "entry.deleted",
        targetType: "entry",
        targetId: id,
        targetTitle: entry.title,
        before,
        structural: true
      });
      return before;
    });
  }

  async moveNode({ nodeType, nodeId, parentId = null, beforeType = null, beforeId = null }) {
    if (!["entry", "group"].includes(nodeType)) throw new CampaignEngineError("INVALID_NODE_TYPE", { nodeType });

    return this._mutate(state => {
      this._assertValidParent(state, parentId);
      const node = nodeType === "entry"
        ? this._findEntry(state, nodeId)
        : this._findGroup(state, nodeId);

      if (nodeType === "group") {
        if (node.kind === "chapter" && parentId !== null) throw new CampaignEngineError("CHAPTER_MUST_BE_ROOT");
        if (parentId === node.id || this._isDescendant(state, parentId, node.id)) {
          throw new CampaignEngineError("GROUP_CYCLE");
        }
      }

      const before = { parentId: node.parentId, sort: node.sort };
      const targetParent = nodeType === "group" && node.kind === "chapter" ? null : (parentId || null);
      node.parentId = targetParent;

      let siblings = getChildren(state, targetParent)
        .filter(s => !(s.nodeType === nodeType && s.id === nodeId));

      let index = siblings.length;
      if (beforeId && beforeType) {
        const found = siblings.findIndex(s => s.id === beforeId && s.nodeType === beforeType);
        if (found >= 0) index = found;
      }
      siblings.splice(index, 0, { nodeType, id: nodeId, sort: node.sort, data: node });

      siblings.forEach((sibling, i) => {
        sibling.data.sort = (i + 1) * SORT_STEP;
        sibling.data.updatedAt = new Date(this._now()).toISOString();
      });

      this._recordChange(state, {
        action: "node.moved",
        targetType: nodeType,
        targetId: node.id,
        targetTitle: node.title,
        before,
        after: { parentId: node.parentId, sort: node.sort },
        structural: true
      });
      return cloneData(node);
    });
  }

  async moveNodeByOffset(nodeType, nodeId, offset) {
    return this._mutate(state => {
      const node = nodeType === "entry"
        ? this._findEntry(state, nodeId)
        : this._findGroup(state, nodeId);
      const siblings = getChildren(state, node.parentId);

      const currentIndex = siblings.findIndex(s => s.nodeType === nodeType && s.id === nodeId);
      if (currentIndex < 0) return cloneData(node);
      const targetIndex = Math.max(0, Math.min(siblings.length - 1, currentIndex + Number(offset)));
      if (targetIndex === currentIndex) return cloneData(node);

      const before = { parentId: node.parentId, sort: node.sort };
      const [moved] = siblings.splice(currentIndex, 1);
      siblings.splice(targetIndex, 0, moved);
      siblings.forEach((sibling, i) => {
        sibling.data.sort = (i + 1) * SORT_STEP;
        sibling.data.updatedAt = new Date(this._now()).toISOString();
      });

      this._recordChange(state, {
        action: "node.moved",
        targetType: nodeType,
        targetId: node.id,
        targetTitle: node.title,
        before,
        after: { parentId: node.parentId, sort: node.sort },
        structural: true
      });
      return cloneData(node);
    });
  }

  async startSession() {
    return this._mutate(state => {
      if (this._activeSession(state)) throw new CampaignEngineError("SESSION_ALREADY_ACTIVE");
      const session = {
        id: this._newId(),
        number: state.meta.nextSessionNumber++,
        status: "active",
        startedAt: this._now(),
        endedAt: null,
        gameTimeStart: this._gameTime(),
        gameTimeEnd: null,
        changes: [],
        notes: ""
      };
      state.sessions.push(session);
      return cloneData(session);
    });
  }

  async endSession() {
    return this._mutate(state => {
      const session = this._activeSession(state);
      if (!session) throw new CampaignEngineError("NO_ACTIVE_SESSION");
      session.status = "closed";
      session.endedAt = this._now();
      session.gameTimeEnd = this._gameTime();
      return cloneData(session);
    });
  }

  async addManualSessionChange({ title, description = "", kind = "note" } = {}) {
    const cleanTitle = String(title ?? "").trim();
    if (!cleanTitle) throw new CampaignEngineError("TITLE_REQUIRED");
    if (!SESSION_CHANGE_KINDS[kind]) throw new CampaignEngineError("INVALID_SESSION_CHANGE_KIND", { kind });

    return this._mutate(state => {
      const session = this._activeSession(state);
      if (!session) throw new CampaignEngineError("NO_ACTIVE_SESSION");
      const change = this._recordChange(state, {
        action: "session.manual",
        targetType: "session",
        targetId: session.id,
        targetTitle: cleanTitle,
        source: "manual",
        structural: false,
        details: {
          kind,
          description: String(description ?? "")
        }
      });
      return cloneData(change);
    });
  }

  async updateManualSessionChange(changeId, { title, description = "", kind = "note" } = {}) {
    const cleanTitle = String(title ?? "").trim();
    if (!cleanTitle) throw new CampaignEngineError("TITLE_REQUIRED");
    if (!SESSION_CHANGE_KINDS[kind]) throw new CampaignEngineError("INVALID_SESSION_CHANGE_KIND", { kind });

    return this._mutate(state => {
      const session = this._activeSession(state);
      if (!session) throw new CampaignEngineError("NO_ACTIVE_SESSION");
      const change = session.changes.find(candidate => candidate.id === changeId);
      if (!change) throw new CampaignEngineError("SESSION_CHANGE_NOT_FOUND", { changeId });
      if (change.action !== "session.manual") throw new CampaignEngineError("SESSION_CHANGE_NOT_MANUAL", { changeId });

      change.targetTitle = cleanTitle;
      change.details = {
        ...(change.details ?? {}),
        kind,
        description: String(description ?? "")
      };
      change.editedAt = this._now();
      return cloneData(change);
    });
  }

  async deleteManualSessionChange(changeId) {
    return this._mutate(state => {
      const session = this._activeSession(state);
      if (!session) throw new CampaignEngineError("NO_ACTIVE_SESSION");
      const index = session.changes.findIndex(change => change.id === changeId);
      if (index < 0) throw new CampaignEngineError("SESSION_CHANGE_NOT_FOUND", { changeId });
      const change = session.changes[index];
      if (change.action !== "session.manual") throw new CampaignEngineError("SESSION_CHANGE_NOT_MANUAL", { changeId });
      session.changes.splice(index, 1);
      return cloneData(change);
    });
  }

  async createTracker({ title, description = "", value = 0, min = null, max = null }) {
    const cleanTitle = String(title ?? "").trim();
    if (!cleanTitle) throw new CampaignEngineError("TITLE_REQUIRED");
    return this._mutate(state => {
      const parsedMin = min === "" || min === null || min === undefined ? null : Number(min);
      const parsedMax = max === "" || max === null || max === undefined ? null : Number(max);
      if (Number.isFinite(parsedMin) && Number.isFinite(parsedMax) && parsedMin > parsedMax) {
        throw new CampaignEngineError("INVALID_TRACKER_RANGE");
      }
      let parsedValue = Number(value ?? 0);
      if (!Number.isFinite(parsedValue)) parsedValue = 0;
      if (Number.isFinite(parsedMin)) parsedValue = Math.max(parsedMin, parsedValue);
      if (Number.isFinite(parsedMax)) parsedValue = Math.min(parsedMax, parsedValue);

      const timestamp = new Date(this._now()).toISOString();
      const tracker = {
        id: this._newId(),
        title: cleanTitle,
        description: String(description ?? ""),
        value: parsedValue,
        min: parsedMin,
        max: parsedMax,
        sort: state.trackers.length
          ? Math.max(...state.trackers.map(t => Number(t.sort ?? 0))) + SORT_STEP
          : SORT_STEP,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.trackers.push(tracker);
      this._recordChange(state, {
        action: "tracker.created",
        targetType: "tracker",
        targetId: tracker.id,
        targetTitle: tracker.title,
        after: tracker,
        structural: true
      });
      return cloneData(tracker);
    });
  }

  async updateTracker(id, patch = {}) {
    return this._mutate(state => {
      const tracker = this._findTracker(state, id);
      const before = cloneData(tracker);
      if (patch.title !== undefined) {
        const title = String(patch.title).trim();
        if (!title) throw new CampaignEngineError("TITLE_REQUIRED");
        tracker.title = title;
      }
      if (patch.description !== undefined) tracker.description = String(patch.description ?? "");
      if (patch.value !== undefined) tracker.value = Number(patch.value);
      if (patch.min !== undefined) tracker.min = patch.min === "" || patch.min === null ? null : Number(patch.min);
      if (patch.max !== undefined) tracker.max = patch.max === "" || patch.max === null ? null : Number(patch.max);
      if (Number.isFinite(tracker.min) && Number.isFinite(tracker.max) && tracker.min > tracker.max) {
        throw new CampaignEngineError("INVALID_TRACKER_RANGE");
      }
      if (!Number.isFinite(tracker.value)) tracker.value = 0;
      if (Number.isFinite(tracker.min)) tracker.value = Math.max(tracker.min, tracker.value);
      if (Number.isFinite(tracker.max)) tracker.value = Math.min(tracker.max, tracker.value);
      tracker.updatedAt = new Date(this._now()).toISOString();

      this._recordChange(state, {
        action: "tracker.updated",
        targetType: "tracker",
        targetId: tracker.id,
        targetTitle: tracker.title,
        before,
        after: tracker,
        structural: true
      });
      return cloneData(tracker);
    });
  }

  async adjustTracker(id, delta, { source = "manual" } = {}) {
    return this._mutate(state => {
      const tracker = this._findTracker(state, id);
      const before = { value: tracker.value };
      let nextValue = Number(tracker.value) + Number(delta);
      if (Number.isFinite(tracker.min)) nextValue = Math.max(tracker.min, nextValue);
      if (Number.isFinite(tracker.max)) nextValue = Math.min(tracker.max, nextValue);
      tracker.value = nextValue;
      tracker.updatedAt = new Date(this._now()).toISOString();

      this._recordChange(state, {
        action: "tracker.adjusted",
        targetType: "tracker",
        targetId: tracker.id,
        targetTitle: tracker.title,
        before,
        after: { value: nextValue },
        source,
        structural: false,
        details: { delta: Number(delta) }
      });
      return cloneData(tracker);
    });
  }

  async deleteTracker(id) {
    return this._mutate(state => {
      const tracker = this._findTracker(state, id);
      const before = cloneData(tracker);
      state.trackers = state.trackers.filter(t => t.id !== id);
      state.overviewPins = state.overviewPins.filter(pin => !(pin.targetType === "tracker" && pin.targetId === id));
      for (const entry of state.entries) {
        for (const rule of entry.transitionRules ?? []) {
          rule.actions = (rule.actions ?? []).filter(action => !(action.type === "adjustTracker" && action.targetId === id));
        }
        entry.transitionRules = (entry.transitionRules ?? []).filter(rule => (rule.actions ?? []).length > 0);
        for (const rule of entry.rewardRules ?? []) {
          rule.rewards = (rule.rewards ?? []).filter(reward => !(reward.type === "tracker" && reward.trackerId === id));
        }
        entry.rewardRules = (entry.rewardRules ?? []).filter(rule => (rule.rewards ?? []).length > 0);
      }
      for (const keyPlayer of state.keyPlayers) {
        if (keyPlayer.relationshipTrackerId === id) keyPlayer.relationshipTrackerId = null;
      }
      this._recordChange(state, {
        action: "tracker.deleted",
        targetType: "tracker",
        targetId: id,
        targetTitle: tracker.title,
        before,
        structural: true
      });
      return before;
    });
  }

  async createKeyPlayer({
    actorUuid,
    actorName = "",
    actorImg = "",
    role = "neutral",
    state: keyPlayerState = "active",
    note = "",
    relationshipTrackerId = null,
    entryLinks = []
  } = {}) {
    const cleanUuid = String(actorUuid ?? "").trim();
    if (!cleanUuid) throw new CampaignEngineError("ACTOR_UUID_REQUIRED");
    if (!KEY_PLAYER_ROLES[role]) throw new CampaignEngineError("INVALID_KEY_PLAYER_ROLE", { role });
    if (!KEY_PLAYER_STATES[keyPlayerState]) throw new CampaignEngineError("INVALID_KEY_PLAYER_STATE", { state: keyPlayerState });

    return this._mutate(state => {
      if (state.keyPlayers.some(keyPlayer => keyPlayer.actorUuid === cleanUuid)) {
        throw new CampaignEngineError("KEY_PLAYER_ALREADY_EXISTS", { actorUuid: cleanUuid });
      }
      const normalizedLinks = this._validateKeyPlayerLinks(state, { relationshipTrackerId, entryLinks });
      const timestamp = new Date(this._now()).toISOString();
      const keyPlayer = {
        id: this._newId(),
        actorUuid: cleanUuid,
        actorName: String(actorName ?? ""),
        actorImg: String(actorImg ?? ""),
        role,
        state: keyPlayerState,
        note: String(note ?? ""),
        relationshipTrackerId: relationshipTrackerId || null,
        entryLinks: normalizedLinks,
        lastSeenSessionId: null,
        sort: state.keyPlayers.length
          ? Math.max(...state.keyPlayers.map(item => Number(item.sort ?? 0))) + SORT_STEP
          : SORT_STEP,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.keyPlayers.push(keyPlayer);
      this._recordChange(state, {
        action: "keyPlayer.created",
        targetType: "keyPlayer",
        targetId: keyPlayer.id,
        targetTitle: keyPlayer.actorName || keyPlayer.actorUuid,
        after: keyPlayer,
        structural: true
      });
      return cloneData(keyPlayer);
    });
  }

  async updateKeyPlayer(id, patch = {}) {
    return this._mutate(state => {
      const keyPlayer = this._findKeyPlayer(state, id);
      const before = cloneData(keyPlayer);

      if (patch.role !== undefined) {
        if (!KEY_PLAYER_ROLES[patch.role]) throw new CampaignEngineError("INVALID_KEY_PLAYER_ROLE", { role: patch.role });
        keyPlayer.role = patch.role;
      }
      if (patch.state !== undefined) {
        if (!KEY_PLAYER_STATES[patch.state]) throw new CampaignEngineError("INVALID_KEY_PLAYER_STATE", { state: patch.state });
        keyPlayer.state = patch.state;
      }
      if (patch.note !== undefined) keyPlayer.note = String(patch.note ?? "");
      if (patch.actorName !== undefined) keyPlayer.actorName = String(patch.actorName ?? "");
      if (patch.actorImg !== undefined) keyPlayer.actorImg = String(patch.actorImg ?? "");

      const relationshipTrackerId = patch.relationshipTrackerId !== undefined
        ? (patch.relationshipTrackerId || null)
        : keyPlayer.relationshipTrackerId;
      const entryLinks = patch.entryLinks !== undefined ? patch.entryLinks : keyPlayer.entryLinks;
      keyPlayer.entryLinks = this._validateKeyPlayerLinks(state, { relationshipTrackerId, entryLinks });
      keyPlayer.relationshipTrackerId = relationshipTrackerId;
      keyPlayer.updatedAt = new Date(this._now()).toISOString();

      this._recordChange(state, {
        action: "keyPlayer.updated",
        targetType: "keyPlayer",
        targetId: keyPlayer.id,
        targetTitle: keyPlayer.actorName || keyPlayer.actorUuid,
        before,
        after: keyPlayer,
        structural: true
      });
      return cloneData(keyPlayer);
    });
  }

  async markKeyPlayerSeen(id) {
    return this._mutate(state => {
      const session = this._activeSession(state);
      if (!session) throw new CampaignEngineError("NO_ACTIVE_SESSION");
      const keyPlayer = this._findKeyPlayer(state, id);
      if (keyPlayer.lastSeenSessionId === session.id) return cloneData(keyPlayer);
      const before = { lastSeenSessionId: keyPlayer.lastSeenSessionId };
      keyPlayer.lastSeenSessionId = session.id;
      keyPlayer.updatedAt = new Date(this._now()).toISOString();
      this._recordChange(state, {
        action: "keyPlayer.appeared",
        targetType: "keyPlayer",
        targetId: keyPlayer.id,
        targetTitle: keyPlayer.actorName || keyPlayer.actorUuid,
        before,
        after: { lastSeenSessionId: session.id },
        structural: false
      });
      return cloneData(keyPlayer);
    });
  }

  async moveKeyPlayerByOffset(id, offset) {
    return this._mutate(state => {
      const keyPlayer = this._findKeyPlayer(state, id);
      const siblings = [...state.keyPlayers].sort((a, b) => a.sort - b.sort);
      const currentIndex = siblings.findIndex(item => item.id === id);
      const targetIndex = Math.max(0, Math.min(siblings.length - 1, currentIndex + Number(offset)));
      if (targetIndex === currentIndex) return cloneData(keyPlayer);
      const beforeSort = keyPlayer.sort;
      const [moved] = siblings.splice(currentIndex, 1);
      siblings.splice(targetIndex, 0, moved);
      siblings.forEach((item, index) => item.sort = (index + 1) * SORT_STEP);
      state.keyPlayers = siblings;
      this._recordChange(state, {
        action: "keyPlayer.moved",
        targetType: "keyPlayer",
        targetId: keyPlayer.id,
        targetTitle: keyPlayer.actorName || keyPlayer.actorUuid,
        before: { sort: beforeSort },
        after: { sort: keyPlayer.sort },
        structural: true
      });
      return cloneData(keyPlayer);
    });
  }

  async deleteKeyPlayer(id) {
    return this._mutate(state => {
      const keyPlayer = this._findKeyPlayer(state, id);
      const before = cloneData(keyPlayer);
      state.keyPlayers = state.keyPlayers.filter(item => item.id !== id);
      state.overviewPins = state.overviewPins.filter(pin => !(pin.targetType === "keyPlayer" && pin.targetId === id));
      this._recordChange(state, {
        action: "keyPlayer.deleted",
        targetType: "keyPlayer",
        targetId: id,
        targetTitle: keyPlayer.actorName || keyPlayer.actorUuid,
        before,
        structural: true
      });
      return before;
    });
  }

  async setOverviewPinned(targetType, targetId, pinned = true) {
    return this._mutate(state => {
      const target = this._findOverviewTarget(state, targetType, targetId);
      const existing = state.overviewPins.find(pin => pin.targetType === targetType && pin.targetId === targetId);

      if (pinned) {
        if (existing) return cloneData(existing);
        const sort = state.overviewPins.length
          ? Math.max(...state.overviewPins.map(pin => Number(pin.sort ?? 0))) + SORT_STEP
          : SORT_STEP;
        const pin = {
          id: this._newId(),
          targetType,
          targetId,
          sort,
          createdAt: new Date(this._now()).toISOString()
        };
        state.overviewPins.push(pin);
        this._recordChange(state, {
          action: "overview.pinned",
          targetType,
          targetId,
          targetTitle: this._overviewTargetTitle(targetType, target),
          after: pin,
          structural: true
        });
        return cloneData(pin);
      }

      if (!existing) return null;
      state.overviewPins = state.overviewPins.filter(pin => pin.id !== existing.id);
      state.overviewPins
        .sort((a, b) => a.sort - b.sort)
        .forEach((pin, index) => pin.sort = (index + 1) * SORT_STEP);
      this._recordChange(state, {
        action: "overview.unpinned",
        targetType,
        targetId,
        targetTitle: this._overviewTargetTitle(targetType, target),
        before: existing,
        structural: true
      });
      return cloneData(existing);
    });
  }

  async moveOverviewPinByOffset(pinId, offset) {
    return this._mutate(state => {
      const pins = [...state.overviewPins].sort((a, b) => a.sort - b.sort);
      const currentIndex = pins.findIndex(pin => pin.id === pinId);
      if (currentIndex < 0) throw new CampaignEngineError("OVERVIEW_PIN_NOT_FOUND", { pinId });
      const targetIndex = Math.max(0, Math.min(pins.length - 1, currentIndex + Number(offset)));
      if (targetIndex === currentIndex) return cloneData(pins[currentIndex]);

      const [moved] = pins.splice(currentIndex, 1);
      pins.splice(targetIndex, 0, moved);
      pins.forEach((pin, index) => pin.sort = (index + 1) * SORT_STEP);
      state.overviewPins = pins;

      const target = this._findOverviewTarget(state, moved.targetType, moved.targetId);
      this._recordChange(state, {
        action: "overview.moved",
        targetType: moved.targetType,
        targetId: moved.targetId,
        targetTitle: this._overviewTargetTitle(moved.targetType, target),
        structural: true
      });
      return cloneData(moved);
    });
  }

  async moveTrackerByOffset(id, offset) {
    return this._mutate(state => {
      const tracker = this._findTracker(state, id);
      const siblings = [...state.trackers].sort((a, b) => a.sort - b.sort);
      const currentIndex = siblings.findIndex(t => t.id === id);
      const targetIndex = Math.max(0, Math.min(siblings.length - 1, currentIndex + Number(offset)));
      if (targetIndex === currentIndex) return cloneData(tracker);
      const beforeSort = tracker.sort;
      const [moved] = siblings.splice(currentIndex, 1);
      siblings.splice(targetIndex, 0, moved);
      siblings.forEach((item, i) => item.sort = (i + 1) * SORT_STEP);
      this._recordChange(state, {
        action: "node.moved",
        targetType: "tracker",
        targetId: tracker.id,
        targetTitle: tracker.title,
        before: { sort: beforeSort },
        after: { sort: tracker.sort },
        structural: true
      });
      return cloneData(tracker);
    });
  }
}
