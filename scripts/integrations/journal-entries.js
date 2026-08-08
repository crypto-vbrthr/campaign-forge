import { ENTRY_TYPES, MODULE_ID, STATUS_LABELS } from "../core/constants.js";

const EMBED_PATTERN = /@CampaignForge\[([^\]]+)\](?:\{([^}]+)\})?/g;
const EMBED_MIME = "application/x-campaign-forge-entry";
let registered = false;
let getEngineRef = () => null;
let openForgeRef = () => null;

function localize(key) {
  return game.i18n.localize(key);
}

function format(key, data = {}) {
  return game.i18n.format(key, data);
}

function escapeHTML(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function statusLabel(status) {
  return localize(STATUS_LABELS[status] ?? status);
}

function entryTypeLabel(type) {
  return localize(ENTRY_TYPES[type]?.label ?? type);
}

function createMissingEmbed(entryId) {
  const element = document.createElement("span");
  element.className = "cf-journal-embed cf-journal-embed-missing";
  element.dataset.entryId = entryId;
  if (game.user?.isGM) {
    element.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
    const text = document.createElement("span");
    text.textContent = localize("CAMPAIGN_FORGE.JournalEmbed.Missing");
    element.append(text);
  } else {
    element.hidden = true;
  }
  return element;
}

function createLoadingEmbed(entryId) {
  const element = document.createElement("span");
  element.className = "cf-journal-embed cf-journal-embed-loading";
  element.dataset.entryId = entryId;
  if (game.user?.isGM) element.textContent = localize("CAMPAIGN_FORGE.JournalEmbed.Loading");
  else element.hidden = true;
  return element;
}

function createEntryEmbed(entry, mode = "card") {
  if (!game.user?.isGM && !entry.visible) {
    const hidden = document.createElement("span");
    hidden.className = "cf-journal-embed cf-journal-embed-hidden";
    hidden.dataset.entryId = entry.id;
    hidden.hidden = true;
    return hidden;
  }

  const compact = mode === "compact";
  const element = document.createElement("span");
  element.className = `cf-journal-embed ${compact ? "is-compact" : "is-card"}${entry.active ? "" : " is-inactive"}`;
  element.dataset.entryId = entry.id;
  element.dataset.mode = compact ? "compact" : "card";

  const header = document.createElement("span");
  header.className = "cf-journal-embed-header";

  const icon = document.createElement("i");
  icon.className = ENTRY_TYPES[entry.type]?.icon ?? "fa-solid fa-note-sticky";
  header.append(icon);

  const titleWrap = document.createElement("span");
  titleWrap.className = "cf-journal-embed-title";
  const title = document.createElement("strong");
  title.textContent = entry.title;
  titleWrap.append(title);
  const meta = document.createElement("small");
  meta.textContent = entryTypeLabel(entry.type) + (entry.active ? "" : ` · ${localize("CAMPAIGN_FORGE.Status.inactive")}`);
  titleWrap.append(meta);
  header.append(titleWrap);

  const status = document.createElement("span");
  status.className = "cf-journal-embed-status";
  if (game.user?.isGM) {
    const select = document.createElement("select");
    select.dataset.cfJournalStatus = entry.id;
    select.setAttribute("aria-label", localize("CAMPAIGN_FORGE.Common.Status"));
    for (const id of ENTRY_TYPES[entry.type]?.statuses ?? []) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = statusLabel(id);
      option.selected = id === entry.status;
      select.append(option);
    }
    status.append(select);
  } else {
    const badge = document.createElement("span");
    badge.className = "cf-journal-status-badge";
    badge.textContent = statusLabel(entry.status);
    status.append(badge);
  }
  header.append(status);

  if (game.user?.isGM) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "icon cf-journal-embed-open";
    open.dataset.cfJournalOpenEntry = entry.id;
    open.title = localize("CAMPAIGN_FORGE.JournalEmbed.OpenInForge");
    open.setAttribute("aria-label", open.title);
    open.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
    header.append(open);
  }

  element.append(header);

  if (!compact && entry.description) {
    const description = document.createElement("span");
    description.className = "cf-journal-embed-description";
    description.textContent = entry.description;
    element.append(description);
  }

  return element;
}

async function getEntry(entryId) {
  const engine = getEngineRef?.();
  if (!engine) return null;
  const state = await engine.getState();
  return state.entries.find(entry => entry.id === entryId) ?? null;
}

async function enrichCampaignEntry(match) {
  const entryId = String(match[1] ?? "").trim();
  const mode = String(match[2] ?? "card").trim().toLowerCase() === "compact" ? "compact" : "card";
  const engine = getEngineRef?.();
  if (!engine) return createLoadingEmbed(entryId);
  const entry = await getEntry(entryId);
  return entry ? createEntryEmbed(entry, mode) : createMissingEmbed(entryId);
}

function rewardLabel(reward) {
  if (reward.type === "xp") return format("CAMPAIGN_FORGE.Rewards.PreviewXP", { amount: reward.amount ?? 0 });
  if (reward.type === "currency") {
    const coins = reward.coins ?? {};
    const amount = ["pp", "gp", "sp", "cp"]
      .filter(denom => Number(coins[denom] ?? 0) > 0)
      .map(denom => `${Number(coins[denom])} ${denom.toUpperCase()}`)
      .join(", ");
    return format("CAMPAIGN_FORGE.Rewards.PreviewCurrency", { amount });
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

function consequenceLabel(action) {
  if (action.kind === "entry.status") {
    return format("CAMPAIGN_FORGE.Transitions.PreviewStatus", {
      title: action.targetTitle,
      from: statusLabel(action.before?.status ?? ""),
      to: statusLabel(action.after?.status ?? "")
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
      delta: delta >= 0 ? `+${delta}` : String(delta),
      value: action.after?.value ?? ""
    });
  }
  return action.targetTitle || action.kind;
}

async function requestStatusChange(entryId, status) {
  if (!game.user?.isGM) return false;
  const engine = getEngineRef?.();
  if (!engine) return false;
  try {
    const plan = await engine.previewEntryStatusTransition(entryId, status);
    if (plan.blocked) throw new Error("TRANSITION_CYCLE");
    if (!plan.actions.length) return false;

    if (plan.consequences.length || plan.rewardOffers?.length) {
      const consequences = plan.consequences.map(action => {
        const li = document.createElement("li");
        li.textContent = consequenceLabel(action);
        return li.outerHTML;
      }).join("");
      const rewards = (plan.rewardOffers ?? []).map(reward => {
        const li = document.createElement("li");
        li.textContent = rewardLabel(reward);
        return li.outerHTML;
      }).join("");
      const content = `<div class="cf-transition-preview-dialog"><p>${escapeHTML(format("CAMPAIGN_FORGE.Transitions.PreviewIntro", { title: plan.root.title }))}</p>${consequences ? `<h4>${escapeHTML(localize("CAMPAIGN_FORGE.Transitions.Consequences"))}</h4><ul>${consequences}</ul>` : ""}${rewards ? `<h4>${escapeHTML(localize("CAMPAIGN_FORGE.Rewards.DueRewards"))}</h4><ul>${rewards}</ul>` : ""}<p class="hint">${escapeHTML(localize("CAMPAIGN_FORGE.Transitions.PreviewHint"))}</p></div>`;
      const DialogV2 = foundry.applications?.api?.DialogV2;
      const confirmed = DialogV2
        ? await DialogV2.confirm({ window: { title: localize("CAMPAIGN_FORGE.Transitions.ConfirmTitle") }, content, modal: true, rejectClose: false })
        : globalThis.confirm?.(localize("CAMPAIGN_FORGE.Transitions.ConfirmTitle"));
      if (!confirmed) return false;
    }

    let rewardMode = "defer";
    if (plan.rewardOffers?.length) {
      const DialogV2 = foundry.applications?.api?.DialogV2;
      const grantNow = DialogV2
        ? await DialogV2.confirm({
            window: { title: localize("CAMPAIGN_FORGE.Rewards.GrantConfirmTitle") },
            content: `<p>${escapeHTML(localize("CAMPAIGN_FORGE.Rewards.GrantConfirmText"))}</p>`,
            modal: true,
            rejectClose: false
          })
        : globalThis.confirm?.(localize("CAMPAIGN_FORGE.Rewards.GrantConfirmText"));
      rewardMode = grantNow ? "grant" : "defer";
    }

    await engine.setEntryStatus(entryId, status, { source: "journal", rewardMode });
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Journal status change failed`, error);
    const key = error?.code ? `CAMPAIGN_FORGE.Errors.${error.code}` : "CAMPAIGN_FORGE.Errors.Generic";
    const translated = localize(key);
    ui.notifications.error(translated === key ? localize("CAMPAIGN_FORGE.Errors.Generic") : translated);
    return false;
  }
}

async function onDocumentChange(event) {
  const select = event.target?.closest?.("select[data-cf-journal-status]");
  if (!select) return;
  event.preventDefault();
  event.stopPropagation();
  const entryId = select.dataset.cfJournalStatus;
  const changed = await requestStatusChange(entryId, select.value);
  if (!changed) await refreshJournalEmbeds(entryId);
}

async function onDocumentClick(event) {
  const button = event.target?.closest?.("[data-cf-journal-open-entry]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  openForgeRef?.({ targetType: "entry", targetId: button.dataset.cfJournalOpenEntry });
}

export function campaignEntryEmbedSyntax(entryId, mode = "card") {
  const cleanMode = mode === "compact" ? "compact" : "card";
  return `@CampaignForge[${entryId}]{${cleanMode}}`;
}

export { EMBED_MIME };

export function registerJournalEntryIntegration({ getEngine, openCampaignForge } = {}) {
  getEngineRef = typeof getEngine === "function" ? getEngine : getEngineRef;
  openForgeRef = typeof openCampaignForge === "function" ? openCampaignForge : openForgeRef;
  if (registered) return;
  registered = true;

  CONFIG.TextEditor ??= {};
  CONFIG.TextEditor.enrichers ??= [];
  if (!CONFIG.TextEditor.enrichers.some(enricher => enricher?.id === `${MODULE_ID}.entry`)) {
    CONFIG.TextEditor.enrichers.push({
      id: `${MODULE_ID}.entry`,
      pattern: EMBED_PATTERN,
      enricher: enrichCampaignEntry,
      replaceParent: true
    });
  }

  document.addEventListener("change", onDocumentChange, true);
  document.addEventListener("click", onDocumentClick, true);
}

export async function refreshJournalEmbeds(entryId = null) {
  const selector = entryId
    ? `.cf-journal-embed[data-entry-id="${CSS.escape(String(entryId))}"]`
    : ".cf-journal-embed[data-entry-id]";
  const elements = [...document.querySelectorAll(selector)];
  if (!elements.length) return;
  const engine = getEngineRef?.();
  if (!engine) return;
  const state = await engine.getState();
  const byId = new Map(state.entries.map(entry => [entry.id, entry]));
  for (const current of elements) {
    const id = current.dataset.entryId;
    const mode = current.dataset.mode ?? "card";
    const entry = byId.get(id);
    const replacement = entry ? createEntryEmbed(entry, mode) : createMissingEmbed(id);
    current.replaceWith(replacement);
  }
}
