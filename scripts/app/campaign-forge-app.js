import {
  ENTRY_TYPES,
  JOURNAL_LINK_ROLES,
  KEY_PLAYER_ROLES,
  KEY_PLAYER_STATES,
  MODULE_ID,
  REWARD_STATES,
  REWARD_TYPES,
  SETTINGS,
  SESSION_CHANGE_KINDS,
  STATUS_LABELS,
  TRANSITION_ACTION_TYPES,
} from "../core/constants.js";
import { CampaignEngineError } from "../engine/campaign-engine.js";
import { getGroupProgress } from "../data/state.js";
import { campaignEntryEmbedSyntax, EMBED_MIME } from "../integrations/journal-entries.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

function localize(key) {
  return game.i18n.localize(key);
}

function escapeHTML(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function format(key, data = {}) {
  return game.i18n.format(key, data);
}

function localeDate(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(game.i18n.lang, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function localeTime(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(game.i18n.lang, {
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function entryTypeOptions(selected) {
  return Object.entries(ENTRY_TYPES).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function statusOptions(type, selected) {
  return (ENTRY_TYPES[type]?.statuses ?? []).map(id => ({
    id,
    label: localize(STATUS_LABELS[id] ?? id),
    selected: id === selected
  }));
}

function sessionChangeKindOptions(selected = "note") {
  return Object.entries(SESSION_CHANGE_KINDS).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function keyPlayerRoleOptions(selected = "neutral") {
  return Object.entries(KEY_PLAYER_ROLES).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function keyPlayerStateOptions(selected = "active") {
  return Object.entries(KEY_PLAYER_STATES).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function journalLinkRoleOptions(selected = "details") {
  return Object.entries(JOURNAL_LINK_ROLES).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

async function resolveJournalTarget(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== "function") return null;
  try {
    const document = await globalThis.fromUuid(uuid);
    return ["JournalEntry", "JournalEntryPage"].includes(document?.documentName) ? document : null;
  } catch {
    return null;
  }
}

function transitionActionTypeOptions(selected = "setEntryStatus") {
  return Object.entries(TRANSITION_ACTION_TYPES).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function rewardTypeOptions(selected = "xp") {
  return Object.entries(REWARD_TYPES).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function rewardStateLabel(state) {
  return localize(REWARD_STATES[state]?.label ?? state);
}

function rewardPreviewLabel(reward) {
  if (reward.type === "xp") {
    return format("CAMPAIGN_FORGE.Rewards.PreviewXP", { amount: reward.amount ?? 0 });
  }
  if (reward.type === "currency") {
    const coins = reward.coins ?? {};
    const parts = ["pp", "gp", "sp", "cp"]
      .filter(denom => Number(coins[denom] ?? 0) > 0)
      .map(denom => `${Number(coins[denom])} ${denom.toUpperCase()}`);
    return format("CAMPAIGN_FORGE.Rewards.PreviewCurrency", { amount: parts.join(", ") });
  }
  if (reward.type === "item") {
    return format("CAMPAIGN_FORGE.Rewards.PreviewItem", {
      quantity: reward.quantity ?? 1,
      item: reward.itemName || reward.itemUuid || localize("CAMPAIGN_FORGE.Rewards.UnknownItem")
    });
  }
  if (reward.type === "tracker") {
    const delta = Number(reward.delta ?? 0);
    return format("CAMPAIGN_FORGE.Rewards.PreviewTracker", {
      title: reward.targetTitle ?? reward.trackerId ?? "",
      delta: delta >= 0 ? `+${delta}` : String(delta)
    });
  }
  return reward.type ?? "";
}

function booleanOptions(selected) {
  return [
    { id: "true", label: localize("CAMPAIGN_FORGE.Common.Yes"), selected: selected === true },
    { id: "false", label: localize("CAMPAIGN_FORGE.Common.No"), selected: selected === false }
  ];
}


async function resolveActor(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== "function") return null;
  try {
    const document = await globalThis.fromUuid(uuid);
    return document?.documentName === "Actor" ? document : null;
  } catch {
    return null;
  }
}

async function resolveItem(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== "function") return null;
  try {
    const document = await globalThis.fromUuid(uuid);
    return document?.documentName === "Item" ? document : null;
  } catch {
    return null;
  }
}

function actionSummary(change) {
  switch (change.action) {
    case "entry.status":
      return format("CAMPAIGN_FORGE.Changes.EntryStatus", {
        title: change.targetTitle,
        from: localize(STATUS_LABELS[change.before?.status] ?? change.before?.status ?? ""),
        to: localize(STATUS_LABELS[change.after?.status] ?? change.after?.status ?? "")
      });
    case "entry.created":
      return format("CAMPAIGN_FORGE.Changes.EntryCreated", { title: change.targetTitle });
    case "entry.updated":
      return format("CAMPAIGN_FORGE.Changes.EntryUpdated", { title: change.targetTitle });
    case "entry.deleted":
      return format("CAMPAIGN_FORGE.Changes.EntryDeleted", { title: change.targetTitle });
    case "group.created":
      return format("CAMPAIGN_FORGE.Changes.GroupCreated", { title: change.targetTitle });
    case "group.updated":
      return format("CAMPAIGN_FORGE.Changes.GroupUpdated", { title: change.targetTitle });
    case "group.deleted":
      return format("CAMPAIGN_FORGE.Changes.GroupDeleted", { title: change.targetTitle });
    case "node.moved":
      return format("CAMPAIGN_FORGE.Changes.NodeMoved", { title: change.targetTitle });
    case "tracker.created":
      return format("CAMPAIGN_FORGE.Changes.TrackerCreated", { title: change.targetTitle });
    case "tracker.updated":
      return format("CAMPAIGN_FORGE.Changes.TrackerUpdated", { title: change.targetTitle });
    case "tracker.deleted":
      return format("CAMPAIGN_FORGE.Changes.TrackerDeleted", { title: change.targetTitle });
    case "tracker.adjusted": {
      const delta = Number(change.details?.delta ?? 0);
      return format("CAMPAIGN_FORGE.Changes.TrackerAdjusted", {
        title: change.targetTitle,
        delta: delta >= 0 ? `+${delta}` : `${delta}`,
        value: change.after?.value ?? ""
      });
    }
    case "overview.pinned":
      return format("CAMPAIGN_FORGE.Changes.OverviewPinned", { title: change.targetTitle });
    case "overview.unpinned":
      return format("CAMPAIGN_FORGE.Changes.OverviewUnpinned", { title: change.targetTitle });
    case "overview.moved":
      return format("CAMPAIGN_FORGE.Changes.OverviewMoved", { title: change.targetTitle });
    case "keyPlayer.created":
      return format("CAMPAIGN_FORGE.Changes.KeyPlayerCreated", { title: change.targetTitle });
    case "keyPlayer.updated":
      return format("CAMPAIGN_FORGE.Changes.KeyPlayerUpdated", { title: change.targetTitle });
    case "keyPlayer.deleted":
      return format("CAMPAIGN_FORGE.Changes.KeyPlayerDeleted", { title: change.targetTitle });
    case "keyPlayer.moved":
      return format("CAMPAIGN_FORGE.Changes.KeyPlayerMoved", { title: change.targetTitle });
    case "keyPlayer.appeared":
      return format("CAMPAIGN_FORGE.Changes.KeyPlayerAppeared", { title: change.targetTitle });
    case "entry.active":
      return format("CAMPAIGN_FORGE.Changes.EntryActive", {
        title: change.targetTitle,
        value: change.after?.active ? localize("CAMPAIGN_FORGE.Common.Yes") : localize("CAMPAIGN_FORGE.Common.No")
      });
    case "entry.visible":
      return format("CAMPAIGN_FORGE.Changes.EntryVisible", {
        title: change.targetTitle,
        value: change.after?.visible ? localize("CAMPAIGN_FORGE.Common.Yes") : localize("CAMPAIGN_FORGE.Common.No")
      });
    case "entry.rule.created":
      return format("CAMPAIGN_FORGE.Changes.RuleCreated", { title: change.targetTitle });
    case "entry.rule.updated":
      return format("CAMPAIGN_FORGE.Changes.RuleUpdated", { title: change.targetTitle });
    case "entry.rule.deleted":
      return format("CAMPAIGN_FORGE.Changes.RuleDeleted", { title: change.targetTitle });
    case "entry.rewardRule.created":
      return format("CAMPAIGN_FORGE.Changes.RewardRuleCreated", { title: change.targetTitle });
    case "entry.rewardRule.updated":
      return format("CAMPAIGN_FORGE.Changes.RewardRuleUpdated", { title: change.targetTitle });
    case "entry.rewardRule.deleted":
      return format("CAMPAIGN_FORGE.Changes.RewardRuleDeleted", { title: change.targetTitle });
    case "reward.pending":
      return format("CAMPAIGN_FORGE.Changes.RewardPending", { title: change.targetTitle });
    case "reward.granted":
      return format("CAMPAIGN_FORGE.Changes.RewardGranted", { title: change.targetTitle });
    case "reward.skipped":
      return format("CAMPAIGN_FORGE.Changes.RewardSkipped", { title: change.targetTitle });
    case "reward.failed":
      return format("CAMPAIGN_FORGE.Changes.RewardFailed", { title: change.targetTitle });
    case "reward.reset":
      return format("CAMPAIGN_FORGE.Changes.RewardReset", { title: change.targetTitle });
    case "entry.journal.added":
      return format("CAMPAIGN_FORGE.Changes.JournalLinkAdded", { title: change.targetTitle });
    case "entry.journal.updated":
      return format("CAMPAIGN_FORGE.Changes.JournalLinkUpdated", { title: change.targetTitle });
    case "entry.journal.removed":
      return format("CAMPAIGN_FORGE.Changes.JournalLinkRemoved", { title: change.targetTitle });
    case "session.manual": {
      const kind = change.details?.kind ?? "note";
      const kindLabel = localize(SESSION_CHANGE_KINDS[kind]?.label ?? SESSION_CHANGE_KINDS.note.label);
      return format("CAMPAIGN_FORGE.Changes.ManualSessionChange", {
        kind: kindLabel,
        title: change.targetTitle
      });
    }
    default:
      return change.targetTitle || change.action;
  }
}

function transitionPlanActionLabel(action) {
  if (action.kind === "entry.status") {
    return format("CAMPAIGN_FORGE.Transitions.PreviewStatus", {
      title: action.targetTitle,
      from: localize(STATUS_LABELS[action.before?.status] ?? action.before?.status ?? ""),
      to: localize(STATUS_LABELS[action.after?.status] ?? action.after?.status ?? "")
    });
  }
  if (action.kind === "entry.active") {
    return format("CAMPAIGN_FORGE.Transitions.PreviewActive", {
      title: action.targetTitle,
      value: action.after?.active ? localize("CAMPAIGN_FORGE.Common.Yes") : localize("CAMPAIGN_FORGE.Common.No")
    });
  }
  if (action.kind === "entry.visible") {
    return format("CAMPAIGN_FORGE.Transitions.PreviewVisible", {
      title: action.targetTitle,
      value: action.after?.visible ? localize("CAMPAIGN_FORGE.Common.Yes") : localize("CAMPAIGN_FORGE.Common.No")
    });
  }
  if (action.kind === "tracker.adjusted") {
    const delta = Number(action.details?.delta ?? 0);
    return format("CAMPAIGN_FORGE.Transitions.PreviewTracker", {
      title: action.targetTitle,
      delta: delta >= 0 ? `+${delta}` : `${delta}`,
      value: action.after?.value ?? ""
    });
  }
  return action.targetTitle || action.kind;
}

export class CampaignForgeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "campaign-forge",
    classes: ["campaign-forge"],
    position: {
      width: 1040,
      height: 720
    },
    window: {
      icon: "fa-solid fa-book-open",
      resizable: true
    },
    actions: {
      setTab: this._actionSetTab,
      createChapter: this._actionCreateChapter,
      createGroup: this._actionCreateGroup,
      createEntry: this._actionCreateEntry,
      editGroup: this._actionEditGroup,
      editEntry: this._actionEditEntry,
      manageRules: this._actionManageRules,
      manageRewards: this._actionManageRewards,
      addRewardRule: this._actionAddRewardRule,
      editRewardRule: this._actionEditRewardRule,
      deleteRewardRule: this._actionDeleteRewardRule,
      cancelRewardRule: this._actionCancelRewardRule,
      saveRewardRule: this._actionSaveRewardRule,
      addRewardItem: this._actionAddRewardItem,
      removeRewardItem: this._actionRemoveRewardItem,
      grantReward: this._actionGrantReward,
      skipReward: this._actionSkipReward,
      resetReward: this._actionResetReward,
      addTransitionRule: this._actionAddTransitionRule,
      editTransitionRule: this._actionEditTransitionRule,
      deleteTransitionRule: this._actionDeleteTransitionRule,
      cancelTransitionRule: this._actionCancelTransitionRule,
      saveTransitionRule: this._actionSaveTransitionRule,
      addTransitionAction: this._actionAddTransitionAction,
      removeTransitionAction: this._actionRemoveTransitionAction,
      cancelEditor: this._actionCancelEditor,
      saveEditor: this._actionSaveEditor,
      toggleGroup: this._actionToggleGroup,
      moveUp: this._actionMoveUp,
      moveDown: this._actionMoveDown,
      deleteNode: this._actionDeleteNode,
      startSession: this._actionStartSession,
      endSession: this._actionEndSession,
      addSessionChange: this._actionAddSessionChange,
      editSessionChange: this._actionEditSessionChange,
      deleteSessionChange: this._actionDeleteSessionChange,
      createTracker: this._actionCreateTracker,
      editTracker: this._actionEditTracker,
      adjustTracker: this._actionAdjustTracker,
      moveTrackerUp: this._actionMoveTrackerUp,
      moveTrackerDown: this._actionMoveTrackerDown,
      deleteTracker: this._actionDeleteTracker,
      toggleOverviewPin: this._actionToggleOverviewPin,
      moveOverviewPinUp: this._actionMoveOverviewPinUp,
      moveOverviewPinDown: this._actionMoveOverviewPinDown,
      openOverviewTarget: this._actionOpenOverviewTarget,
      editKeyPlayer: this._actionEditKeyPlayer,
      deleteKeyPlayer: this._actionDeleteKeyPlayer,
      moveKeyPlayerUp: this._actionMoveKeyPlayerUp,
      moveKeyPlayerDown: this._actionMoveKeyPlayerDown,
      markKeyPlayerSeen: this._actionMarkKeyPlayerSeen,
      openKeyPlayerActor: this._actionOpenKeyPlayerActor,
      openJournalLink: this._actionOpenJournalLink,
      removeJournalLink: this._actionRemoveJournalLink,
      setJournalPrimary: this._actionSetJournalPrimary,
      openPrimaryJournal: this._actionOpenPrimaryJournal
    }
  };

  static PARTS = {
    main: {
      template: "modules/campaign-forge/templates/campaign-forge.hbs",
      scrollable: [".cf-main-scroll"]
    }
  };

  constructor(engine, options = {}) {
    super({
      ...options,
      window: {
        ...(options.window ?? {}),
        title: localize("CAMPAIGN_FORGE.Title")
      }
    });
    this.engine = engine;
    this._activeTab = "overview";
    this._editor = null;
    this._ruleEditor = null;
    this._rewardEditor = null;
    this._focusKey = null;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = await this.engine.getState();
    const collapsed = new Set(game.settings.get(MODULE_ID, SETTINGS.COLLAPSED_GROUPS) ?? []);
    const activeSession = state.sessions.find(s => s.status === "active") ?? null;
    const showStructural = game.settings.get(MODULE_ID, SETTINGS.SHOW_STRUCTURAL_CHANGES);
    const pinnedTargets = new Set(state.overviewPins.map(pin => `${pin.targetType}:${pin.targetId}`));

    const campaignRows = [];
    const seen = new Set();

    const pushChildren = (parentId, depth) => {
      const groups = state.groups
        .filter(g => g.parentId === parentId)
        .map(g => ({ nodeType: "group", id: g.id, sort: g.sort, data: g }));
      const entries = state.entries
        .filter(e => e.parentId === parentId)
        .map(e => ({ nodeType: "entry", id: e.id, sort: e.sort, data: e }));
      const children = [...groups, ...entries].sort((a, b) => a.sort - b.sort);

      for (const child of children) {
        const key = `${child.nodeType}:${child.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (child.nodeType === "group") {
          const group = child.data;
          const isCollapsed = collapsed.has(group.id);
          campaignRows.push({
            nodeType: "group",
            id: group.id,
            title: group.title,
            kind: group.kind,
            kindLabel: localize(group.kind === "chapter"
              ? "CAMPAIGN_FORGE.GroupKinds.chapter"
              : "CAMPAIGN_FORGE.GroupKinds.group"),
            depth,
            collapsed: isCollapsed,
            icon: group.kind === "chapter" ? "fa-solid fa-bookmark" : "fa-solid fa-folder",
            hasDescription: Boolean(group.description),
            overviewPinned: pinnedTargets.has(`group:${group.id}`),
            focusKey: `group:${group.id}`
          });
          if (!isCollapsed) pushChildren(group.id, depth + 1);
        } else {
          const entry = child.data;
          campaignRows.push({
            nodeType: "entry",
            id: entry.id,
            title: entry.title,
            type: entry.type,
            typeLabel: localize(ENTRY_TYPES[entry.type]?.label ?? entry.type),
            icon: ENTRY_TYPES[entry.type]?.icon ?? "fa-solid fa-note-sticky",
            depth,
            active: entry.active,
            visible: entry.visible,
            status: entry.status,
            statuses: statusOptions(entry.type, entry.status),
            hasDescription: Boolean(entry.description),
            journalLinkCount: (entry.journalLinks ?? []).length,
            hasJournalLinks: (entry.journalLinks ?? []).length > 0,
            hasPrimaryJournal: (entry.journalLinks ?? []).some(link => link.primary),
            ruleCount: (entry.transitionRules ?? []).length,
            hasRules: (entry.transitionRules ?? []).length > 0,
            rewardRuleCount: (entry.rewardRules ?? []).length,
            hasRewardRules: (entry.rewardRules ?? []).length > 0,
            overviewPinned: pinnedTargets.has(`entry:${entry.id}`),
            focusKey: `entry:${entry.id}`
          });
        }
      }
    };

    pushChildren(null, 0);

    const sessions = [...state.sessions]
      .sort((a, b) => b.number - a.number)
      .map(session => {
        const rawChanges = session.changes.filter(change => showStructural || !change.structural);
        const transactionGroups = [];
        for (const change of rawChanges) {
          const previous = transactionGroups[transactionGroups.length - 1];
          if (change.transactionId && previous?.transactionId === change.transactionId) previous.items.push(change);
          else transactionGroups.push({ transactionId: change.transactionId ?? null, items: [change] });
        }
        const changes = transactionGroups
          .reverse()
          .flatMap(group => group.items.map((change, index) => ({
            ...change,
            timeLabel: localeTime(change.timestamp),
            summary: actionSummary(change),
            structural: Boolean(change.structural),
            isConsequence: Boolean(group.transactionId && index > 0 && change.source === "transition"),
            detailsText: change.action === "session.manual" ? String(change.details?.description ?? "") : "",
            canEdit: session.status === "active" && change.action === "session.manual",
            canDelete: session.status === "active" && change.action === "session.manual"
          })));
        return {
          ...session,
          startedLabel: localeDate(session.startedAt),
          endedLabel: session.endedAt ? localeDate(session.endedAt) : localize("CAMPAIGN_FORGE.Session.Active"),
          changes
        };
      });

    const trackers = [...state.trackers]
      .sort((a, b) => a.sort - b.sort)
      .map(tracker => ({
        ...tracker,
        hasMin: Number.isFinite(tracker.min),
        hasMax: Number.isFinite(tracker.max),
        rangeLabel: Number.isFinite(tracker.min) || Number.isFinite(tracker.max)
          ? `${Number.isFinite(tracker.min) ? tracker.min : "−∞"} … ${Number.isFinite(tracker.max) ? tracker.max : "∞"}`
          : null,
        overviewPinned: pinnedTargets.has(`tracker:${tracker.id}`),
        focusKey: `tracker:${tracker.id}`
      }));

    const keyPlayers = await Promise.all([...state.keyPlayers]
      .sort((a, b) => a.sort - b.sort)
      .map(async keyPlayer => {
        const actor = await resolveActor(keyPlayer.actorUuid);
        const relationship = keyPlayer.relationshipTrackerId
          ? state.trackers.find(tracker => tracker.id === keyPlayer.relationshipTrackerId) ?? null
          : null;
        const lastSeenSession = keyPlayer.lastSeenSessionId
          ? state.sessions.find(session => session.id === keyPlayer.lastSeenSessionId) ?? null
          : null;
        const liveName = actor?.name ?? keyPlayer.actorName ?? "";
        const liveImg = actor?.img ?? keyPlayer.actorImg ?? "icons/svg/mystery-man.svg";
        return {
          ...keyPlayer,
          name: liveName || localize("CAMPAIGN_FORGE.KeyPlayers.UnknownActor"),
          image: liveImg || "icons/svg/mystery-man.svg",
          actorMissing: !actor,
          roleLabel: localize(KEY_PLAYER_ROLES[keyPlayer.role]?.label ?? "CAMPAIGN_FORGE.KeyPlayerRoles.neutral"),
          stateLabel: localize(KEY_PLAYER_STATES[keyPlayer.state]?.label ?? "CAMPAIGN_FORGE.KeyPlayerStates.active"),
          relationshipTitle: relationship?.title ?? null,
          relationshipValue: relationship?.value ?? null,
          hasRelationship: Boolean(relationship),
          linkedEntryCount: keyPlayer.entryLinks.filter(entryId => state.entries.some(entry => entry.id === entryId)).length,
          lastSeenLabel: lastSeenSession
            ? format("CAMPAIGN_FORGE.KeyPlayers.SessionNumber", { number: lastSeenSession.number })
            : localize("CAMPAIGN_FORGE.KeyPlayers.NeverSeen"),
          seenThisSession: Boolean(activeSession && keyPlayer.lastSeenSessionId === activeSession.id),
          canMarkSeen: Boolean(activeSession),
          overviewPinned: pinnedTargets.has(`keyPlayer:${keyPlayer.id}`),
          focusKey: `keyPlayer:${keyPlayer.id}`
        };
      }));
    const keyPlayerById = new Map(keyPlayers.map(keyPlayer => [keyPlayer.id, keyPlayer]));

    const overviewPins = [...state.overviewPins]
      .sort((a, b) => a.sort - b.sort)
      .map(pin => {
        if (pin.targetType === "entry") {
          const entry = state.entries.find(candidate => candidate.id === pin.targetId);
          if (!entry) return null;
          return {
            ...pin,
            targetTitle: entry.title,
            icon: ENTRY_TYPES[entry.type]?.icon ?? "fa-solid fa-note-sticky",
            metaLabel: localize(ENTRY_TYPES[entry.type]?.label ?? entry.type),
            detailLabel: localize(STATUS_LABELS[entry.status] ?? entry.status),
            isEntry: true,
            progressPercent: null
          };
        }

        if (pin.targetType === "group") {
          const group = state.groups.find(candidate => candidate.id === pin.targetId);
          if (!group) return null;
          const progress = getGroupProgress(state, group.id);
          return {
            ...pin,
            targetTitle: group.title,
            icon: group.kind === "chapter" ? "fa-solid fa-bookmark" : "fa-solid fa-folder",
            metaLabel: localize(group.kind === "chapter"
              ? "CAMPAIGN_FORGE.GroupKinds.chapter"
              : "CAMPAIGN_FORGE.GroupKinds.group"),
            detailLabel: progress.total
              ? format("CAMPAIGN_FORGE.Overview.ProgressCount", { reached: progress.reached, total: progress.total })
              : localize("CAMPAIGN_FORGE.Overview.NoProgressEntries"),
            isGroup: true,
            hasProgress: progress.total > 0,
            progressPercent: progress.percent
          };
        }

        if (pin.targetType === "tracker") {
          const tracker = state.trackers.find(candidate => candidate.id === pin.targetId);
          if (!tracker) return null;
          const hasFiniteRange = Number.isFinite(tracker.min) && Number.isFinite(tracker.max) && tracker.max > tracker.min;
          const progressPercent = hasFiniteRange
            ? Math.max(0, Math.min(100, Math.round(((tracker.value - tracker.min) / (tracker.max - tracker.min)) * 100)))
            : null;
          const rangeLabel = Number.isFinite(tracker.min) || Number.isFinite(tracker.max)
            ? `${Number.isFinite(tracker.min) ? tracker.min : "−∞"} … ${Number.isFinite(tracker.max) ? tracker.max : "∞"}`
            : localize("CAMPAIGN_FORGE.Overview.UnboundedValue");
          return {
            ...pin,
            targetTitle: tracker.title,
            icon: "fa-solid fa-chart-simple",
            metaLabel: localize("CAMPAIGN_FORGE.Overview.CampaignValue"),
            detailLabel: `${tracker.value} · ${rangeLabel}`,
            isTracker: true,
            hasProgress: hasFiniteRange,
            progressPercent
          };
        }

        if (pin.targetType === "keyPlayer") {
          const keyPlayer = keyPlayerById.get(pin.targetId);
          if (!keyPlayer) return null;
          const relationship = keyPlayer.hasRelationship
            ? ` · ${keyPlayer.relationshipTitle}: ${keyPlayer.relationshipValue}`
            : "";
          return {
            ...pin,
            targetTitle: keyPlayer.name,
            image: keyPlayer.image,
            metaLabel: localize("CAMPAIGN_FORGE.Overview.KeyPlayer"),
            detailLabel: `${keyPlayer.roleLabel} · ${keyPlayer.stateLabel}${relationship}`,
            isKeyPlayer: true,
            hasProgress: false,
            progressPercent: null
          };
        }

        return null;
      })
      .filter(Boolean);

    const countByType = Object.keys(ENTRY_TYPES).map(type => ({
      type,
      label: localize(ENTRY_TYPES[type].label),
      count: state.entries.filter(e => e.type === type).length,
      icon: ENTRY_TYPES[type].icon
    })).filter(x => x.count > 0);

    const contextEditor = await this._buildEditor(state);

    return {
      ...context,
      activeTab: this._activeTab,
      tabs: [
        { id: "overview", label: localize("CAMPAIGN_FORGE.Tabs.Overview"), icon: "fa-solid fa-gauge", active: this._activeTab === "overview" },
        { id: "campaign", label: localize("CAMPAIGN_FORGE.Tabs.Campaign"), icon: "fa-solid fa-folder-tree", active: this._activeTab === "campaign" },
        { id: "sessions", label: localize("CAMPAIGN_FORGE.Tabs.Sessions"), icon: "fa-solid fa-clock-rotate-left", active: this._activeTab === "sessions" },
        { id: "trackers", label: localize("CAMPAIGN_FORGE.Tabs.Trackers"), icon: "fa-solid fa-chart-simple", active: this._activeTab === "trackers" },
        { id: "keyPlayers", label: localize("CAMPAIGN_FORGE.Tabs.KeyPlayers"), icon: "fa-solid fa-users", active: this._activeTab === "keyPlayers" },
        { id: "settings", label: localize("CAMPAIGN_FORGE.Tabs.Settings"), icon: "fa-solid fa-gear", active: this._activeTab === "settings" }
      ],
      state,
      campaignRows,
      sessions,
      trackers,
      keyPlayers,
      overviewPins,
      countByType,
      activeSession: activeSession ? {
        ...activeSession,
        startedLabel: localeTime(activeSession.startedAt),
        changeCount: activeSession.changes.length
      } : null,
      editor: contextEditor,
      overview: {
        entries: state.entries.length,
        groups: state.groups.length,
        chapters: state.groups.filter(g => g.kind === "chapter").length,
        trackers: state.trackers.length,
        keyPlayers: state.keyPlayers.length,
        sessions: state.sessions.filter(s => s.status === "closed").length,
        activeEntries: state.entries.filter(e => e.active).length
      },
      settings: {
        showJournalButton: game.settings.get(MODULE_ID, SETTINGS.SHOW_JOURNAL_BUTTON),
        showStructuralChanges: game.settings.get(MODULE_ID, SETTINGS.SHOW_STRUCTURAL_CHANGES)
      },
      version: game.modules.get(MODULE_ID)?.version ?? "0.5.1",
      labels: {
        title: localize("CAMPAIGN_FORGE.Title"),
        noActiveSession: localize("CAMPAIGN_FORGE.Session.NoneActive")
      }
    };
  }

  async _buildEditor(state) {
    if (!this._editor) return null;

    if (this._editor.kind === "group") {
      const source = this._editor.id
        ? state.groups.find(g => g.id === this._editor.id)
        : null;
      return {
        kind: "group",
        id: source?.id ?? "",
        isNew: !source,
        title: source?.title ?? "",
        description: source?.description ?? "",
        groupKind: source?.kind ?? this._editor.groupKind ?? "group",
        parentId: source?.parentId ?? this._editor.parentId ?? null,
        heading: localize(source
          ? "CAMPAIGN_FORGE.Editor.EditGroup"
          : (this._editor.groupKind === "chapter"
            ? "CAMPAIGN_FORGE.Editor.NewChapter"
            : "CAMPAIGN_FORGE.Editor.NewGroup"))
      };
    }

    if (this._editor.kind === "entry") {
      const source = this._editor.id
        ? state.entries.find(e => e.id === this._editor.id)
        : null;
      const type = source?.type ?? "quest";
      const status = source?.status ?? ENTRY_TYPES[type].statuses[0];
      return {
        kind: "entry",
        id: source?.id ?? "",
        isNew: !source,
        title: source?.title ?? "",
        description: source?.description ?? "",
        type,
        status,
        parentId: source?.parentId ?? this._editor.parentId ?? null,
        active: source?.active ?? true,
        visible: source?.visible ?? true,
        types: entryTypeOptions(type),
        statuses: statusOptions(type, status),
        canManageJournalLinks: Boolean(source),
        journalLinks: source ? await Promise.all((source.journalLinks ?? []).map(async link => {
          const target = await resolveJournalTarget(link.uuid);
          const liveLabel = target?.name ?? link.label ?? link.uuid;
          return {
            ...link,
            label: liveLabel,
            missing: !target,
            targetTypeLabel: target?.documentName === "JournalEntryPage"
              ? localize("CAMPAIGN_FORGE.JournalLinks.Page")
              : localize("CAMPAIGN_FORGE.JournalLinks.Journal"),
            roles: journalLinkRoleOptions(link.role)
          };
        })) : [],
        hasJournalLinks: Boolean(source?.journalLinks?.length),
        heading: localize(source ? "CAMPAIGN_FORGE.Editor.EditEntry" : "CAMPAIGN_FORGE.Editor.NewEntry")
      };
    }

    if (this._editor.kind === "rules") {
      const source = state.entries.find(entry => entry.id === this._editor.entryId);
      if (!source) return null;

      const rules = (source.transitionRules ?? []).map(rule => ({
        ...rule,
        fromLabel: localize(STATUS_LABELS[rule.fromStatus] ?? rule.fromStatus),
        toLabel: localize(STATUS_LABELS[rule.toStatus] ?? rule.toStatus),
        actionCount: (rule.actions ?? []).length
      }));

      let ruleEditor = null;
      if (this._ruleEditor?.entryId === source.id) {
        const existing = this._ruleEditor.ruleId
          ? source.transitionRules.find(rule => rule.id === this._ruleEditor.ruleId)
          : null;
        if (!this._ruleEditor.draft) {
          const statuses = ENTRY_TYPES[source.type].statuses;
          this._ruleEditor.draft = existing ? JSON.parse(JSON.stringify(existing)) : {
            enabled: true,
            fromStatus: statuses[0],
            toStatus: statuses[1] ?? statuses[0],
            actions: []
          };
        }
        const draft = this._ruleEditor.draft;
        const sortedEntries = [...state.entries].sort((a, b) => String(a.title).localeCompare(String(b.title)));
        const sortedTrackers = [...state.trackers].sort((a, b) => String(a.title).localeCompare(String(b.title)));
        ruleEditor = {
          id: existing?.id ?? "",
          isNew: !existing,
          enabled: draft.enabled !== false,
          fromStatuses: statusOptions(source.type, draft.fromStatus),
          toStatuses: statusOptions(source.type, draft.toStatus),
          actions: (draft.actions ?? []).map((action, index) => {
            const targetEntry = state.entries.find(entry => entry.id === action.targetId) ?? sortedEntries[0] ?? null;
            const targetTracker = state.trackers.find(tracker => tracker.id === action.targetId) ?? sortedTrackers[0] ?? null;
            return {
              ...action,
              index,
              isStatus: action.type === "setEntryStatus",
              isActive: action.type === "setEntryActive",
              isVisible: action.type === "setEntryVisible",
              isTracker: action.type === "adjustTracker",
              types: transitionActionTypeOptions(action.type),
              entryTargets: sortedEntries.map(entry => ({
                id: entry.id,
                label: `${entry.title} · ${localize(ENTRY_TYPES[entry.type]?.label ?? entry.type)}`,
                selected: entry.id === action.targetId
              })),
              trackerTargets: sortedTrackers.map(tracker => ({
                id: tracker.id,
                label: tracker.title,
                selected: tracker.id === action.targetId
              })),
              targetStatuses: targetEntry ? statusOptions(targetEntry.type, action.status ?? targetEntry.status) : [],
              values: booleanOptions(Boolean(action.value)),
              delta: action.delta ?? 0,
              targetMissing: action.type === "adjustTracker" ? !targetTracker : !targetEntry
            };
          })
        };
      }

      return {
        kind: "rules",
        entryId: source.id,
        title: source.title,
        typeLabel: localize(ENTRY_TYPES[source.type]?.label ?? source.type),
        rules,
        hasRules: rules.length > 0,
        ruleEditor,
        heading: localize("CAMPAIGN_FORGE.Transitions.Title")
      };
    }

    if (this._editor.kind === "rewards") {
      const source = state.entries.find(entry => entry.id === this._editor.entryId);
      if (!source) return null;

      const rules = (source.rewardRules ?? []).map(rule => {
        const rewards = rule.rewards ?? [];
        const counts = Object.fromEntries(Object.keys(REWARD_STATES).map(stateId => [
          stateId,
          rewards.filter(reward => reward.state === stateId).length
        ]));
        return {
          ...rule,
          entryId: source.id,
          fromLabel: localize(STATUS_LABELS[rule.fromStatus] ?? rule.fromStatus),
          toLabel: localize(STATUS_LABELS[rule.toStatus] ?? rule.toStatus),
          rewardCount: rewards.length,
          counts,
          rewardItems: rewards.map(reward => ({
            ...reward,
            typeLabel: localize(REWARD_TYPES[reward.type]?.label ?? reward.type),
            stateLabel: rewardStateLabel(reward.state),
            previewLabel: rewardPreviewLabel({
              ...reward,
              targetTitle: state.trackers.find(tracker => tracker.id === reward.trackerId)?.title
            }),
            canGrant: ["pending", "failed"].includes(reward.state),
            canSkip: ["pending", "failed"].includes(reward.state),
            canReset: ["granted", "skipped", "failed"].includes(reward.state)
          }))
        };
      });

      let rewardEditor = null;
      if (this._rewardEditor?.entryId === source.id) {
        const existing = this._rewardEditor.ruleId
          ? source.rewardRules.find(rule => rule.id === this._rewardEditor.ruleId)
          : null;
        if (!this._rewardEditor.draft) {
          const statuses = ENTRY_TYPES[source.type].statuses;
          this._rewardEditor.draft = existing ? JSON.parse(JSON.stringify(existing)) : {
            enabled: true,
            fromStatus: statuses[0],
            toStatus: statuses[1] ?? statuses[0],
            rewards: []
          };
        }
        const draft = this._rewardEditor.draft;
        const actors = [...(game.actors?.contents ?? game.actors ?? [])]
          .filter(actor => actor?.documentName === "Actor" && actor.type === "character")
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const trackers = [...state.trackers].sort((a, b) => String(a.title).localeCompare(String(b.title)));

        rewardEditor = {
          id: existing?.id ?? "",
          isNew: !existing,
          enabled: draft.enabled !== false,
          fromStatuses: statusOptions(source.type, draft.fromStatus),
          toStatuses: statusOptions(source.type, draft.toStatus),
          rewards: await Promise.all((draft.rewards ?? []).map(async (reward, index) => {
            const liveItem = await resolveItem(reward.itemUuid);
            const actorTargets = actors.map(actor => ({
              id: actor.uuid,
              label: actor.name,
              selected: actor.uuid === reward.actorUuid
            }));
            if (reward.actorUuid && !actorTargets.some(option => option.id === reward.actorUuid)) {
              actorTargets.unshift({
                id: reward.actorUuid,
                label: format("CAMPAIGN_FORGE.Rewards.MissingActor", { uuid: reward.actorUuid }),
                selected: true
              });
            }
            return {
              ...reward,
              index,
              isXp: reward.type === "xp",
              isCurrency: reward.type === "currency",
              isItem: reward.type === "item",
              isTracker: reward.type === "tracker",
              types: rewardTypeOptions(reward.type),
              actorTargets,
              trackerTargets: trackers.map(tracker => ({
                id: tracker.id,
                label: tracker.title,
                selected: tracker.id === reward.trackerId
              })),
              amount: reward.amount ?? 100,
              coins: {
                pp: reward.coins?.pp ?? 0,
                gp: reward.coins?.gp ?? 0,
                sp: reward.coins?.sp ?? 0,
                cp: reward.coins?.cp ?? 0
              },
              itemUuid: reward.itemUuid ?? "",
              itemName: liveItem?.name ?? reward.itemName ?? "",
              quantity: reward.quantity ?? 1,
              delta: reward.delta ?? 1,
              state: reward.state ?? "locked",
              stateLabel: rewardStateLabel(reward.state ?? "locked")
            };
          }))
        };
      }

      return {
        kind: "rewards",
        entryId: source.id,
        title: source.title,
        typeLabel: localize(ENTRY_TYPES[source.type]?.label ?? source.type),
        rules,
        hasRules: rules.length > 0,
        rewardEditor,
        heading: localize("CAMPAIGN_FORGE.Rewards.Title")
      };
    }

    if (this._editor.kind === "tracker") {
      const source = this._editor.id
        ? state.trackers.find(t => t.id === this._editor.id)
        : null;
      return {
        kind: "tracker",
        id: source?.id ?? "",
        isNew: !source,
        title: source?.title ?? "",
        description: source?.description ?? "",
        value: source?.value ?? 0,
        min: source?.min ?? "",
        max: source?.max ?? "",
        heading: localize(source ? "CAMPAIGN_FORGE.Editor.EditTracker" : "CAMPAIGN_FORGE.Editor.NewTracker")
      };
    }

    if (this._editor.kind === "keyPlayer") {
      const source = this._editor.id
        ? state.keyPlayers.find(keyPlayer => keyPlayer.id === this._editor.id)
        : null;
      if (!source) return null;
      return {
        kind: "keyPlayer",
        id: source.id,
        actorName: source.actorName || source.actorUuid,
        actorImg: source.actorImg || "icons/svg/mystery-man.svg",
        actorUuid: source.actorUuid,
        role: source.role,
        state: source.state,
        note: source.note ?? "",
        roles: keyPlayerRoleOptions(source.role),
        states: keyPlayerStateOptions(source.state),
        trackers: [
          { id: "", label: localize("CAMPAIGN_FORGE.KeyPlayers.NoRelationshipTracker"), selected: !source.relationshipTrackerId },
          ...[...state.trackers]
            .sort((a, b) => a.sort - b.sort)
            .map(tracker => ({
              id: tracker.id,
              label: tracker.title,
              selected: tracker.id === source.relationshipTrackerId
            }))
        ],
        entries: [...state.entries]
          .sort((a, b) => String(a.title).localeCompare(String(b.title)))
          .map(entry => ({
            id: entry.id,
            label: `${entry.title} · ${localize(ENTRY_TYPES[entry.type]?.label ?? entry.type)}`,
            selected: source.entryLinks.includes(entry.id)
          })),
        heading: localize("CAMPAIGN_FORGE.Editor.EditKeyPlayer")
      };
    }

    if (this._editor.kind === "sessionChange") {
      const activeSession = state.sessions.find(session => session.status === "active") ?? null;
      const source = this._editor.id && activeSession
        ? activeSession.changes.find(change => change.id === this._editor.id && change.action === "session.manual")
        : null;
      const changeKind = source?.details?.kind ?? "note";
      return {
        kind: "sessionChange",
        id: source?.id ?? "",
        isNew: !source,
        title: source?.targetTitle ?? "",
        description: source?.details?.description ?? "",
        changeKind,
        changeKinds: sessionChangeKindOptions(changeKind),
        heading: localize(source ? "CAMPAIGN_FORGE.Editor.EditSessionChange" : "CAMPAIGN_FORGE.Editor.NewSessionChange")
      };
    }

    return null;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    if (!root) return;

    root.querySelectorAll(".cf-entry-status").forEach(select => {
      select.addEventListener("change", async event => {
        const entryId = event.currentTarget.dataset.entryId;
        const status = event.currentTarget.value;
        try {
          await this._requestStatusChange(entryId, status);
          await this.render();
        } catch (error) {
          this._handleError(error);
          await this.render();
        }
      });
    });

    const typeSelect = root.querySelector('.cf-editor-form select[name="type"]');
    if (typeSelect) {
      typeSelect.addEventListener("change", event => {
        const statusSelect = root.querySelector('.cf-editor-form select[name="status"]');
        if (!statusSelect) return;
        const statuses = ENTRY_TYPES[event.currentTarget.value]?.statuses ?? [];
        const current = statusSelect.value;
        statusSelect.replaceChildren(...statuses.map(id => {
          const option = document.createElement("option");
          option.value = id;
          option.textContent = localize(STATUS_LABELS[id] ?? id);
          option.selected = id === current;
          return option;
        }));
        if (!statuses.includes(current) && statuses.length) statusSelect.value = statuses[0];
      });
    }

    const ruleTriggerFrom = root.querySelector('[data-cf-rule-field="fromStatus"]');
    if (ruleTriggerFrom) ruleTriggerFrom.addEventListener("change", event => {
      if (this._ruleEditor?.draft) this._ruleEditor.draft.fromStatus = event.currentTarget.value;
    });
    const ruleTriggerTo = root.querySelector('[data-cf-rule-field="toStatus"]');
    if (ruleTriggerTo) ruleTriggerTo.addEventListener("change", event => {
      if (this._ruleEditor?.draft) this._ruleEditor.draft.toStatus = event.currentTarget.value;
    });
    const ruleEnabled = root.querySelector('[data-cf-rule-field="enabled"]');
    if (ruleEnabled) ruleEnabled.addEventListener("change", event => {
      if (this._ruleEditor?.draft) this._ruleEditor.draft.enabled = Boolean(event.currentTarget.checked);
    });

    root.querySelectorAll("[data-cf-rule-action-type]").forEach(select => {
      select.addEventListener("change", async event => {
        const index = Number(event.currentTarget.dataset.cfRuleActionType);
        const draftAction = this._ruleEditor?.draft?.actions?.[index];
        if (!draftAction) return;
        const state = await this.engine.getState();
        const type = event.currentTarget.value;
        draftAction.type = type;
        if (type === "adjustTracker") {
          const tracker = state.trackers[0];
          draftAction.targetId = tracker?.id ?? "";
          draftAction.delta = Number.isFinite(Number(draftAction.delta)) ? Number(draftAction.delta) : 1;
          delete draftAction.status;
          delete draftAction.value;
        } else {
          const entry = state.entries[0];
          draftAction.targetId = entry?.id ?? "";
          if (type === "setEntryStatus") {
            draftAction.status = entry?.status ?? "";
            delete draftAction.value;
          } else {
            draftAction.value = true;
            delete draftAction.status;
          }
          delete draftAction.delta;
        }
        await this.render();
      });
    });

    root.querySelectorAll("[data-cf-rule-action-target]").forEach(select => {
      select.addEventListener("change", async event => {
        const index = Number(event.currentTarget.dataset.cfRuleActionTarget);
        const draftAction = this._ruleEditor?.draft?.actions?.[index];
        if (!draftAction) return;
        draftAction.targetId = event.currentTarget.value;
        if (draftAction.type === "setEntryStatus") {
          const state = await this.engine.getState();
          const entry = state.entries.find(candidate => candidate.id === draftAction.targetId);
          draftAction.status = entry?.status ?? ENTRY_TYPES[entry?.type]?.statuses?.[0] ?? "";
        }
        await this.render();
      });
    });

    root.querySelectorAll("[data-cf-rule-action-status]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfRuleActionStatus);
        const draftAction = this._ruleEditor?.draft?.actions?.[index];
        if (draftAction) draftAction.status = event.currentTarget.value;
      });
    });
    root.querySelectorAll("[data-cf-rule-action-value]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfRuleActionValue);
        const draftAction = this._ruleEditor?.draft?.actions?.[index];
        if (draftAction) draftAction.value = event.currentTarget.value === "true";
      });
    });
    root.querySelectorAll("[data-cf-rule-action-delta]").forEach(input => {
      input.addEventListener("input", event => {
        const index = Number(event.currentTarget.dataset.cfRuleActionDelta);
        const draftAction = this._ruleEditor?.draft?.actions?.[index];
        if (draftAction) draftAction.delta = Number(event.currentTarget.value);
      });
    });

    const rewardTriggerFrom = root.querySelector('[data-cf-reward-field="fromStatus"]');
    if (rewardTriggerFrom) rewardTriggerFrom.addEventListener("change", event => {
      if (this._rewardEditor?.draft) this._rewardEditor.draft.fromStatus = event.currentTarget.value;
    });
    const rewardTriggerTo = root.querySelector('[data-cf-reward-field="toStatus"]');
    if (rewardTriggerTo) rewardTriggerTo.addEventListener("change", event => {
      if (this._rewardEditor?.draft) this._rewardEditor.draft.toStatus = event.currentTarget.value;
    });
    const rewardEnabled = root.querySelector('[data-cf-reward-field="enabled"]');
    if (rewardEnabled) rewardEnabled.addEventListener("change", event => {
      if (this._rewardEditor?.draft) this._rewardEditor.draft.enabled = Boolean(event.currentTarget.checked);
    });

    root.querySelectorAll("[data-cf-reward-type]").forEach(select => {
      select.addEventListener("change", async event => {
        const index = Number(event.currentTarget.dataset.cfRewardType);
        const reward = this._rewardEditor?.draft?.rewards?.[index];
        if (!reward) return;
        reward.type = event.currentTarget.value;
        const state = await this.engine.getState();
        const actors = [...(game.actors?.contents ?? game.actors ?? [])].filter(actor => actor?.type === "character");
        if (["xp", "currency", "item"].includes(reward.type)) reward.actorUuid ||= actors[0]?.uuid ?? "";
        if (reward.type === "xp") reward.amount = Number(reward.amount || 100);
        if (reward.type === "currency") reward.coins ??= { pp: 0, gp: 0, sp: 0, cp: 0 };
        if (reward.type === "item") reward.quantity = Math.max(1, Number(reward.quantity || 1));
        if (reward.type === "tracker") {
          reward.trackerId ||= state.trackers[0]?.id ?? "";
          reward.delta = Number(reward.delta || 1);
        }
        await this.render();
      });
    });

    root.querySelectorAll("[data-cf-reward-actor]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfRewardActor);
        const reward = this._rewardEditor?.draft?.rewards?.[index];
        if (reward) reward.actorUuid = event.currentTarget.value;
      });
    });
    root.querySelectorAll("[data-cf-reward-amount]").forEach(input => {
      input.addEventListener("input", event => {
        const index = Number(event.currentTarget.dataset.cfRewardAmount);
        const reward = this._rewardEditor?.draft?.rewards?.[index];
        if (reward) reward.amount = Number(event.currentTarget.value);
      });
    });
    root.querySelectorAll("[data-cf-reward-coin]").forEach(input => {
      input.addEventListener("input", event => {
        const index = Number(event.currentTarget.dataset.cfRewardIndex);
        const denom = event.currentTarget.dataset.cfRewardCoin;
        const reward = this._rewardEditor?.draft?.rewards?.[index];
        if (!reward) return;
        reward.coins ??= { pp: 0, gp: 0, sp: 0, cp: 0 };
        reward.coins[denom] = Number(event.currentTarget.value);
      });
    });
    root.querySelectorAll("[data-cf-reward-tracker]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfRewardTracker);
        const reward = this._rewardEditor?.draft?.rewards?.[index];
        if (reward) reward.trackerId = event.currentTarget.value;
      });
    });
    root.querySelectorAll("[data-cf-reward-delta]").forEach(input => {
      input.addEventListener("input", event => {
        const index = Number(event.currentTarget.dataset.cfRewardDelta);
        const reward = this._rewardEditor?.draft?.rewards?.[index];
        if (reward) reward.delta = Number(event.currentTarget.value);
      });
    });
    root.querySelectorAll("[data-cf-reward-quantity]").forEach(input => {
      input.addEventListener("input", event => {
        const index = Number(event.currentTarget.dataset.cfRewardQuantity);
        const reward = this._rewardEditor?.draft?.rewards?.[index];
        if (reward) reward.quantity = Number(event.currentTarget.value);
      });
    });
    root.querySelectorAll("[data-cf-reward-item-drop]").forEach(dropZone => {
      dropZone.addEventListener("dragover", event => {
        event.preventDefault();
        dropZone.classList.add("cf-drop-target");
      });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("cf-drop-target"));
      dropZone.addEventListener("drop", event => this._onRewardItemDrop(event, dropZone));
    });

    root.querySelectorAll("[data-cf-journal-link-role]").forEach(select => {
      select.addEventListener("change", async event => {
        if (this._editor?.kind !== "entry" || !this._editor.id) return;
        try {
          await this.engine.updateJournalLink(this._editor.id, event.currentTarget.dataset.cfJournalLinkRole, {
            role: event.currentTarget.value
          });
          await this.render();
        } catch (error) {
          this._handleError(error);
        }
      });
    });

    root.querySelectorAll("[data-cf-journal-link-drop]").forEach(dropZone => {
      dropZone.addEventListener("dragover", event => {
        event.preventDefault();
        dropZone.classList.add("cf-drop-target");
      });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("cf-drop-target"));
      dropZone.addEventListener("drop", event => this._onJournalLinkDrop(event, dropZone));
    });

    root.querySelectorAll("[data-cf-draggable]").forEach(row => {
      row.draggable = true;
      row.addEventListener("dragstart", event => this._onDragStart(event, row));
      row.addEventListener("dragover", event => {
        event.preventDefault();
        row.classList.add("cf-drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("cf-drop-target"));
      row.addEventListener("drop", event => this._onDrop(event, row));
      row.addEventListener("dragend", () => {
        root.querySelectorAll(".cf-drop-target").forEach(el => el.classList.remove("cf-drop-target"));
      });
    });

    const rootDrop = root.querySelector("[data-cf-root-drop]");
    if (rootDrop) {
      rootDrop.addEventListener("dragover", event => {
        event.preventDefault();
        rootDrop.classList.add("cf-drop-target");
      });
      rootDrop.addEventListener("dragleave", () => rootDrop.classList.remove("cf-drop-target"));
      rootDrop.addEventListener("drop", event => this._onDropToRoot(event, rootDrop));
    }

    root.querySelectorAll("[data-cf-keyplayer-drop]").forEach(dropZone => {
      dropZone.addEventListener("dragover", event => {
        event.preventDefault();
        dropZone.classList.add("cf-drop-target");
      });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("cf-drop-target"));
      dropZone.addEventListener("drop", event => this._onKeyPlayerDrop(event, dropZone));
    });

    if (this._focusKey) {
      const focusKey = this._focusKey;
      this._focusKey = null;
      const focusElement = [...root.querySelectorAll("[data-cf-focus-key]")]
        .find(element => element.dataset.cfFocusKey === focusKey);
      if (focusElement) {
        focusElement.scrollIntoView({ block: "center", behavior: "smooth" });
        focusElement.classList.add("cf-focus-flash");
        globalThis.setTimeout?.(() => focusElement.classList.remove("cf-focus-flash"), 1400);
      }
    }

    root.querySelectorAll("[data-cf-setting]").forEach(input => {
      input.addEventListener("change", async event => {
        const key = event.currentTarget.dataset.cfSetting;
        await game.settings.set(MODULE_ID, key, Boolean(event.currentTarget.checked));
        if (key === SETTINGS.SHOW_JOURNAL_BUTTON) {
          ui.sidebar?.tabs?.journal?.render?.({ force: true });
        }
        await this.render();
      });
    });
  }

  _onDragStart(event, row) {
    const payload = {
      nodeType: row.dataset.nodeType,
      nodeId: row.dataset.nodeId
    };
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("application/x-campaign-forge-node", JSON.stringify(payload));
    if (payload.nodeType === "entry") {
      const syntax = campaignEntryEmbedSyntax(payload.nodeId, "card");
      event.dataTransfer.setData(EMBED_MIME, JSON.stringify({ entryId: payload.nodeId, mode: "card" }));
      event.dataTransfer.setData("text/plain", syntax);
      event.dataTransfer.setData("text/html", `<p>${syntax}</p>`);
    } else {
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    }
  }

  async _onDrop(event, targetRow) {
    event.preventDefault();
    targetRow.classList.remove("cf-drop-target");
    const payload = this._readDragPayload(event);
    if (!payload) return;

    try {
      const targetType = targetRow.dataset.nodeType;
      const targetId = targetRow.dataset.nodeId;

      if (payload.nodeType === "entry" && targetType === "group") {
        await this.engine.moveNode({
          nodeType: "entry",
          nodeId: payload.nodeId,
          parentId: targetId
        });
      } else {
        const state = await this.engine.getState();
        const target = targetType === "entry"
          ? state.entries.find(e => e.id === targetId)
          : state.groups.find(g => g.id === targetId);
        if (!target) return;
        await this.engine.moveNode({
          nodeType: payload.nodeType,
          nodeId: payload.nodeId,
          parentId: target.parentId ?? null,
          beforeType: targetType,
          beforeId: targetId
        });
      }
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  async _onDropToRoot(event, rootDrop) {
    event.preventDefault();
    rootDrop.classList.remove("cf-drop-target");
    const payload = this._readDragPayload(event);
    if (!payload) return;
    try {
      await this.engine.moveNode({
        nodeType: payload.nodeType,
        nodeId: payload.nodeId,
        parentId: null
      });
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  async _onKeyPlayerDrop(event, dropZone) {
    event.preventDefault();
    dropZone.classList.remove("cf-drop-target");
    const dragData = this._readFoundryDragData(event);
    if (!dragData) {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.KeyPlayers.DropActorOnly"));
      return;
    }

    const uuid = dragData.uuid
      || (dragData.type === "Actor" && dragData.id ? `Actor.${dragData.id}` : null);
    if (!uuid) {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.KeyPlayers.DropActorOnly"));
      return;
    }

    const actor = await resolveActor(uuid);
    if (!actor) {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.Errors.ACTOR_NOT_FOUND"));
      return;
    }

    try {
      const keyPlayer = await this.engine.createKeyPlayer({
        actorUuid: actor.uuid,
        actorName: actor.name ?? "",
        actorImg: actor.img ?? ""
      });
      this._activeTab = "keyPlayers";
      this._editor = { kind: "keyPlayer", id: keyPlayer.id };
      this._focusKey = `keyPlayer:${keyPlayer.id}`;
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  async _onJournalLinkDrop(event, dropZone) {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove("cf-drop-target");
    if (this._editor?.kind !== "entry" || !this._editor.id) return;
    const dragData = this._readFoundryDragData(event);
    const uuid = dragData?.uuid
      || (dragData?.type === "JournalEntry" && dragData?.id ? `JournalEntry.${dragData.id}` : null)
      || (dragData?.type === "JournalEntryPage" && dragData?.id && dragData?.parentId
        ? `JournalEntry.${dragData.parentId}.JournalEntryPage.${dragData.id}`
        : null);
    if (!uuid) {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.JournalLinks.DropOnly"));
      return;
    }
    const target = await resolveJournalTarget(uuid);
    if (!target) {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.JournalLinks.DropOnly"));
      return;
    }
    try {
      await this.engine.addJournalLink(this._editor.id, {
        uuid: target.uuid,
        label: target.name ?? "",
        role: "details"
      });
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  async _onRewardItemDrop(event, dropZone) {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove("cf-drop-target");
    const index = Number(dropZone.dataset.cfRewardItemDrop);
    const reward = this._rewardEditor?.draft?.rewards?.[index];
    if (!reward) return;
    const dragData = this._readFoundryDragData(event);
    const uuid = dragData?.uuid || (dragData?.type === "Item" && dragData?.id ? `Item.${dragData.id}` : null);
    if (!uuid) {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.Rewards.DropItemOnly"));
      return;
    }
    let item = null;
    try {
      item = await globalThis.fromUuid?.(uuid);
    } catch {
      item = null;
    }
    if (!item || item.documentName !== "Item") {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.Rewards.DropItemOnly"));
      return;
    }
    reward.itemUuid = item.uuid;
    reward.itemName = item.name ?? "";
    await this.render();
  }

  _readFoundryDragData(event) {
    const dragReaders = [
      globalThis.TextEditor?.getDragEventData,
      globalThis.TextEditor?.implementation?.getDragEventData,
      foundry.applications?.ux?.TextEditor?.getDragEventData,
      foundry.applications?.ux?.TextEditor?.implementation?.getDragEventData
    ].filter(reader => typeof reader === "function");

    for (const reader of dragReaders) {
      try {
        const data = reader.call(globalThis.TextEditor, event);
        if (data && typeof data === "object") return data;
      } catch {
        // Try the next reader or the raw dataTransfer payload.
      }
    }

    for (const type of ["application/json", "text/plain"]) {
      const raw = event.dataTransfer?.getData(type);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (data && typeof data === "object") return data;
      } catch {
        // Try the next transfer format.
      }
    }
    return null;
  }

  _readDragPayload(event) {
    const raw = event.dataTransfer.getData("application/x-campaign-forge-node")
      || event.dataTransfer.getData("text/plain");
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw);
      if (!["entry", "group"].includes(payload.nodeType) || !payload.nodeId) return null;
      return payload;
    } catch {
      return null;
    }
  }

  async focusTarget(targetType, targetId) {
    if (targetType !== "entry") return;
    try {
      const state = await this.engine.getState();
      const entry = state.entries.find(candidate => candidate.id === targetId);
      if (!entry) return;
      const collapsed = new Set(game.settings.get(MODULE_ID, SETTINGS.COLLAPSED_GROUPS) ?? []);
      let currentId = entry.parentId;
      const seen = new Set();
      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        collapsed.delete(currentId);
        currentId = state.groups.find(group => group.id === currentId)?.parentId ?? null;
      }
      await game.settings.set(MODULE_ID, SETTINGS.COLLAPSED_GROUPS, [...collapsed]);
      this._activeTab = "campaign";
      this._focusKey = `entry:${targetId}`;
      this._editor = { kind: "entry", id: targetId };
      await this.render({ force: true });
    } catch (error) {
      this._handleError(error);
    }
  }

  _handleError(error) {
    console.error(`${MODULE_ID} |`, error);
    if (error instanceof CampaignEngineError) {
      const key = `CAMPAIGN_FORGE.Errors.${error.code}`;
      const translated = localize(key);
      ui.notifications.error(translated === key ? error.code : translated);
      return;
    }
    ui.notifications.error(localize("CAMPAIGN_FORGE.Errors.Generic"));
  }

  async _confirm(key, data = {}) {
    return DialogV2.confirm({
      window: { title: localize("CAMPAIGN_FORGE.Confirm.Title") },
      content: `<p>${escapeHTML(format(key, data))}</p>`,
      modal: true,
      rejectClose: false
    });
  }

  async _requestStatusChange(entryId, status) {
    const plan = await this.engine.previewEntryStatusTransition(entryId, status);
    if (!plan.actions.length) return false;
    if (plan.blocked) throw new CampaignEngineError("TRANSITION_CYCLE");

    if (plan.consequences.length || plan.rewardOffers?.length) {
      const consequenceItems = plan.consequences
        .map(action => `<li>${escapeHTML(transitionPlanActionLabel(action))}</li>`)
        .join("");
      const rewardItems = (plan.rewardOffers ?? [])
        .map(reward => `<li><i class="fa-solid fa-gift"></i> ${escapeHTML(rewardPreviewLabel(reward))}</li>`)
        .join("");
      const content = `
        <div class="cf-transition-preview-dialog">
          <p>${escapeHTML(format("CAMPAIGN_FORGE.Transitions.PreviewIntro", { title: plan.root.title }))}</p>
          ${consequenceItems ? `<h4>${escapeHTML(localize("CAMPAIGN_FORGE.Transitions.Consequences"))}</h4><ul>${consequenceItems}</ul>` : ""}
          ${rewardItems ? `<h4>${escapeHTML(localize("CAMPAIGN_FORGE.Rewards.DueRewards"))}</h4><ul>${rewardItems}</ul>` : ""}
          <p class="hint">${escapeHTML(localize("CAMPAIGN_FORGE.Transitions.PreviewHint"))}</p>
        </div>`;
      const confirmed = await DialogV2.confirm({
        window: { title: localize("CAMPAIGN_FORGE.Transitions.ConfirmTitle") },
        content,
        modal: true,
        rejectClose: false
      });
      if (!confirmed) return false;
    }

    let rewardMode = "defer";
    if (plan.rewardOffers?.length) {
      const grantNow = await DialogV2.confirm({
        window: { title: localize("CAMPAIGN_FORGE.Rewards.GrantConfirmTitle") },
        content: `<p>${escapeHTML(localize("CAMPAIGN_FORGE.Rewards.GrantConfirmText"))}</p>`,
        modal: true,
        rejectClose: false
      });
      rewardMode = grantNow ? "grant" : "defer";
    }

    await this.engine.setEntryStatus(entryId, status, { source: "manual", rewardMode });
    return true;
  }

  static _actionSetTab(event, target) {
    this._activeTab = target.dataset.tab;
    this._editor = null;
    this._ruleEditor = null;
    this._rewardEditor = null;
    return this.render();
  }

  static _actionCreateChapter() {
    this._editor = { kind: "group", groupKind: "chapter", parentId: null };
    this._activeTab = "campaign";
    return this.render();
  }

  static _actionCreateGroup(event, target) {
    this._editor = { kind: "group", groupKind: "group", parentId: target.dataset.parentId || null };
    this._activeTab = "campaign";
    return this.render();
  }

  static _actionCreateEntry(event, target) {
    this._editor = { kind: "entry", parentId: target.dataset.parentId || null };
    this._activeTab = "campaign";
    return this.render();
  }

  static _actionEditGroup(event, target) {
    this._editor = { kind: "group", id: target.dataset.nodeId };
    this._activeTab = "campaign";
    return this.render();
  }

  static _actionEditEntry(event, target) {
    this._editor = { kind: "entry", id: target.dataset.nodeId };
    this._activeTab = "campaign";
    return this.render();
  }

  static _actionManageRules(event, target) {
    this._editor = { kind: "rules", entryId: target.dataset.nodeId };
    this._ruleEditor = null;
    this._rewardEditor = null;
    this._activeTab = "campaign";
    return this.render();
  }

  static _actionManageRewards(event, target) {
    this._editor = { kind: "rewards", entryId: target.dataset.nodeId };
    this._rewardEditor = null;
    this._activeTab = "campaign";
    return this.render();
  }

  static _actionAddRewardRule() {
    if (this._editor?.kind !== "rewards") return;
    this._rewardEditor = { entryId: this._editor.entryId, ruleId: null, draft: null };
    return this.render();
  }

  static _actionEditRewardRule(event, target) {
    if (this._editor?.kind !== "rewards") return;
    this._rewardEditor = { entryId: this._editor.entryId, ruleId: target.dataset.ruleId, draft: null };
    return this.render();
  }

  static async _actionDeleteRewardRule(event, target) {
    if (this._editor?.kind !== "rewards") return;
    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.DeleteRewardRule");
    if (!confirmed) return;
    try {
      await this.engine.deleteRewardRule(this._editor.entryId, target.dataset.ruleId);
      if (this._rewardEditor?.ruleId === target.dataset.ruleId) this._rewardEditor = null;
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static _actionCancelRewardRule() {
    this._rewardEditor = null;
    return this.render();
  }

  static async _actionSaveRewardRule() {
    if (this._editor?.kind !== "rewards" || !this._rewardEditor?.draft) return;
    const draft = this._rewardEditor.draft;
    try {
      const payload = {
        enabled: draft.enabled !== false,
        fromStatus: draft.fromStatus,
        toStatus: draft.toStatus,
        rewards: draft.rewards ?? []
      };
      if (this._rewardEditor.ruleId) {
        await this.engine.updateRewardRule(this._editor.entryId, this._rewardEditor.ruleId, payload);
      } else {
        await this.engine.createRewardRule(this._editor.entryId, payload);
      }
      this._rewardEditor = null;
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionAddRewardItem() {
    if (this._editor?.kind !== "rewards" || !this._rewardEditor?.draft) return;
    const actors = [...(game.actors?.contents ?? game.actors ?? [])].filter(actor => actor?.type === "character");
    this._rewardEditor.draft.rewards ??= [];
    this._rewardEditor.draft.rewards.push({
      id: `draft-reward-${Date.now()}-${this._rewardEditor.draft.rewards.length}`,
      type: "xp",
      state: "locked",
      actorUuid: actors[0]?.uuid ?? "",
      amount: 100,
      coins: { pp: 0, gp: 0, sp: 0, cp: 0 },
      itemUuid: "",
      itemName: "",
      quantity: 1,
      trackerId: "",
      delta: 1
    });
    return this.render();
  }

  static _actionRemoveRewardItem(event, target) {
    if (!this._rewardEditor?.draft?.rewards) return;
    const index = Number(target.dataset.rewardIndex);
    if (!Number.isInteger(index) || index < 0 || index >= this._rewardEditor.draft.rewards.length) return;
    this._rewardEditor.draft.rewards.splice(index, 1);
    return this.render();
  }

  static async _actionGrantReward(event, target) {
    try {
      await this.engine.grantReward(target.dataset.entryId, target.dataset.ruleId, target.dataset.rewardId);
      await this.render();
    } catch (error) {
      this._handleError(error);
      await this.render();
    }
  }

  static async _actionSkipReward(event, target) {
    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.SkipReward");
    if (!confirmed) return;
    try {
      await this.engine.skipReward(target.dataset.entryId, target.dataset.ruleId, target.dataset.rewardId);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionResetReward(event, target) {
    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.ResetReward");
    if (!confirmed) return;
    try {
      await this.engine.resetReward(target.dataset.entryId, target.dataset.ruleId, target.dataset.rewardId);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static _actionAddTransitionRule() {
    if (this._editor?.kind !== "rules") return;
    this._ruleEditor = { entryId: this._editor.entryId, ruleId: null, draft: null };
    return this.render();
  }

  static async _actionEditTransitionRule(event, target) {
    if (this._editor?.kind !== "rules") return;
    this._ruleEditor = {
      entryId: this._editor.entryId,
      ruleId: target.dataset.ruleId,
      draft: null
    };
    return this.render();
  }

  static async _actionDeleteTransitionRule(event, target) {
    if (this._editor?.kind !== "rules") return;
    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.DeleteTransitionRule");
    if (!confirmed) return;
    try {
      await this.engine.deleteTransitionRule(this._editor.entryId, target.dataset.ruleId);
      if (this._ruleEditor?.ruleId === target.dataset.ruleId) this._ruleEditor = null;
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static _actionCancelTransitionRule() {
    this._ruleEditor = null;
    return this.render();
  }

  static async _actionSaveTransitionRule() {
    if (this._editor?.kind !== "rules" || !this._ruleEditor?.draft) return;
    const draft = this._ruleEditor.draft;
    try {
      const payload = {
        enabled: draft.enabled !== false,
        fromStatus: draft.fromStatus,
        toStatus: draft.toStatus,
        actions: draft.actions ?? []
      };
      if (this._ruleEditor.ruleId) {
        await this.engine.updateTransitionRule(this._editor.entryId, this._ruleEditor.ruleId, payload);
      } else {
        await this.engine.createTransitionRule(this._editor.entryId, payload);
      }
      this._ruleEditor = null;
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionAddTransitionAction() {
    if (this._editor?.kind !== "rules" || !this._ruleEditor?.draft) return;
    const state = await this.engine.getState();
    const entry = state.entries.find(candidate => candidate.id !== this._editor.entryId) ?? state.entries[0] ?? null;
    this._ruleEditor.draft.actions ??= [];
    this._ruleEditor.draft.actions.push({
      id: `draft-${Date.now()}-${this._ruleEditor.draft.actions.length}`,
      type: "setEntryStatus",
      targetId: entry?.id ?? "",
      status: entry?.status ?? ""
    });
    return this.render();
  }

  static _actionRemoveTransitionAction(event, target) {
    if (!this._ruleEditor?.draft?.actions) return;
    const index = Number(target.dataset.actionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= this._ruleEditor.draft.actions.length) return;
    this._ruleEditor.draft.actions.splice(index, 1);
    return this.render();
  }

  static _actionCancelEditor() {
    this._editor = null;
    this._ruleEditor = null;
    this._rewardEditor = null;
    return this.render();
  }

  static async _actionSaveEditor(event, target) {
    const form = target.closest(".cf-editor")?.querySelector(".cf-editor-form");
    if (!form || !this._editor) return;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      if (this._editor.kind === "group") {
        const payload = {
          title: data.title,
          description: data.description ?? "",
          kind: data.kind ?? this._editor.groupKind ?? "group",
          parentId: data.parentId || this._editor.parentId || null
        };
        if (this._editor.id) await this.engine.updateGroup(this._editor.id, payload);
        else await this.engine.createGroup(payload);
      } else if (this._editor.kind === "entry") {
        const payload = {
          title: data.title,
          description: data.description ?? "",
          type: data.type,
          status: data.status,
          parentId: data.parentId || this._editor.parentId || null,
          active: form.querySelector('[name="active"]')?.checked ?? false,
          visible: form.querySelector('[name="visible"]')?.checked ?? false
        };
        if (this._editor.id) {
          const currentState = await this.engine.getState();
          const current = currentState.entries.find(entry => entry.id === this._editor.id);
          if (!current) return;
          if (current.type === payload.type) {
            const desiredStatus = payload.status;
            const structuralPayload = { ...payload };
            delete structuralPayload.status;
            await this.engine.updateEntry(this._editor.id, structuralPayload);
            if (current.status !== desiredStatus) await this._requestStatusChange(this._editor.id, desiredStatus);
          } else {
            await this.engine.updateEntry(this._editor.id, payload);
          }
        } else await this.engine.createEntry(payload);
      } else if (this._editor.kind === "tracker") {
        const payload = {
          title: data.title,
          description: data.description ?? "",
          value: data.value,
          min: data.min,
          max: data.max
        };
        if (this._editor.id) await this.engine.updateTracker(this._editor.id, payload);
        else await this.engine.createTracker(payload);
      } else if (this._editor.kind === "keyPlayer") {
        const entryLinks = [...form.querySelectorAll('select[name="entryLinks"] option:checked')]
          .map(option => option.value)
          .filter(Boolean);
        const currentState = await this.engine.getState();
        const current = currentState.keyPlayers.find(keyPlayer => keyPlayer.id === this._editor.id);
        const actor = current ? await resolveActor(current.actorUuid) : null;
        await this.engine.updateKeyPlayer(this._editor.id, {
          role: data.role ?? "neutral",
          state: data.state ?? "active",
          note: data.note ?? "",
          relationshipTrackerId: data.relationshipTrackerId || null,
          entryLinks,
          actorName: actor?.name ?? current?.actorName ?? "",
          actorImg: actor?.img ?? current?.actorImg ?? ""
        });
      } else if (this._editor.kind === "sessionChange") {
        const payload = {
          title: data.title,
          description: data.description ?? "",
          kind: data.changeKind ?? "note"
        };
        if (this._editor.id) await this.engine.updateManualSessionChange(this._editor.id, payload);
        else await this.engine.addManualSessionChange(payload);
      }
      this._editor = null;
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionToggleGroup(event, target) {
    const id = target.dataset.nodeId;
    const collapsed = new Set(game.settings.get(MODULE_ID, SETTINGS.COLLAPSED_GROUPS) ?? []);
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    await game.settings.set(MODULE_ID, SETTINGS.COLLAPSED_GROUPS, [...collapsed]);
    await this.render();
  }

  static async _actionMoveUp(event, target) {
    try {
      await this.engine.moveNodeByOffset(target.dataset.nodeType, target.dataset.nodeId, -1);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionMoveDown(event, target) {
    try {
      await this.engine.moveNodeByOffset(target.dataset.nodeType, target.dataset.nodeId, 1);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionDeleteNode(event, target) {
    const nodeType = target.dataset.nodeType;
    const nodeId = target.dataset.nodeId;
    const state = await this.engine.getState();
    const node = nodeType === "entry"
      ? state.entries.find(e => e.id === nodeId)
      : state.groups.find(g => g.id === nodeId);
    if (!node) return;

    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.Delete", { title: node.title });
    if (!confirmed) return;

    try {
      if (nodeType === "entry") await this.engine.deleteEntry(nodeId);
      else await this.engine.deleteGroup(nodeId);
      this._editor = null;
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionStartSession() {
    try {
      await this.engine.startSession();
      this._activeTab = "sessions";
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static _actionAddSessionChange() {
    this._editor = { kind: "sessionChange" };
    this._activeTab = "sessions";
    return this.render();
  }

  static _actionEditSessionChange(event, target) {
    this._editor = { kind: "sessionChange", id: target.dataset.changeId };
    this._activeTab = "sessions";
    return this.render();
  }

  static async _actionDeleteSessionChange(event, target) {
    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.DeleteSessionChange");
    if (!confirmed) return;
    try {
      await this.engine.deleteManualSessionChange(target.dataset.changeId);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionEndSession() {
    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.EndSession");
    if (!confirmed) return;
    try {
      await this.engine.endSession();
      this._activeTab = "sessions";
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static _actionCreateTracker() {
    this._editor = { kind: "tracker" };
    this._activeTab = "trackers";
    return this.render();
  }

  static _actionEditTracker(event, target) {
    this._editor = { kind: "tracker", id: target.dataset.trackerId };
    this._activeTab = "trackers";
    return this.render();
  }

  static async _actionAdjustTracker(event, target) {
    try {
      await this.engine.adjustTracker(target.dataset.trackerId, Number(target.dataset.delta));
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionMoveTrackerUp(event, target) {
    try {
      await this.engine.moveTrackerByOffset(target.dataset.trackerId, -1);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionMoveTrackerDown(event, target) {
    try {
      await this.engine.moveTrackerByOffset(target.dataset.trackerId, 1);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionDeleteTracker(event, target) {
    const state = await this.engine.getState();
    const tracker = state.trackers.find(t => t.id === target.dataset.trackerId);
    if (!tracker) return;
    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.Delete", { title: tracker.title });
    if (!confirmed) return;
    try {
      await this.engine.deleteTracker(tracker.id);
      this._editor = null;
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static _actionEditKeyPlayer(event, target) {
    this._editor = { kind: "keyPlayer", id: target.dataset.keyPlayerId };
    this._activeTab = "keyPlayers";
    return this.render();
  }

  static async _actionDeleteKeyPlayer(event, target) {
    const state = await this.engine.getState();
    const keyPlayer = state.keyPlayers.find(item => item.id === target.dataset.keyPlayerId);
    if (!keyPlayer) return;
    const title = keyPlayer.actorName || keyPlayer.actorUuid;
    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.Delete", { title });
    if (!confirmed) return;
    try {
      await this.engine.deleteKeyPlayer(keyPlayer.id);
      this._editor = null;
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionMoveKeyPlayerUp(event, target) {
    try {
      await this.engine.moveKeyPlayerByOffset(target.dataset.keyPlayerId, -1);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionMoveKeyPlayerDown(event, target) {
    try {
      await this.engine.moveKeyPlayerByOffset(target.dataset.keyPlayerId, 1);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionMarkKeyPlayerSeen(event, target) {
    try {
      await this.engine.markKeyPlayerSeen(target.dataset.keyPlayerId);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionOpenKeyPlayerActor(event, target) {
    const state = await this.engine.getState();
    const keyPlayer = state.keyPlayers.find(item => item.id === target.dataset.keyPlayerId);
    if (!keyPlayer) return;
    const actor = await resolveActor(keyPlayer.actorUuid);
    if (!actor) {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.Errors.ACTOR_NOT_FOUND"));
      return;
    }
    actor.sheet?.render?.({ force: true });
  }

  static async _actionOpenJournalLink(event, target) {
    const journal = await resolveJournalTarget(target.dataset.uuid);
    if (!journal) {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.Errors.JOURNAL_NOT_FOUND"));
      return;
    }
    journal.sheet?.render?.({ force: true });
  }

  static async _actionOpenPrimaryJournal(event, target) {
    const state = await this.engine.getState();
    const entry = state.entries.find(candidate => candidate.id === target.dataset.entryId);
    const link = entry?.journalLinks?.find(candidate => candidate.primary) ?? entry?.journalLinks?.[0];
    if (!link) return;
    const journal = await resolveJournalTarget(link.uuid);
    if (!journal) {
      ui.notifications.warn(localize("CAMPAIGN_FORGE.Errors.JOURNAL_NOT_FOUND"));
      return;
    }
    journal.sheet?.render?.({ force: true });
  }

  static async _actionRemoveJournalLink(event, target) {
    if (this._editor?.kind !== "entry" || !this._editor.id) return;
    const confirmed = await this._confirm("CAMPAIGN_FORGE.Confirm.DeleteJournalLink");
    if (!confirmed) return;
    try {
      await this.engine.removeJournalLink(this._editor.id, target.dataset.linkId);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionSetJournalPrimary(event, target) {
    if (this._editor?.kind !== "entry" || !this._editor.id) return;
    try {
      await this.engine.updateJournalLink(this._editor.id, target.dataset.linkId, { primary: true });
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionToggleOverviewPin(event, target) {
    try {
      const targetType = target.dataset.targetType;
      const targetId = target.dataset.targetId;
      const pinned = target.dataset.pinned !== "true";
      await this.engine.setOverviewPinned(targetType, targetId, pinned);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionMoveOverviewPinUp(event, target) {
    try {
      await this.engine.moveOverviewPinByOffset(target.dataset.pinId, -1);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionMoveOverviewPinDown(event, target) {
    try {
      await this.engine.moveOverviewPinByOffset(target.dataset.pinId, 1);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionOpenOverviewTarget(event, target) {
    const targetType = target.dataset.targetType;
    const targetId = target.dataset.targetId;
    try {
      if (targetType === "keyPlayer") {
        this._activeTab = "keyPlayers";
        this._focusKey = `keyPlayer:${targetId}`;
        this._editor = null;
        return this.render();
      }

      if (targetType === "tracker") {
        this._activeTab = "trackers";
        this._focusKey = `tracker:${targetId}`;
        this._editor = null;
        return this.render();
      }

      const state = await this.engine.getState();
      const collapsed = new Set(game.settings.get(MODULE_ID, SETTINGS.COLLAPSED_GROUPS) ?? []);
      let currentId = targetType === "group"
        ? targetId
        : state.entries.find(entry => entry.id === targetId)?.parentId;
      const seen = new Set();
      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        collapsed.delete(currentId);
        currentId = state.groups.find(group => group.id === currentId)?.parentId ?? null;
      }
      await game.settings.set(MODULE_ID, SETTINGS.COLLAPSED_GROUPS, [...collapsed]);
      this._activeTab = "campaign";
      this._focusKey = `${targetType}:${targetId}`;
      this._editor = null;
      return this.render();
    } catch (error) {
      this._handleError(error);
    }
  }
}
