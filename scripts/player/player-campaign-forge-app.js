import { ENTRY_TYPES, KEY_PLAYER_ROLES, KEY_PLAYER_STATES, STATUS_LABELS } from "../core/constants.js";
import { buildPlayerProjection, publicGroupProgress } from "./player-projection.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key) { return game.i18n.localize(key); }

function statusLabel(status) { return localize(STATUS_LABELS[status] ?? status); }

function rangeData(tracker) {
  const hasRange = Number.isFinite(Number(tracker.min)) && Number.isFinite(Number(tracker.max)) && Number(tracker.max) > Number(tracker.min);
  if (!hasRange) return { hasProgress: false, progressPercent: 0, rangeLabel: "" };
  const min = Number(tracker.min);
  const max = Number(tracker.max);
  const value = Number(tracker.value ?? 0);
  return {
    hasProgress: true,
    progressPercent: Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100))),
    rangeLabel: `${min} – ${max}`
  };
}

async function resolveDocument(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== "function") return null;
  try { return await globalThis.fromUuid(uuid); } catch { return null; }
}

function canObserve(document) {
  if (!document) return false;
  try {
    if (typeof document.testUserPermission === "function") return document.testUserPermission(game.user, "OBSERVER");
    if (typeof document.parent?.testUserPermission === "function") return document.parent.testUserPermission(game.user, "OBSERVER");
  } catch { /* noop */ }
  return false;
}

export class PlayerCampaignForgeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "campaign-forge-player-view",
    classes: ["campaign-forge", "campaign-forge-player-view"],
    position: { width: 1000, height: 720 },
    window: { icon: "fa-solid fa-book-open-reader", resizable: true },
    actions: {
      setTab: this._actionSetTab,
      openJournal: this._actionOpenJournal,
      openActor: this._actionOpenActor
    }
  };

  static PARTS = {
    main: {
      template: "modules/campaign-forge/templates/player-campaign-forge.hbs",
      scrollable: [".cf-player-scroll"]
    }
  };

  constructor(engine, options = {}) {
    super({
      ...options,
      window: { ...(options.window ?? {}), title: localize("CAMPAIGN_FORGE.PlayerView.WindowTitle") }
    });
    this.engine = engine;
    this._activeTab = "overview";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const fullState = await this.engine.getState();
    const state = buildPlayerProjection(fullState);

    const groups = new Map(state.groups.map(group => [group.id, group]));
    const entriesByParent = new Map();
    const groupsByParent = new Map();
    const pushMap = (map, key, item) => {
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    };
    for (const group of state.groups) pushMap(groupsByParent, group.parentId ?? null, group);
    for (const entry of state.entries) pushMap(entriesByParent, entry.parentId ?? null, entry);
    for (const list of groupsByParent.values()) list.sort((a, b) => a.sort - b.sort);
    for (const list of entriesByParent.values()) list.sort((a, b) => a.sort - b.sort);

    const campaignRows = [];
    const walk = async (parentId, depth) => {
      const children = [
        ...(groupsByParent.get(parentId) ?? []).map(item => ({ kind: "group", sort: item.sort, item })),
        ...(entriesByParent.get(parentId) ?? []).map(item => ({ kind: "entry", sort: item.sort, item }))
      ].sort((a, b) => a.sort - b.sort);
      for (const child of children) {
        if (child.kind === "group") {
          campaignRows.push({
            nodeType: "group",
            id: child.item.id,
            title: child.item.title,
            depth,
            icon: child.item.kind === "chapter" ? "fa-solid fa-bookmark" : "fa-solid fa-folder"
          });
          await walk(child.item.id, depth + 1);
        } else {
          const entry = child.item;
          const primary = (entry.journalLinks ?? []).find(link => link.primary) ?? (entry.journalLinks ?? [])[0] ?? null;
          let canOpenJournal = false;
          if (primary?.uuid) canOpenJournal = canObserve(await resolveDocument(primary.uuid));
          campaignRows.push({
            nodeType: "entry",
            id: entry.id,
            title: entry.title,
            description: entry.description,
            depth,
            icon: ENTRY_TYPES[entry.type]?.icon ?? "fa-solid fa-note-sticky",
            typeLabel: localize(ENTRY_TYPES[entry.type]?.label ?? entry.type),
            statusLabel: statusLabel(entry.status),
            active: entry.active,
            journalUuid: canOpenJournal ? primary.uuid : "",
            canOpenJournal
          });
        }
      }
    };
    await walk(null, 0);

    const trackersById = new Map(state.trackers.map(tracker => [tracker.id, tracker]));
    const keyPlayers = [];
    for (const keyPlayer of state.keyPlayers) {
      const actor = await resolveDocument(keyPlayer.actorUuid);
      const relationship = trackersById.get(keyPlayer.relationshipTrackerId) ?? null;
      keyPlayers.push({
        ...keyPlayer,
        name: actor?.name ?? keyPlayer.actorName ?? keyPlayer.actorUuid,
        image: actor?.img ?? keyPlayer.actorImg ?? "icons/svg/mystery-man.svg",
        roleLabel: localize(KEY_PLAYER_ROLES[keyPlayer.role]?.label ?? keyPlayer.role),
        stateLabel: localize(KEY_PLAYER_STATES[keyPlayer.state]?.label ?? keyPlayer.state),
        canOpenActor: canObserve(actor),
        relationshipTitle: relationship?.title ?? "",
        relationshipValue: relationship?.value ?? "",
        hasRelationship: Boolean(relationship)
      });
    }

    const pinViews = [];
    for (const pin of state.overviewPins) {
      if (pin.targetType === "entry") {
        const entry = state.entries.find(item => item.id === pin.targetId);
        if (!entry) continue;
        pinViews.push({
          id: pin.id,
          icon: ENTRY_TYPES[entry.type]?.icon ?? "fa-solid fa-note-sticky",
          title: entry.title,
          meta: localize(ENTRY_TYPES[entry.type]?.label ?? entry.type),
          detail: statusLabel(entry.status),
          description: entry.description,
          hasProgress: false
        });
      } else if (pin.targetType === "group") {
        const group = state.groups.find(item => item.id === pin.targetId);
        if (!group) continue;
        const progress = publicGroupProgress(fullState, group.id);
        pinViews.push({
          id: pin.id,
          icon: group.kind === "chapter" ? "fa-solid fa-bookmark" : "fa-solid fa-folder",
          title: group.title,
          meta: localize(group.kind === "chapter" ? "CAMPAIGN_FORGE.GroupKinds.chapter" : "CAMPAIGN_FORGE.GroupKinds.group"),
          detail: `${progress.reached} / ${progress.total}`,
          hasProgress: progress.total > 0,
          progressPercent: progress.percent
        });
      } else if (pin.targetType === "tracker") {
        const tracker = state.trackers.find(item => item.id === pin.targetId);
        if (!tracker) continue;
        const range = rangeData(tracker);
        pinViews.push({
          id: pin.id,
          icon: "fa-solid fa-chart-line",
          title: tracker.title,
          meta: localize("CAMPAIGN_FORGE.PlayerView.Tracker"),
          detail: range.rangeLabel ? `${tracker.value} · ${range.rangeLabel}` : String(tracker.value),
          description: tracker.description,
          ...range
        });
      } else if (pin.targetType === "keyPlayer") {
        const keyPlayer = keyPlayers.find(item => item.id === pin.targetId);
        if (!keyPlayer) continue;
        pinViews.push({
          id: pin.id,
          image: keyPlayer.image,
          title: keyPlayer.name,
          meta: keyPlayer.roleLabel,
          detail: keyPlayer.stateLabel,
          description: keyPlayer.note,
          hasProgress: false
        });
      }
    }

    return {
      ...context,
      activeTab: this._activeTab,
      tabs: [
        { id: "overview", label: localize("CAMPAIGN_FORGE.Tabs.Overview"), icon: "fa-solid fa-gauge", active: this._activeTab === "overview" },
        { id: "campaign", label: localize("CAMPAIGN_FORGE.Tabs.Campaign"), icon: "fa-solid fa-folder-tree", active: this._activeTab === "campaign" },
        { id: "keyPlayers", label: localize("CAMPAIGN_FORGE.Tabs.KeyPlayers"), icon: "fa-solid fa-users", active: this._activeTab === "keyPlayers" }
      ],
      pins: pinViews,
      campaignRows,
      keyPlayers,
      stats: {
        entries: state.entries.length,
        groups: state.groups.length,
        trackers: state.trackers.length,
        keyPlayers: state.keyPlayers.length
      }
    };
  }

  static _actionSetTab(event, target) {
    this._activeTab = target.dataset.tab || "overview";
    return this.render();
  }

  static async _actionOpenJournal(event, target) {
    const document = await resolveDocument(target.dataset.uuid);
    if (!document || !canObserve(document)) return;
    if (document.documentName === "JournalEntryPage") return document.parent?.sheet?.render?.(true, { pageId: document.id });
    return document.sheet?.render?.(true);
  }

  static async _actionOpenActor(event, target) {
    const actor = await resolveDocument(target.dataset.uuid);
    if (!actor || !canObserve(actor)) return;
    return actor.sheet?.render?.(true);
  }
}
