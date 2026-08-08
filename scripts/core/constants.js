export const MODULE_ID = "campaign-forge";

export const SETTINGS = Object.freeze({
  DATA: "campaignData",
  COLLAPSED_GROUPS: "collapsedGroups",
  SHOW_JOURNAL_BUTTON: "showJournalButton",
  SHOW_STRUCTURAL_CHANGES: "showStructuralChanges"
});

export const SORT_STEP = 1000;

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
  "tracker.created",
  "tracker.updated",
  "tracker.deleted"
]);
