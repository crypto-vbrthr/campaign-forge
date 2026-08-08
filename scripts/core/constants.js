export const MODULE_ID = "campaign-forge";

export const SETTINGS = Object.freeze({
  DATA: "campaignData",
  COLLAPSED_GROUPS: "collapsedGroups",
  SHOW_JOURNAL_BUTTON: "showJournalButton",
  SHOW_STRUCTURAL_CHANGES: "showStructuralChanges"
});

export const SORT_STEP = 1000;

export const JOURNAL_LINK_ROLES = Object.freeze({
  details: { label: "CAMPAIGN_FORGE.JournalLinks.Roles.details" },
  source: { label: "CAMPAIGN_FORGE.JournalLinks.Roles.source" },
  notes: { label: "CAMPAIGN_FORGE.JournalLinks.Roles.notes" },
  handout: { label: "CAMPAIGN_FORGE.JournalLinks.Roles.handout" },
  additional: { label: "CAMPAIGN_FORGE.JournalLinks.Roles.additional" }
});

export const ENTRY_TYPES = Object.freeze({
  quest: {
    label: "CAMPAIGN_FORGE.EntryTypes.quest",
    icon: "fa-solid fa-list-check",
    statuses: ["inactive", "available", "active", "completed", "failed"]
  },
  knowledge: {
    label: "CAMPAIGN_FORGE.EntryTypes.knowledge",
    icon: "fa-solid fa-lightbulb",
    statuses: ["unknown", "hinted", "discovered", "understood", "confirmed"]
  },
  event: {
    label: "CAMPAIGN_FORGE.EntryTypes.event",
    icon: "fa-solid fa-bolt",
    statuses: ["pending", "occurred", "prevented", "obsolete"]
  },
  mystery: {
    label: "CAMPAIGN_FORGE.EntryTypes.mystery",
    icon: "fa-solid fa-circle-question",
    statuses: ["open", "partial", "solved", "obsolete"]
  },
  location: {
    label: "CAMPAIGN_FORGE.EntryTypes.location",
    icon: "fa-solid fa-location-dot",
    statuses: ["unknown", "discovered", "visited", "obsolete"]
  },
  item: {
    label: "CAMPAIGN_FORGE.EntryTypes.item",
    icon: "fa-solid fa-gem",
    statuses: ["unknown", "known", "acquired", "lost"]
  },
  note: {
    label: "CAMPAIGN_FORGE.EntryTypes.note",
    icon: "fa-solid fa-note-sticky",
    statuses: ["active", "completed", "obsolete"]
  }
});


export const KEY_PLAYER_ROLES = Object.freeze({
  ally: { label: "CAMPAIGN_FORGE.KeyPlayerRoles.ally" },
  patron: { label: "CAMPAIGN_FORGE.KeyPlayerRoles.patron" },
  informant: { label: "CAMPAIGN_FORGE.KeyPlayerRoles.informant" },
  rival: { label: "CAMPAIGN_FORGE.KeyPlayerRoles.rival" },
  antagonist: { label: "CAMPAIGN_FORGE.KeyPlayerRoles.antagonist" },
  authority: { label: "CAMPAIGN_FORGE.KeyPlayerRoles.authority" },
  neutral: { label: "CAMPAIGN_FORGE.KeyPlayerRoles.neutral" },
  other: { label: "CAMPAIGN_FORGE.KeyPlayerRoles.other" }
});

export const KEY_PLAYER_STATES = Object.freeze({
  active: { label: "CAMPAIGN_FORGE.KeyPlayerStates.active" },
  missing: { label: "CAMPAIGN_FORGE.KeyPlayerStates.missing" },
  captured: { label: "CAMPAIGN_FORGE.KeyPlayerStates.captured" },
  hiding: { label: "CAMPAIGN_FORGE.KeyPlayerStates.hiding" },
  dead: { label: "CAMPAIGN_FORGE.KeyPlayerStates.dead" },
  inactive: { label: "CAMPAIGN_FORGE.KeyPlayerStates.inactive" },
  unknown: { label: "CAMPAIGN_FORGE.KeyPlayerStates.unknown" }
});


export const TRANSITION_ACTION_TYPES = Object.freeze({
  setEntryStatus: { label: "CAMPAIGN_FORGE.TransitionActions.setEntryStatus", icon: "fa-solid fa-arrow-right-arrow-left" },
  setEntryActive: { label: "CAMPAIGN_FORGE.TransitionActions.setEntryActive", icon: "fa-solid fa-power-off" },
  setEntryVisible: { label: "CAMPAIGN_FORGE.TransitionActions.setEntryVisible", icon: "fa-solid fa-eye" },
  adjustTracker: { label: "CAMPAIGN_FORGE.TransitionActions.adjustTracker", icon: "fa-solid fa-chart-line" }
});

export const MAX_TRANSITION_DEPTH = 24;
export const MAX_TRANSITION_ACTIONS = 100;

export const REWARD_TYPES = Object.freeze({
  xp: { label: "CAMPAIGN_FORGE.Rewards.Types.xp", icon: "fa-solid fa-star" },
  currency: { label: "CAMPAIGN_FORGE.Rewards.Types.currency", icon: "fa-solid fa-coins" },
  item: { label: "CAMPAIGN_FORGE.Rewards.Types.item", icon: "fa-solid fa-gift" },
  tracker: { label: "CAMPAIGN_FORGE.Rewards.Types.tracker", icon: "fa-solid fa-chart-line" }
});

export const REWARD_STATES = Object.freeze({
  locked: { label: "CAMPAIGN_FORGE.Rewards.States.locked" },
  pending: { label: "CAMPAIGN_FORGE.Rewards.States.pending" },
  granted: { label: "CAMPAIGN_FORGE.Rewards.States.granted" },
  skipped: { label: "CAMPAIGN_FORGE.Rewards.States.skipped" },
  failed: { label: "CAMPAIGN_FORGE.Rewards.States.failed" }
});

export const OVERVIEW_REACHED_STATUSES = Object.freeze({
  quest: Object.freeze(["completed"]),
  knowledge: Object.freeze(["discovered", "understood", "confirmed"]),
  event: Object.freeze(["occurred", "prevented"]),
  mystery: Object.freeze(["solved"]),
  location: Object.freeze(["discovered", "visited"]),
  item: Object.freeze(["acquired"]),
  note: Object.freeze(["completed"])
});


export const SESSION_CHANGE_KINDS = Object.freeze({
  note: { label: "CAMPAIGN_FORGE.SessionChangeKinds.note", icon: "fa-solid fa-note-sticky" },
  discovery: { label: "CAMPAIGN_FORGE.SessionChangeKinds.discovery", icon: "fa-solid fa-lightbulb" },
  event: { label: "CAMPAIGN_FORGE.SessionChangeKinds.event", icon: "fa-solid fa-bolt" },
  decision: { label: "CAMPAIGN_FORGE.SessionChangeKinds.decision", icon: "fa-solid fa-code-branch" },
  other: { label: "CAMPAIGN_FORGE.SessionChangeKinds.other", icon: "fa-solid fa-ellipsis" }
});

export const STATUS_LABELS = Object.freeze({
  inactive: "CAMPAIGN_FORGE.Status.inactive",
  available: "CAMPAIGN_FORGE.Status.available",
  active: "CAMPAIGN_FORGE.Status.active",
  completed: "CAMPAIGN_FORGE.Status.completed",
  failed: "CAMPAIGN_FORGE.Status.failed",
  unknown: "CAMPAIGN_FORGE.Status.unknown",
  hinted: "CAMPAIGN_FORGE.Status.hinted",
  discovered: "CAMPAIGN_FORGE.Status.discovered",
  understood: "CAMPAIGN_FORGE.Status.understood",
  confirmed: "CAMPAIGN_FORGE.Status.confirmed",
  pending: "CAMPAIGN_FORGE.Status.pending",
  occurred: "CAMPAIGN_FORGE.Status.occurred",
  prevented: "CAMPAIGN_FORGE.Status.prevented",
  obsolete: "CAMPAIGN_FORGE.Status.obsolete",
  open: "CAMPAIGN_FORGE.Status.open",
  partial: "CAMPAIGN_FORGE.Status.partial",
  solved: "CAMPAIGN_FORGE.Status.solved",
  visited: "CAMPAIGN_FORGE.Status.visited",
  known: "CAMPAIGN_FORGE.Status.known",
  acquired: "CAMPAIGN_FORGE.Status.acquired",
  lost: "CAMPAIGN_FORGE.Status.lost"
});

export const STRUCTURAL_ACTIONS = new Set([
  "group.created",
  "group.updated",
  "group.deleted",
  "node.moved",
  "entry.created",
  "entry.updated",
  "entry.deleted",
  "entry.rule.created",
  "entry.rule.updated",
  "entry.rule.deleted",
  "entry.rewardRule.created",
  "entry.rewardRule.updated",
  "entry.rewardRule.deleted",
  "entry.journal.added",
  "entry.journal.updated",
  "entry.journal.removed",
  "tracker.created",
  "tracker.updated",
  "tracker.deleted",
  "overview.pinned",
  "overview.unpinned",
  "overview.moved",
  "keyPlayer.created",
  "keyPlayer.updated",
  "keyPlayer.deleted",
  "keyPlayer.moved"
]);
