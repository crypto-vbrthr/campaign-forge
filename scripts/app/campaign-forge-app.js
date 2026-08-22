import {
  ENTRY_TYPES,
  GROUP_PROGRESS_METRICS,
  JOURNAL_LINK_ROLES,
  KEY_PLAYER_ROLES,
  KEY_PLAYER_STATES,
  MODULE_ID,
  NUMERIC_CONDITION_OPERATORS,
  REWARD_STATES,
  REWARD_TARGET_ALL_PLAYERS,
  REWARD_TYPES,
  SETTINGS,
  SESSION_CHANGE_KINDS,
  STATUS_CONDITION_OPERATORS,
  STATUS_LABELS,
  TRANSITION_ACTION_TYPES,
  TRANSITION_CONDITION_MODES,
  TRANSITION_CONDITION_TYPES,
} from "../core/constants.js";
import { CampaignEngineError } from "../engine/campaign-engine.js";
import { getGroupProgress } from "../data/state.js";
import { campaignEntryEmbedSyntax, EMBED_MIME } from "../integrations/journal-entries.js";
import { getPlayerCharacterActors } from "../integrations/reward-provider.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const CITY_ACTION_OPERATIONS = Object.freeze({
  setDimension: "CAMPAIGN_FORGE.Integrations.City.Actions.setDimension",
  setConditionEnabled: "CAMPAIGN_FORGE.Integrations.City.Actions.setConditionEnabled",
  setThreatActive: "CAMPAIGN_FORGE.Integrations.City.Actions.setThreatActive"
});
const CITY_DIMENSIONS = Object.freeze(["prosperity", "supply", "security", "order", "mood", "health"]);
const CITY_STATE_LEVELS = Object.freeze(["very-poor", "poor", "normal", "good", "very-good"]);

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

function cityOperationOptions(selected = "setDimension") {
  return Object.entries(CITY_ACTION_OPERATIONS).map(([id, labelKey]) => ({
    id,
    label: localize(labelKey),
    selected: id === selected
  }));
}

function cityDimensionOptions(selected = "prosperity") {
  return CITY_DIMENSIONS.map(id => ({
    id,
    label: localize(`CAMPAIGN_FORGE.Integrations.City.Dimensions.${id}`),
    selected: id === selected
  }));
}

function cityStateLevelOptions(selected = "normal") {
  return CITY_STATE_LEVELS.map(id => ({
    id,
    label: localize(`CAMPAIGN_FORGE.Integrations.City.StateLevels.${id}`),
    selected: id === selected
  }));
}

function cityReferenceKindOptions(selected = "settlement") {
  return ["settlement", "district", "location", "faction"].map(id => ({
    id,
    label: localize(`CAMPAIGN_FORGE.Integrations.City.ReferenceKinds.${id}`),
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

function transitionConditionTypeOptions(selected = "entryStatus") {
  return Object.entries(TRANSITION_CONDITION_TYPES).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function transitionConditionModeOptions(selected = "all") {
  return Object.entries(TRANSITION_CONDITION_MODES).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function statusConditionOperatorOptions(selected = "eq") {
  return Object.entries(STATUS_CONDITION_OPERATORS).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function numericConditionOperatorOptions(selected = "gte") {
  return Object.entries(NUMERIC_CONDITION_OPERATORS).map(([id, def]) => ({
    id,
    label: localize(def.label),
    selected: id === selected
  }));
}

function groupProgressMetricOptions(selected = "reached") {
  return Object.entries(GROUP_PROGRESS_METRICS).map(([id, def]) => ({
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

function foundryActors() {
  return [...(game.actors?.contents ?? game.actors ?? [])];
}

function rewardTargetLabel(actorUuid) {
  if (actorUuid === REWARD_TARGET_ALL_PLAYERS) return localize("CAMPAIGN_FORGE.Rewards.AllPlayers");
  const actor = foundryActors().find(candidate => candidate?.uuid === actorUuid);
  if (!actor) return actorUuid ? format("CAMPAIGN_FORGE.Rewards.MissingActor", { uuid: actorUuid }) : "";
  if (actor.type === "party") {
    return actor.name
      ? format("CAMPAIGN_FORGE.Rewards.TeamInventoryNamed", { name: actor.name })
      : localize("CAMPAIGN_FORGE.Rewards.TeamInventory");
  }
  return actor.name ?? actorUuid;
}

function rewardNeedsFullPerPlayerWarning(reward) {
  return reward?.actorUuid === REWARD_TARGET_ALL_PLAYERS
    && ["currency", "item", "lootForge", "itemForge"].includes(reward?.type);
}

function lootForgeConfigSummary(config = {}) {
  const level = config?.level ?? 1;
  const theme = config?.theme ?? "generic";
  const environment = config?.environment ?? "generic";
  return format("CAMPAIGN_FORGE.Rewards.LootForgeConfigSummary", { level, theme, environment });
}

function itemForgeRequestSummary(request = {}, previewName = "") {
  if (previewName) return previewName;
  const mode = request?.mode ?? "—";
  const category = request?.category ?? "—";
  let level = request?.level ?? "—";
  if (level && typeof level === "object") {
    const min = level.min ?? level.target ?? "?";
    const max = level.max ?? level.target ?? min;
    level = min === max ? String(min) : `${min}–${max}`;
  }
  return format("CAMPAIGN_FORGE.Rewards.ItemForgeConfigSummary", { mode, category, level });
}

function lootPreviewSummary(loot = {}) {
  const itemCount = (loot?.pf2eItems?.length ?? 0) + (loot?.generatedItems?.length ?? 0);
  const coins = ["pp", "gp", "sp", "cp"]
    .filter(denom => Number(loot?.coins?.[denom] ?? 0) > 0)
    .map(denom => `${Number(loot.coins[denom])} ${denom.toUpperCase()}`)
    .join(", ");
  return format("CAMPAIGN_FORGE.Rewards.LootForgePreviewSummary", {
    items: itemCount,
    coins: coins || localize("CAMPAIGN_FORGE.Rewards.NoCoins")
  });
}

function itemPreviewSummary(preview = {}) {
  const name = String(preview?.itemSource?.name ?? "").trim();
  const level = preview?.itemSource?.system?.level?.value ?? preview?.metadata?.level ?? "—";
  if (!name) return "";
  return format("CAMPAIGN_FORGE.Rewards.ItemForgePreviewSummary", { name, level });
}

function rewardPreviewLabel(reward) {
  let label = reward.type ?? "";
  if (reward.type === "xp") {
    label = format("CAMPAIGN_FORGE.Rewards.PreviewXP", { amount: reward.amount ?? 0 });
  } else if (reward.type === "currency") {
    const coins = reward.coins ?? {};
    const parts = ["pp", "gp", "sp", "cp"]
      .filter(denom => Number(coins[denom] ?? 0) > 0)
      .map(denom => `${Number(coins[denom])} ${denom.toUpperCase()}`);
    label = format("CAMPAIGN_FORGE.Rewards.PreviewCurrency", { amount: parts.join(", ") });
  } else if (reward.type === "item") {
    label = format("CAMPAIGN_FORGE.Rewards.PreviewItem", {
      quantity: reward.quantity ?? 1,
      item: reward.itemName || reward.itemUuid || localize("CAMPAIGN_FORGE.Rewards.UnknownItem")
    });
  } else if (reward.type === "lootForge") {
    label = format("CAMPAIGN_FORGE.Rewards.PreviewLootForge", {
      summary: lootForgeConfigSummary(reward.lootConfig ?? {})
    });
  } else if (reward.type === "itemForge") {
    label = format("CAMPAIGN_FORGE.Rewards.PreviewItemForge", {
      quantity: reward.quantity ?? 1,
      summary: itemForgeRequestSummary(reward.itemRequest ?? {}, reward.itemPreviewName ?? "")
    });
  } else if (reward.type === "tracker") {
    const delta = Number(reward.delta ?? 0);
    return format("CAMPAIGN_FORGE.Rewards.PreviewTracker", {
      title: reward.targetTitle ?? reward.trackerId ?? "",
      delta: delta >= 0 ? `+${delta}` : String(delta)
    });
  }

  const target = rewardTargetLabel(reward.actorUuid);
  return target ? format("CAMPAIGN_FORGE.Rewards.PreviewWithTarget", { reward: label, target }) : label;
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
    case "entry.externalLink.added":
      return format("CAMPAIGN_FORGE.Changes.ExternalLinkAdded", { title: change.targetTitle });
    case "entry.externalLink.updated":
      return format("CAMPAIGN_FORGE.Changes.ExternalLinkUpdated", { title: change.targetTitle });
    case "entry.externalLink.removed":
      return format("CAMPAIGN_FORGE.Changes.ExternalLinkRemoved", { title: change.targetTitle });
    case "provider.action":
      return format("CAMPAIGN_FORGE.Changes.ProviderAction", {
        provider: localize(`CAMPAIGN_FORGE.Integrations.Providers.${change.details?.provider ?? "cityForge"}`),
        title: change.targetTitle || change.targetId || ""
      });
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
  if (action.kind === "provider.action") {
    const providerLabel = localize(`CAMPAIGN_FORGE.Integrations.Providers.${action.provider ?? "cityForge"}`);
    const operation = action.payload?.operation ? localize(CITY_ACTION_OPERATIONS[action.payload.operation] ?? action.payload.operation) : action.providerAction;
    return format("CAMPAIGN_FORGE.Transitions.PreviewProviderAction", {
      provider: providerLabel,
      operation,
      target: action.targetTitle || action.targetId || ""
    });
  }
  return action.targetTitle || action.kind;
}

function transitionConditionEvaluationLabel(condition) {
  if (condition.type === "entryStatus") {
    return format("CAMPAIGN_FORGE.Transitions.ConditionPreviewStatus", {
      title: condition.targetTitle ?? condition.targetId ?? "",
      actual: localize(STATUS_LABELS[condition.actualStatus] ?? condition.actualStatus ?? ""),
      operator: localize(STATUS_CONDITION_OPERATORS[condition.operator]?.label ?? condition.operator ?? ""),
      expected: localize(STATUS_LABELS[condition.expectedStatus] ?? condition.expectedStatus ?? "")
    });
  }
  if (condition.type === "entryActive" || condition.type === "entryVisible") {
    return format("CAMPAIGN_FORGE.Transitions.ConditionPreviewBoolean", {
      title: condition.targetTitle ?? condition.targetId ?? "",
      field: localize(condition.type === "entryActive" ? "CAMPAIGN_FORGE.Fields.Active" : "CAMPAIGN_FORGE.Fields.Visible"),
      actual: condition.actualValue ? localize("CAMPAIGN_FORGE.Common.Yes") : localize("CAMPAIGN_FORGE.Common.No"),
      expected: condition.expectedValue ? localize("CAMPAIGN_FORGE.Common.Yes") : localize("CAMPAIGN_FORGE.Common.No")
    });
  }
  if (condition.type === "trackerValue") {
    return format("CAMPAIGN_FORGE.Transitions.ConditionPreviewNumeric", {
      title: condition.targetTitle ?? condition.targetId ?? "",
      actual: condition.actualValue ?? 0,
      operator: localize(NUMERIC_CONDITION_OPERATORS[condition.operator]?.label ?? condition.operator ?? ""),
      expected: condition.expectedValue ?? 0
    });
  }
  if (condition.type === "groupProgress") {
    const suffix = condition.metric === "percent" ? "%" : "";
    return format("CAMPAIGN_FORGE.Transitions.ConditionPreviewGroup", {
      title: condition.targetTitle ?? condition.targetId ?? "",
      actual: `${condition.actualValue ?? 0}${suffix}`,
      operator: localize(NUMERIC_CONDITION_OPERATORS[condition.operator]?.label ?? condition.operator ?? ""),
      expected: `${condition.expectedValue ?? 0}${suffix}`,
      reached: condition.progress?.reached ?? 0,
      total: condition.progress?.total ?? 0
    });
  }
  return condition.targetTitle || condition.type || "";
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
      configureLootForgeReward: this._actionConfigureLootForgeReward,
      configureItemForgeReward: this._actionConfigureItemForgeReward,
      addTransitionRule: this._actionAddTransitionRule,
      editTransitionRule: this._actionEditTransitionRule,
      deleteTransitionRule: this._actionDeleteTransitionRule,
      cancelTransitionRule: this._actionCancelTransitionRule,
      saveTransitionRule: this._actionSaveTransitionRule,
      addTransitionCondition: this._actionAddTransitionCondition,
      removeTransitionCondition: this._actionRemoveTransitionCondition,
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
      openPrimaryJournal: this._actionOpenPrimaryJournal,
      addCityExternalLink: this._actionAddCityExternalLink,
      removeExternalLink: this._actionRemoveExternalLink,
      openExternalLink: this._actionOpenExternalLink,
      createKeyPlayerWithNpcForge: this._actionCreateKeyPlayerWithNpcForge,
      openNpcForge: this._actionOpenNpcForge
    }
  };

  static PARTS = {
    main: {
      template: "modules/campaign-forge/templates/campaign-forge.hbs",
      scrollable: [".cf-main-scroll"]
    }
  };

  constructor(engine, { providers = null, ...options } = {}) {
    super({
      ...options,
      window: {
        ...(options.window ?? {}),
        title: localize("CAMPAIGN_FORGE.Title")
      }
    });
    this.engine = engine;
    this.providers = providers;
    this._activeTab = "overview";
    this._editor = null;
    this._ruleEditor = null;
    this._rewardEditor = null;
    this._focusKey = null;
    this._cityLinkDraft = null;
    this._npcEditorSession = null;
    this._npcEditorDialog = null;
    this._lootRewardEditorSession = null;
    this._lootRewardEditorDialog = null;
    this._itemRewardEditorSession = null;
    this._itemRewardEditorDialog = null;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = await this.engine.getState();
    const collapsed = new Set(game.settings.get(MODULE_ID, SETTINGS.COLLAPSED_GROUPS) ?? []);
    const activeSession = state.sessions.find(s => s.status === "active") ?? null;
    const showStructural = game.settings.get(MODULE_ID, SETTINGS.SHOW_STRUCTURAL_CHANGES);
    const pinnedTargets = new Set(state.overviewPins.map(pin => `${pin.targetType}:${pin.targetId}`));
    const integrationStatuses = (this.providers?.listStatus?.() ?? []).map(status => ({
      ...status,
      label: localize(status.labelKey),
      statusLabel: localize(status.ready
        ? "CAMPAIGN_FORGE.Integrations.Status.ready"
        : (status.active
          ? "CAMPAIGN_FORGE.Integrations.Status.apiMissing"
          : (status.installed
            ? "CAMPAIGN_FORGE.Integrations.Status.inactive"
            : "CAMPAIGN_FORGE.Integrations.Status.notInstalled"))),
      capabilityLabels: Object.entries(status.capabilities ?? {})
        .filter(([, enabled]) => enabled)
        .map(([id]) => localize(`CAMPAIGN_FORGE.Integrations.Capabilities.${id}`))
    }));
    const npcForgeStatus = integrationStatuses.find(status => status.id === "npcForge") ?? null;

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
      integrationStatuses,
      npcForgeStatus,
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

      const externalLinks = (source?.externalLinks ?? []).map(link => ({
        ...link,
        providerLabel: localize(`CAMPAIGN_FORGE.Integrations.Providers.${link.provider}`),
        kindLabel: link.provider === "cityForge"
          ? localize(`CAMPAIGN_FORGE.Integrations.City.ReferenceKinds.${link.kind}`)
          : link.kind,
        displayLabel: link.label || link.meta?.settlementName || link.targetId,
        canOpen: link.provider === "cityForge" && Boolean(this.providers?.supports?.("cityForge", "open"))
      }));

      let cityIntegration = { ready: false };
      const cityStatus = this.providers?.inspect?.("cityForge") ?? null;
      if (source && cityStatus?.ready && cityStatus.capabilities?.references) {
        const settlements = await this.providers.listCitySettlements();
        if (!this._cityLinkDraft || this._cityLinkDraft.entryId !== source.id) {
          this._cityLinkDraft = {
            entryId: source.id,
            settlementId: settlements[0]?.id ?? "",
            kind: "settlement",
            subTargetId: null
          };
        }
        if (!settlements.some(settlement => settlement.id === this._cityLinkDraft.settlementId)) {
          this._cityLinkDraft.settlementId = settlements[0]?.id ?? "";
          this._cityLinkDraft.subTargetId = null;
        }
        const selectedSettlement = settlements.find(settlement => settlement.id === this._cityLinkDraft.settlementId) ?? null;
        const cityContext = selectedSettlement
          ? await this.providers.getCityCampaignContext(selectedSettlement.id)
          : null;
        const kind = ["settlement", "district", "location", "faction"].includes(this._cityLinkDraft.kind)
          ? this._cityLinkDraft.kind
          : "settlement";
        this._cityLinkDraft.kind = kind;
        let rawTargets = [];
        if (kind === "settlement" && cityContext?.targets?.settlement) rawTargets = [cityContext.targets.settlement];
        if (kind === "district") rawTargets = cityContext?.targets?.districts ?? [];
        if (kind === "location") rawTargets = cityContext?.targets?.locations ?? [];
        if (kind === "faction") rawTargets = cityContext?.targets?.factions ?? [];
        if (kind === "settlement") this._cityLinkDraft.subTargetId = null;
        else if (!rawTargets.some(target => target.id === this._cityLinkDraft.subTargetId)) {
          this._cityLinkDraft.subTargetId = rawTargets[0]?.id ?? "";
        }
        const selectedTargetId = kind === "settlement" ? selectedSettlement?.id : this._cityLinkDraft.subTargetId;
        cityIntegration = {
          ready: true,
          hasSettlements: settlements.length > 0,
          settlements: settlements.map(settlement => ({
            id: settlement.id,
            label: settlement.definition?.identity?.name ?? settlement.name ?? settlement.id,
            selected: settlement.id === this._cityLinkDraft.settlementId
          })),
          kinds: cityReferenceKindOptions(kind),
          targets: rawTargets.map(target => ({
            id: target.id,
            label: target.name ?? target.label ?? target.id,
            selected: target.id === selectedTargetId
          })),
          selectedKind: kind,
          targetRequired: kind !== "settlement",
          selectedSettlementName: selectedSettlement?.definition?.identity?.name ?? selectedSettlement?.name ?? ""
        };
      }

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
        externalLinks,
        hasExternalLinks: externalLinks.length > 0,
        cityIntegration,
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
        actionCount: (rule.actions ?? []).length,
        conditionCount: (rule.conditions ?? []).length,
        conditionModeLabel: localize(TRANSITION_CONDITION_MODES[rule.conditionMode]?.label ?? TRANSITION_CONDITION_MODES.all.label)
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
            conditionMode: "all",
            conditions: [],
            actions: []
          };
        }
        const draft = this._ruleEditor.draft;
        const sortedEntries = [...state.entries].sort((a, b) => String(a.title).localeCompare(String(b.title)));
        const sortedTrackers = [...state.trackers].sort((a, b) => String(a.title).localeCompare(String(b.title)));
        const sortedGroups = [...state.groups].sort((a, b) => String(a.title).localeCompare(String(b.title)));
        ruleEditor = {
          id: existing?.id ?? "",
          isNew: !existing,
          enabled: draft.enabled !== false,
          fromStatuses: statusOptions(source.type, draft.fromStatus),
          toStatuses: statusOptions(source.type, draft.toStatus),
          conditionModes: transitionConditionModeOptions(draft.conditionMode ?? "all"),
          conditions: (draft.conditions ?? []).map((condition, index) => {
            const targetEntry = state.entries.find(entry => entry.id === condition.targetId) ?? sortedEntries[0] ?? null;
            const targetTracker = state.trackers.find(tracker => tracker.id === condition.targetId) ?? sortedTrackers[0] ?? null;
            const targetGroup = state.groups.find(group => group.id === condition.targetId) ?? sortedGroups[0] ?? null;
            const isEntryStatus = condition.type === "entryStatus";
            const isEntryBoolean = condition.type === "entryActive" || condition.type === "entryVisible";
            const isTracker = condition.type === "trackerValue";
            const isGroup = condition.type === "groupProgress";
            return {
              ...condition,
              index,
              isEntryStatus,
              isEntryBoolean,
              isEntryActive: condition.type === "entryActive",
              isEntryVisible: condition.type === "entryVisible",
              isTracker,
              isGroup,
              types: transitionConditionTypeOptions(condition.type),
              entryTargets: sortedEntries.map(entry => ({
                id: entry.id,
                label: `${entry.title} · ${localize(ENTRY_TYPES[entry.type]?.label ?? entry.type)}`,
                selected: entry.id === condition.targetId
              })),
              trackerTargets: sortedTrackers.map(tracker => ({
                id: tracker.id,
                label: tracker.title,
                selected: tracker.id === condition.targetId
              })),
              groupTargets: sortedGroups.map(group => ({
                id: group.id,
                label: group.title,
                selected: group.id === condition.targetId
              })),
              statusOperators: statusConditionOperatorOptions(condition.operator ?? "eq"),
              numericOperators: numericConditionOperatorOptions(condition.operator ?? "gte"),
              targetStatuses: targetEntry ? statusOptions(targetEntry.type, condition.status ?? targetEntry.status) : [],
              values: booleanOptions(Boolean(condition.value)),
              metrics: groupProgressMetricOptions(condition.metric ?? "reached"),
              targetMissing: isTracker ? !targetTracker : (isGroup ? !targetGroup : !targetEntry),
              progressHint: isGroup && targetGroup ? getGroupProgress(state, targetGroup.id) : null
            };
          }),
          actions: await Promise.all((draft.actions ?? []).map(async (action, index) => {
            const targetEntry = state.entries.find(entry => entry.id === action.targetId) ?? sortedEntries[0] ?? null;
            const targetTracker = state.trackers.find(tracker => tracker.id === action.targetId) ?? sortedTrackers[0] ?? null;
            const isProvider = action.type === "providerAction";
            let city = null;
            if (isProvider) {
              const settlements = this.providers?.supports?.("cityForge", "stateActions")
                ? await this.providers.listCitySettlements()
                : [];
              const selectedSettlement = settlements.find(settlement => settlement.id === action.targetId) ?? settlements[0] ?? null;
              if (selectedSettlement && action.targetId !== selectedSettlement.id) action.targetId = selectedSettlement.id;
              action.provider ||= "cityForge";
              action.action ||= "applyStatePatch";
              action.payload ??= { operation: "setDimension", dimension: "prosperity", value: "normal" };
              const cityContext = selectedSettlement ? await this.providers.getCityCampaignContext(selectedSettlement.id) : null;
              const operation = action.payload.operation ?? "setDimension";
              const conditions = cityContext?.targets?.conditions ?? [];
              const threats = cityContext?.targets?.threats ?? [];
              if (operation === "setConditionEnabled" && !conditions.some(condition => condition.id === action.payload.conditionId)) {
                action.payload.conditionId = conditions[0]?.id ?? "";
              }
              if (operation === "setThreatActive" && !threats.some(threat => threat.id === action.payload.threatId)) {
                action.payload.threatId = threats[0]?.id ?? "";
              }
              city = {
                ready: Boolean(selectedSettlement && this.providers?.supports?.("cityForge", "stateActions")),
                settlements: settlements.map(settlement => ({
                  id: settlement.id,
                  label: settlement.definition?.identity?.name ?? settlement.name ?? settlement.id,
                  selected: settlement.id === action.targetId
                })),
                operations: cityOperationOptions(operation),
                isDimension: operation === "setDimension",
                isCondition: operation === "setConditionEnabled",
                isThreat: operation === "setThreatActive",
                dimensions: cityDimensionOptions(action.payload.dimension ?? "prosperity"),
                stateLevels: cityStateLevelOptions(action.payload.value ?? "normal"),
                conditions: conditions.map(condition => ({
                  id: condition.id,
                  label: condition.label || condition.conditionType || condition.id,
                  selected: condition.id === action.payload.conditionId
                })),
                threats: threats.map(threat => ({
                  id: threat.id,
                  label: threat.name || threat.id,
                  selected: threat.id === action.payload.threatId
                })),
                enabledValues: booleanOptions(action.payload.enabled !== false)
              };
            }
            return {
              ...action,
              index,
              isStatus: action.type === "setEntryStatus",
              isActive: action.type === "setEntryActive",
              isVisible: action.type === "setEntryVisible",
              isTracker: action.type === "adjustTracker",
              isProvider,
              city,
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
              targetMissing: isProvider ? !city?.ready : (action.type === "adjustTracker" ? !targetTracker : !targetEntry)
            };
          }))
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
        const allActors = foundryActors();
        const actors = allActors
          .filter(actor => actor?.documentName === "Actor" && actor.type === "character")
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const partyActors = allActors
          .filter(actor => actor?.documentName === "Actor" && actor.type === "party")
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        const playerCharacterCount = getPlayerCharacterActors().length;
        const trackers = [...state.trackers].sort((a, b) => String(a.title).localeCompare(String(b.title)));

        rewardEditor = {
          id: existing?.id ?? "",
          isNew: !existing,
          enabled: draft.enabled !== false,
          fromStatuses: statusOptions(source.type, draft.fromStatus),
          toStatuses: statusOptions(source.type, draft.toStatus),
          rewards: await Promise.all((draft.rewards ?? []).map(async (reward, index) => {
            const liveItem = await resolveItem(reward.itemUuid);
            const actorTargets = [{
              id: REWARD_TARGET_ALL_PLAYERS,
              label: playerCharacterCount
                ? format("CAMPAIGN_FORGE.Rewards.AllPlayersCount", { count: playerCharacterCount })
                : localize("CAMPAIGN_FORGE.Rewards.AllPlayers"),
              selected: reward.actorUuid === REWARD_TARGET_ALL_PLAYERS
            }];
            if (["currency", "item", "lootForge", "itemForge"].includes(reward.type)) {
              actorTargets.push(...partyActors.map(actor => ({
                id: actor.uuid,
                label: actor.name
                  ? format("CAMPAIGN_FORGE.Rewards.TeamInventoryNamed", { name: actor.name })
                  : localize("CAMPAIGN_FORGE.Rewards.TeamInventory"),
                selected: actor.uuid === reward.actorUuid
              })));
            }
            actorTargets.push(...actors.map(actor => ({
              id: actor.uuid,
              label: actor.name,
              selected: actor.uuid === reward.actorUuid
            })));
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
              isLootForge: reward.type === "lootForge",
              isItemForge: reward.type === "itemForge",
              isTracker: reward.type === "tracker",
              providerAvailable: reward.type === "lootForge"
                ? Boolean(this.providers?.supports?.("lootForge", "embeddedEditor") && this.providers?.supports?.("lootForge", "actorDelivery"))
                : (reward.type === "itemForge" ? Boolean(this.providers?.supports?.("itemForge", "generate") && this.providers?.supports?.("itemForge", "embeddedEditor")) : true),
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
              lootConfig: reward.lootConfig ?? { level: 1, theme: "generic", environment: "generic" },
              itemRequest: reward.itemRequest ?? {},
              itemPreviewName: reward.itemPreviewName ?? "",
              providerConfigSummary: reward.type === "lootForge"
                ? lootForgeConfigSummary(reward.lootConfig ?? {})
                : (reward.type === "itemForge" ? itemForgeRequestSummary(reward.itemRequest ?? {}, reward.itemPreviewName ?? "") : ""),
              providerPreviewSummary: reward.previewSummary?.label ?? "",
              mystifyMagicItems: reward.mystifyMagicItems === true,
              quantity: reward.quantity ?? 1,
              delta: reward.delta ?? 1,
              state: reward.state ?? "locked",
              stateLabel: rewardStateLabel(reward.state ?? "locked"),
              isAllPlayers: reward.actorUuid === REWARD_TARGET_ALL_PLAYERS,
              showFullPerPlayerWarning: rewardNeedsFullPerPlayerWarning(reward)
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
    const ruleConditionMode = root.querySelector('[data-cf-rule-field="conditionMode"]');
    if (ruleConditionMode) ruleConditionMode.addEventListener("change", event => {
      if (this._ruleEditor?.draft) this._ruleEditor.draft.conditionMode = event.currentTarget.value;
    });

    root.querySelectorAll("[data-cf-rule-condition-type]").forEach(select => {
      select.addEventListener("change", async event => {
        const index = Number(event.currentTarget.dataset.cfRuleConditionType);
        const condition = this._ruleEditor?.draft?.conditions?.[index];
        if (!condition) return;
        const state = await this.engine.getState();
        condition.type = event.currentTarget.value;
        if (condition.type === "entryStatus") {
          const entry = state.entries[0] ?? null;
          condition.targetId = entry?.id ?? "";
          condition.operator = "eq";
          condition.status = entry?.status ?? "";
          delete condition.value;
          delete condition.metric;
        } else if (condition.type === "entryActive" || condition.type === "entryVisible") {
          const entry = state.entries[0] ?? null;
          condition.targetId = entry?.id ?? "";
          condition.value = true;
          delete condition.operator;
          delete condition.status;
          delete condition.metric;
        } else if (condition.type === "trackerValue") {
          const tracker = state.trackers[0] ?? null;
          condition.targetId = tracker?.id ?? "";
          condition.operator = "gte";
          condition.value = Number(tracker?.value ?? 0);
          delete condition.status;
          delete condition.metric;
        } else {
          const group = state.groups[0] ?? null;
          condition.targetId = group?.id ?? "";
          condition.operator = "gte";
          condition.metric = "reached";
          condition.value = 1;
          delete condition.status;
        }
        await this.render();
      });
    });

    root.querySelectorAll("[data-cf-rule-condition-target]").forEach(select => {
      select.addEventListener("change", async event => {
        const index = Number(event.currentTarget.dataset.cfRuleConditionTarget);
        const condition = this._ruleEditor?.draft?.conditions?.[index];
        if (!condition) return;
        condition.targetId = event.currentTarget.value;
        if (condition.type === "entryStatus") {
          const state = await this.engine.getState();
          const entry = state.entries.find(candidate => candidate.id === condition.targetId);
          condition.status = entry?.status ?? ENTRY_TYPES[entry?.type]?.statuses?.[0] ?? "";
        }
        await this.render();
      });
    });

    root.querySelectorAll("[data-cf-rule-condition-operator]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfRuleConditionOperator);
        const condition = this._ruleEditor?.draft?.conditions?.[index];
        if (condition) condition.operator = event.currentTarget.value;
      });
    });
    root.querySelectorAll("[data-cf-rule-condition-status]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfRuleConditionStatus);
        const condition = this._ruleEditor?.draft?.conditions?.[index];
        if (condition) condition.status = event.currentTarget.value;
      });
    });
    root.querySelectorAll("[data-cf-rule-condition-boolean]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfRuleConditionBoolean);
        const condition = this._ruleEditor?.draft?.conditions?.[index];
        if (condition) condition.value = event.currentTarget.value === "true";
      });
    });
    root.querySelectorAll("[data-cf-rule-condition-metric]").forEach(select => {
      select.addEventListener("change", async event => {
        const index = Number(event.currentTarget.dataset.cfRuleConditionMetric);
        const condition = this._ruleEditor?.draft?.conditions?.[index];
        if (!condition) return;
        condition.metric = event.currentTarget.value;
        if (condition.metric === "percent" && Number(condition.value) > 100) condition.value = 100;
        await this.render();
      });
    });
    root.querySelectorAll("[data-cf-rule-condition-value]").forEach(input => {
      input.addEventListener("input", event => {
        const index = Number(event.currentTarget.dataset.cfRuleConditionValue);
        const condition = this._ruleEditor?.draft?.conditions?.[index];
        if (condition) condition.value = Number(event.currentTarget.value);
      });
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
          delete draftAction.provider;
          delete draftAction.action;
          delete draftAction.payload;
        } else if (type === "providerAction") {
          const settlements = this.providers?.supports?.("cityForge", "stateActions")
            ? await this.providers.listCitySettlements()
            : [];
          draftAction.provider = "cityForge";
          draftAction.action = "applyStatePatch";
          draftAction.targetId = settlements[0]?.id ?? "";
          draftAction.payload = { operation: "setDimension", dimension: "prosperity", value: "normal" };
          delete draftAction.status;
          delete draftAction.value;
          delete draftAction.delta;
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
          delete draftAction.provider;
          delete draftAction.action;
          delete draftAction.payload;
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

    root.querySelectorAll("[data-cf-provider-settlement]").forEach(select => {
      select.addEventListener("change", async event => {
        const index = Number(event.currentTarget.dataset.cfProviderSettlement);
        const action = this._ruleEditor?.draft?.actions?.[index];
        if (!action) return;
        action.targetId = event.currentTarget.value;
        action.payload ??= { operation: "setDimension", dimension: "prosperity", value: "normal" };
        delete action.payload.conditionId;
        delete action.payload.threatId;
        await this.render();
      });
    });
    root.querySelectorAll("[data-cf-provider-operation]").forEach(select => {
      select.addEventListener("change", async event => {
        const index = Number(event.currentTarget.dataset.cfProviderOperation);
        const action = this._ruleEditor?.draft?.actions?.[index];
        if (!action) return;
        const operation = event.currentTarget.value;
        action.payload = { operation };
        if (operation === "setDimension") Object.assign(action.payload, { dimension: "prosperity", value: "normal" });
        else Object.assign(action.payload, { enabled: true });
        await this.render();
      });
    });
    root.querySelectorAll("[data-cf-provider-dimension]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfProviderDimension);
        const action = this._ruleEditor?.draft?.actions?.[index];
        if (action?.payload) action.payload.dimension = event.currentTarget.value;
      });
    });
    root.querySelectorAll("[data-cf-provider-state-level]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfProviderStateLevel);
        const action = this._ruleEditor?.draft?.actions?.[index];
        if (action?.payload) action.payload.value = event.currentTarget.value;
      });
    });
    root.querySelectorAll("[data-cf-provider-condition]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfProviderCondition);
        const action = this._ruleEditor?.draft?.actions?.[index];
        if (action?.payload) action.payload.conditionId = event.currentTarget.value;
      });
    });
    root.querySelectorAll("[data-cf-provider-threat]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfProviderThreat);
        const action = this._ruleEditor?.draft?.actions?.[index];
        if (action?.payload) action.payload.threatId = event.currentTarget.value;
      });
    });
    root.querySelectorAll("[data-cf-provider-enabled]").forEach(select => {
      select.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfProviderEnabled);
        const action = this._ruleEditor?.draft?.actions?.[index];
        if (action?.payload) action.payload.enabled = event.currentTarget.value === "true";
      });
    });

    root.querySelectorAll("[data-cf-city-link-settlement]").forEach(select => {
      select.addEventListener("change", async event => {
        if (!this._cityLinkDraft) return;
        this._cityLinkDraft.settlementId = event.currentTarget.value;
        this._cityLinkDraft.subTargetId = null;
        await this.render();
      });
    });
    root.querySelectorAll("[data-cf-city-link-kind]").forEach(select => {
      select.addEventListener("change", async event => {
        if (!this._cityLinkDraft) return;
        this._cityLinkDraft.kind = event.currentTarget.value;
        this._cityLinkDraft.subTargetId = null;
        await this.render();
      });
    });
    root.querySelectorAll("[data-cf-city-link-target]").forEach(select => {
      select.addEventListener("change", event => {
        if (this._cityLinkDraft) this._cityLinkDraft.subTargetId = event.currentTarget.value;
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
        const allActors = foundryActors();
        const actors = allActors.filter(actor => actor?.type === "character");
        if (["xp", "currency", "item", "lootForge", "itemForge"].includes(reward.type)) reward.actorUuid ||= actors[0]?.uuid ?? REWARD_TARGET_ALL_PLAYERS;
        if (reward.type === "xp") {
          const selectedActor = allActors.find(actor => actor?.uuid === reward.actorUuid);
          if (selectedActor?.type === "party") reward.actorUuid = REWARD_TARGET_ALL_PLAYERS;
          reward.amount = Number(reward.amount || 100);
        }
        if (reward.type === "currency") reward.coins ??= { pp: 0, gp: 0, sp: 0, cp: 0 };
        if (reward.type === "item") reward.quantity = Math.max(1, Number(reward.quantity || 1));
        if (reward.type === "lootForge") {
          reward.lootConfig ??= { level: 1, theme: "generic", environment: "generic" };
          reward.mystifyMagicItems = reward.mystifyMagicItems === true;
          reward.previewSummary ??= null;
        }
        if (reward.type === "itemForge") {
          reward.itemRequest ??= {};
          reward.itemPreviewName ??= "";
          reward.previewSummary ??= null;
          reward.quantity = Math.max(1, Number(reward.quantity || 1));
        }
        if (reward.type === "tracker") {
          reward.trackerId ||= state.trackers[0]?.id ?? "";
          reward.delta = Number(reward.delta || 1);
        }
        await this.render();
      });
    });

    root.querySelectorAll("[data-cf-reward-actor]").forEach(select => {
      select.addEventListener("change", async event => {
        const index = Number(event.currentTarget.dataset.cfRewardActor);
        const reward = this._rewardEditor?.draft?.rewards?.[index];
        if (!reward) return;
        reward.actorUuid = event.currentTarget.value;
        await this.render();
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
    root.querySelectorAll("[data-cf-reward-mystify]").forEach(input => {
      input.addEventListener("change", event => {
        const index = Number(event.currentTarget.dataset.cfRewardMystify);
        const reward = this._rewardEditor?.draft?.rewards?.[index];
        if (reward) reward.mystifyMagicItems = Boolean(event.currentTarget.checked);
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
    for (const action of plan.actions ?? []) {
      if (action.kind === "provider.action" && action.provider === "cityForge") {
        try {
          const context = await this.providers?.getCityCampaignContext?.(action.targetId);
          if (context?.settlement?.name) action.targetTitle = context.settlement.name;
        } catch {}
      }
    }
    if (!plan.actions.length) return false;
    if (plan.blocked) throw new CampaignEngineError("TRANSITION_CYCLE");

    if (plan.consequences.length || plan.rewardOffers?.length || plan.conditionEvaluations?.length) {
      const consequenceItems = plan.consequences
        .map(action => `<li>${escapeHTML(transitionPlanActionLabel(action))}</li>`)
        .join("");
      const rewardItems = (plan.rewardOffers ?? [])
        .map(reward => `<li><i class="fa-solid fa-gift"></i> ${escapeHTML(rewardPreviewLabel(reward))}</li>`)
        .join("");
      const conditionBlocks = (plan.conditionEvaluations ?? []).map(evaluation => {
        const from = localize(STATUS_LABELS[evaluation.fromStatus] ?? evaluation.fromStatus);
        const to = localize(STATUS_LABELS[evaluation.toStatus] ?? evaluation.toStatus);
        const mode = localize(TRANSITION_CONDITION_MODES[evaluation.conditionMode]?.label ?? TRANSITION_CONDITION_MODES.all.label);
        const items = (evaluation.conditions ?? []).map(condition => `
          <li class="${condition.passed ? "is-passed" : "is-failed"}">
            <i class="fa-solid ${condition.passed ? "fa-check" : "fa-xmark"}"></i>
            ${escapeHTML(transitionConditionEvaluationLabel(condition))}
          </li>`).join("");
        const stateLabel = localize(evaluation.passed
          ? "CAMPAIGN_FORGE.Transitions.ConditionsPassed"
          : "CAMPAIGN_FORGE.Transitions.ConditionsBlocked");
        return `<div class="cf-transition-condition-evaluation ${evaluation.passed ? "is-passed" : "is-failed"}">
          <strong>${escapeHTML(format("CAMPAIGN_FORGE.Transitions.ConditionRuleLabel", { title: evaluation.entryTitle, from, to }))}</strong>
          <small>${escapeHTML(mode)} · ${escapeHTML(stateLabel)}</small>
          <ul>${items}</ul>
        </div>`;
      }).join("");
      const content = `
        <div class="cf-transition-preview-dialog">
          <p>${escapeHTML(format("CAMPAIGN_FORGE.Transitions.PreviewIntro", { title: plan.root.title }))}</p>
          ${conditionBlocks ? `<h4>${escapeHTML(localize("CAMPAIGN_FORGE.Transitions.ConditionEvaluation"))}</h4>${conditionBlocks}` : ""}
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
      const hasFullPerPlayerReward = plan.rewardOffers.some(rewardNeedsFullPerPlayerWarning);
      const warning = hasFullPerPlayerReward
        ? `<p class="cf-reward-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(localize("CAMPAIGN_FORGE.Rewards.AllPlayersFullWarning"))}</p>`
        : "";
      const grantNow = await DialogV2.confirm({
        window: { title: localize("CAMPAIGN_FORGE.Rewards.GrantConfirmTitle") },
        content: `<p>${escapeHTML(localize("CAMPAIGN_FORGE.Rewards.GrantConfirmText"))}</p>${warning}`,
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
      lootConfig: { level: 1, theme: "generic", environment: "generic" },
      itemRequest: {},
      itemPreviewName: "",
      previewSummary: null,
      mystifyMagicItems: false,
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

  static async _actionConfigureLootForgeReward(event, target) {
    const index = Number(target.dataset.rewardIndex);
    const reward = this._rewardEditor?.draft?.rewards?.[index];
    if (!reward || reward.type !== "lootForge") return;

    try {
      const session = this.providers?.createLootRewardEditor?.({
        initialConfig: JSON.parse(JSON.stringify(reward.lootConfig ?? { level: 1, theme: "generic", environment: "generic" })),
        persistSourceSelection: false,
        onGenerate: async state => {
          reward.lootConfig = JSON.parse(JSON.stringify(state?.config ?? reward.lootConfig ?? {}));
          reward.previewSummary = { label: lootPreviewSummary(state?.loot ?? {}) };
        }
      });
      if (!session) {
        ui.notifications.warn(localize("CAMPAIGN_FORGE.Rewards.LootForgeUnavailable"));
        return null;
      }

      try { await this._lootRewardEditorDialog?.close?.(); } catch {}
      const dialog = new DialogV2({
        id: "campaign-forge-loot-reward-editor",
        classes: ["campaign-forge", "cf-provider-reward-dialog", "cf-loot-reward-dialog"],
        window: {
          title: localize("CAMPAIGN_FORGE.Rewards.ConfigureLootForgeTitle"),
          icon: "fa-solid fa-box-open",
          resizable: true
        },
        position: { width: 980, height: 820 },
        modal: false,
        content: '<div class="cf-provider-reward-host" data-cf-loot-reward-host></div>',
        buttons: [{
          action: "close",
          label: localize("CAMPAIGN_FORGE.Actions.Close"),
          icon: "fa-solid fa-xmark"
        }]
      });

      this._lootRewardEditorSession = session;
      this._lootRewardEditorDialog = dialog;
      const originalClose = dialog.close.bind(dialog);
      dialog.close = async (...args) => {
        if (this._lootRewardEditorSession === session) {
          try {
            session.syncFromForm?.();
            reward.lootConfig = JSON.parse(JSON.stringify(session.getConfig?.() ?? reward.lootConfig ?? {}));
            const loot = session.getLoot?.();
            if (loot) reward.previewSummary = { label: lootPreviewSummary(loot) };
          } catch {}
          try { session.destroy?.(); } catch {}
          this._lootRewardEditorSession = null;
        }
        if (this._lootRewardEditorDialog === dialog) this._lootRewardEditorDialog = null;
        const result = await originalClose(...args);
        if (this.rendered) await this.render();
        return result;
      };

      dialog.render({ force: true });
      globalThis.setTimeout?.(async () => {
        const host = dialog.element?.querySelector?.("[data-cf-loot-reward-host]");
        if (!host) return;
        try {
          await session.render(host);
        } catch (error) {
          this._handleError(error);
        }
      }, 0);
      return dialog;
    } catch (error) {
      this._handleError(error);
      return null;
    }
  }

  static async _actionConfigureItemForgeReward(event, target) {
    const index = Number(target.dataset.rewardIndex);
    const reward = this._rewardEditor?.draft?.rewards?.[index];
    if (!reward || reward.type !== "itemForge") return;

    try {
      const editor = await this.providers?.createItemRewardEditor?.({
        request: JSON.parse(JSON.stringify(reward.itemRequest ?? {})),
        onChange: request => {
          reward.itemRequest = JSON.parse(JSON.stringify(request ?? {}));
          reward.itemPreviewName = "";
          reward.previewSummary = null;
        },
        onPreview: preview => {
          reward.itemRequest = JSON.parse(JSON.stringify(editor.getRequest?.() ?? reward.itemRequest ?? {}));
          reward.itemPreviewName = String(preview?.itemSource?.name ?? "");
          reward.previewSummary = { label: itemPreviewSummary(preview) };
        }
      });
      if (!editor) {
        ui.notifications.warn(localize("CAMPAIGN_FORGE.Rewards.ItemForgeUnavailable"));
        return null;
      }

      try { await this._itemRewardEditorDialog?.close?.(); } catch {}
      const dialog = new DialogV2({
        id: "campaign-forge-item-reward-editor",
        classes: ["campaign-forge", "cf-provider-reward-dialog", "cf-item-reward-dialog"],
        window: {
          title: localize("CAMPAIGN_FORGE.Rewards.ConfigureItemForgeTitle"),
          icon: "fa-solid fa-hammer",
          resizable: true
        },
        position: { width: 980, height: 820 },
        modal: false,
        content: `
          <div class="cf-provider-reward-host" data-cf-item-reward-host></div>
          <div class="cf-provider-dialog-actions">
            <button type="button" data-cf-item-preview><i class="fa-solid fa-eye"></i> ${escapeHTML(localize("CAMPAIGN_FORGE.Rewards.GenerateItemPreview"))}</button>
            <button type="button" data-cf-item-reroll><i class="fa-solid fa-rotate"></i> ${escapeHTML(localize("CAMPAIGN_FORGE.Rewards.RerollItemPreview"))}</button>
          </div>`,
        buttons: [{
          action: "close",
          label: localize("CAMPAIGN_FORGE.Actions.Close"),
          icon: "fa-solid fa-xmark"
        }]
      });

      this._itemRewardEditorSession = editor;
      this._itemRewardEditorDialog = dialog;
      const originalClose = dialog.close.bind(dialog);
      dialog.close = async (...args) => {
        if (this._itemRewardEditorSession === editor) {
          try {
            reward.itemRequest = JSON.parse(JSON.stringify(editor.getRequest?.() ?? reward.itemRequest ?? {}));
            const preview = editor.getPreview?.();
            if (preview?.itemSource) {
              reward.itemPreviewName = String(preview.itemSource.name ?? "");
              reward.previewSummary = { label: itemPreviewSummary(preview) };
            }
          } catch {}
          try { await editor.close?.({ force: true }); } catch {}
          this._itemRewardEditorSession = null;
        }
        if (this._itemRewardEditorDialog === dialog) this._itemRewardEditorDialog = null;
        const result = await originalClose(...args);
        if (this.rendered) await this.render();
        return result;
      };

      dialog.render({ force: true });
      globalThis.setTimeout?.(async () => {
        const host = dialog.element?.querySelector?.("[data-cf-item-reward-host]");
        if (!host) return;
        try {
          await editor.render({ force: true });
          if (editor.element?.parentElement !== host) host.append(editor.element);
          dialog.element?.querySelector?.("[data-cf-item-preview]")?.addEventListener("click", async () => {
            try { await editor.generatePreview(); } catch (error) { console.warn(`${MODULE_ID} | Item Forge preview failed`, error); }
          });
          dialog.element?.querySelector?.("[data-cf-item-reroll]")?.addEventListener("click", async () => {
            try { await editor.reroll(); } catch (error) { console.warn(`${MODULE_ID} | Item Forge reroll failed`, error); }
          });
        } catch (error) {
          this._handleError(error);
        }
      }, 0);
      return dialog;
    } catch (error) {
      this._handleError(error);
      return null;
    }
  }

  static async _actionGrantReward(event, target) {
    try {
      const state = await this.engine.getState();
      const entry = state.entries.find(candidate => candidate.id === target.dataset.entryId);
      const rule = entry?.rewardRules?.find(candidate => candidate.id === target.dataset.ruleId);
      const reward = rule?.rewards?.find(candidate => candidate.id === target.dataset.rewardId);
      if (rewardNeedsFullPerPlayerWarning(reward)) {
        const confirmed = await DialogV2.confirm({
          window: { title: localize("CAMPAIGN_FORGE.Rewards.AllPlayersWarningTitle") },
          content: `<p class="cf-reward-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(localize("CAMPAIGN_FORGE.Rewards.AllPlayersFullWarning"))}</p>`,
          modal: true,
          rejectClose: false
        });
        if (!confirmed) return;
      }
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
        conditionMode: draft.conditionMode ?? "all",
        conditions: draft.conditions ?? [],
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

  static async _actionAddTransitionCondition() {
    if (this._editor?.kind !== "rules" || !this._ruleEditor?.draft) return;
    const state = await this.engine.getState();
    const entry = state.entries[0] ?? null;
    this._ruleEditor.draft.conditions ??= [];
    this._ruleEditor.draft.conditions.push({
      id: `draft-condition-${Date.now()}-${this._ruleEditor.draft.conditions.length}`,
      type: "entryStatus",
      targetId: entry?.id ?? "",
      operator: "eq",
      status: entry?.status ?? ""
    });
    return this.render();
  }

  static _actionRemoveTransitionCondition(event, target) {
    if (!this._ruleEditor?.draft?.conditions) return;
    const index = Number(target.dataset.conditionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= this._ruleEditor.draft.conditions.length) return;
    this._ruleEditor.draft.conditions.splice(index, 1);
    return this.render();
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

  static async _actionAddCityExternalLink() {
    if (this._editor?.kind !== "entry" || !this._editor.id || !this._cityLinkDraft?.settlementId) return;
    try {
      const context = await this.providers?.getCityCampaignContext?.(this._cityLinkDraft.settlementId);
      if (!context) throw new CampaignEngineError("PROVIDER_UNAVAILABLE");
      const kind = this._cityLinkDraft.kind ?? "settlement";
      let target = context.targets?.settlement ?? null;
      if (kind === "district") target = (context.targets?.districts ?? []).find(item => item.id === this._cityLinkDraft.subTargetId) ?? null;
      if (kind === "location") target = (context.targets?.locations ?? []).find(item => item.id === this._cityLinkDraft.subTargetId) ?? null;
      if (kind === "faction") target = (context.targets?.factions ?? []).find(item => item.id === this._cityLinkDraft.subTargetId) ?? null;
      if (!target) throw new CampaignEngineError("EXTERNAL_LINK_TARGET_REQUIRED");
      await this.engine.addExternalLink(this._editor.id, {
        provider: "cityForge",
        kind,
        targetId: this._cityLinkDraft.settlementId,
        subTargetId: kind === "settlement" ? null : target.id,
        label: target.name ?? context.settlement?.name ?? target.id,
        meta: {
          settlementName: context.settlement?.name ?? "",
          settlementUuid: context.settlement?.uuid ?? null
        }
      });
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionRemoveExternalLink(event, target) {
    if (this._editor?.kind !== "entry" || !this._editor.id) return;
    try {
      await this.engine.removeExternalLink(this._editor.id, target.dataset.linkId);
      await this.render();
    } catch (error) {
      this._handleError(error);
    }
  }

  static async _actionOpenExternalLink(event, target) {
    try {
      const provider = target.dataset.provider;
      if (provider === "cityForge") {
        await this.providers?.openCitySettlement?.(target.dataset.targetId);
      }
    } catch (error) {
      this._handleError(error);
    }
  }

  static _actionOpenNpcForge() {
    try {
      const result = this.providers?.openNpcForge?.();
      if (!result) ui.notifications.warn(localize("CAMPAIGN_FORGE.Integrations.Npc.Unavailable"));
      return result;
    } catch (error) {
      this._handleError(error);
      return null;
    }
  }

  static async _actionCreateKeyPlayerWithNpcForge() {
    try {
      const session = this.providers?.createNpcEditorSession?.({
        mode: "embedded",
        actionBar: "default",
        onActorCreated: async ({ actor }) => {
          if (!actor) return;
          const keyPlayer = await this.engine.createKeyPlayer({
            actorUuid: actor.uuid,
            actorName: actor.name ?? "",
            actorImg: actor.img ?? ""
          });
          this._activeTab = "keyPlayers";
          this._editor = { kind: "keyPlayer", id: keyPlayer.id };
          this._focusKey = `keyPlayer:${keyPlayer.id}`;
          try { this._npcEditorSession?.destroy?.(); } catch {}
          this._npcEditorSession = null;
          try { await this._npcEditorDialog?.close?.(); } catch {}
          this._npcEditorDialog = null;
          await this.render();
        }
      });
      if (!session) {
        ui.notifications.warn(localize("CAMPAIGN_FORGE.Integrations.Npc.Unavailable"));
        return null;
      }

      const dialog = new DialogV2({
        id: "campaign-forge-npc-editor",
        classes: ["campaign-forge", "cf-npc-forge-dialog"],
        window: {
          title: localize("CAMPAIGN_FORGE.Integrations.Npc.CreateTitle"),
          icon: "fa-solid fa-user-gear",
          resizable: true
        },
        position: { width: 900, height: 760 },
        modal: false,
        content: '<div class="cf-npc-forge-host" data-cf-npc-forge-host></div>',
        buttons: [{
          action: "close",
          label: localize("CAMPAIGN_FORGE.Actions.Close"),
          icon: "fa-solid fa-xmark"
        }]
      });
      this._npcEditorSession = session;
      this._npcEditorDialog = dialog;
      const originalClose = dialog.close.bind(dialog);
      dialog.close = async (...args) => {
        if (this._npcEditorSession === session) {
          try { session.destroy?.(); } catch {}
          this._npcEditorSession = null;
        }
        if (this._npcEditorDialog === dialog) this._npcEditorDialog = null;
        return originalClose(...args);
      };
      dialog.render({ force: true });
      globalThis.setTimeout?.(async () => {
        const host = dialog.element?.querySelector?.("[data-cf-npc-forge-host]");
        if (!host) return;
        try {
          session.mount(host);
          if (!session.getNpc?.()) await session.generate();
        } catch (error) {
          this._handleError(error);
        }
      }, 0);
      return dialog;
    } catch (error) {
      this._handleError(error);
      return null;
    }
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
