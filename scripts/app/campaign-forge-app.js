import {
  ENTRY_TYPES,
  MODULE_ID,
  SETTINGS,
  STATUS_LABELS,
  STRUCTURAL_ACTIONS
} from "../core/constants.js";
import { CampaignEngineError } from "../engine/campaign-engine.js";

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
    default:
      return change.targetTitle || change.action;
  }
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
      cancelEditor: this._actionCancelEditor,
      saveEditor: this._actionSaveEditor,
      toggleGroup: this._actionToggleGroup,
      moveUp: this._actionMoveUp,
      moveDown: this._actionMoveDown,
      deleteNode: this._actionDeleteNode,
      startSession: this._actionStartSession,
      endSession: this._actionEndSession,
      createTracker: this._actionCreateTracker,
      editTracker: this._actionEditTracker,
      adjustTracker: this._actionAdjustTracker,
      moveTrackerUp: this._actionMoveTrackerUp,
      moveTrackerDown: this._actionMoveTrackerDown,
      deleteTracker: this._actionDeleteTracker
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
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = await this.engine.getState();
    const collapsed = new Set(game.settings.get(MODULE_ID, SETTINGS.COLLAPSED_GROUPS) ?? []);
    const activeSession = state.sessions.find(s => s.status === "active") ?? null;
    const showStructural = game.settings.get(MODULE_ID, SETTINGS.SHOW_STRUCTURAL_CHANGES);

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
            hasDescription: Boolean(group.description)
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
            hasDescription: Boolean(entry.description)
          });
        }
      }
    };

    pushChildren(null, 0);

    const sessions = [...state.sessions]
      .sort((a, b) => b.number - a.number)
      .map(session => {
        const changes = session.changes
          .filter(change => showStructural || !change.structural)
          .map(change => ({
            ...change,
            timeLabel: localeTime(change.timestamp),
            summary: actionSummary(change),
            structural: Boolean(change.structural)
          }))
          .reverse();
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
          : null
      }));

    const countByType = Object.keys(ENTRY_TYPES).map(type => ({
      type,
      label: localize(ENTRY_TYPES[type].label),
      count: state.entries.filter(e => e.type === type).length,
      icon: ENTRY_TYPES[type].icon
    })).filter(x => x.count > 0);

    const contextEditor = this._buildEditor(state);

    return {
      ...context,
      activeTab: this._activeTab,
      tabs: [
        { id: "overview", label: localize("CAMPAIGN_FORGE.Tabs.Overview"), icon: "fa-solid fa-gauge", active: this._activeTab === "overview" },
        { id: "campaign", label: localize("CAMPAIGN_FORGE.Tabs.Campaign"), icon: "fa-solid fa-folder-tree", active: this._activeTab === "campaign" },
        { id: "sessions", label: localize("CAMPAIGN_FORGE.Tabs.Sessions"), icon: "fa-solid fa-clock-rotate-left", active: this._activeTab === "sessions" },
        { id: "trackers", label: localize("CAMPAIGN_FORGE.Tabs.Trackers"), icon: "fa-solid fa-chart-simple", active: this._activeTab === "trackers" },
        { id: "settings", label: localize("CAMPAIGN_FORGE.Tabs.Settings"), icon: "fa-solid fa-gear", active: this._activeTab === "settings" }
      ],
      state,
      campaignRows,
      sessions,
      trackers,
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
        sessions: state.sessions.filter(s => s.status === "closed").length,
        activeEntries: state.entries.filter(e => e.active).length
      },
      settings: {
        showJournalButton: game.settings.get(MODULE_ID, SETTINGS.SHOW_JOURNAL_BUTTON),
        showStructuralChanges: game.settings.get(MODULE_ID, SETTINGS.SHOW_STRUCTURAL_CHANGES)
      },
      version: game.modules.get(MODULE_ID)?.version ?? "0.1.0",
      labels: {
        title: localize("CAMPAIGN_FORGE.Title"),
        noActiveSession: localize("CAMPAIGN_FORGE.Session.NoneActive")
      }
    };
  }

  _buildEditor(state) {
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
        heading: localize(source ? "CAMPAIGN_FORGE.Editor.EditEntry" : "CAMPAIGN_FORGE.Editor.NewEntry")
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
          await this.engine.setEntryStatus(entryId, status, { source: "manual" });
          await this.render();
        } catch (error) {
          this._handleError(error);
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
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-campaign-forge-node", JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
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

  static _actionSetTab(event, target) {
    this._activeTab = target.dataset.tab;
    this._editor = null;
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

  static _actionCancelEditor() {
    this._editor = null;
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
        if (this._editor.id) await this.engine.updateEntry(this._editor.id, payload);
        else await this.engine.createEntry(payload);
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
}
