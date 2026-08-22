import { MODULE_ID, SETTINGS, STORAGE } from "../core/constants.js";

let journalIntegrationRegistered = false;

function rootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (html?.element instanceof HTMLElement) return html.element;
  return null;
}


function hideInternalStorageDocuments(root) {
  if (!root) return;
  const ids = new Set();
  const docs = game.journal?.contents ?? (typeof game.journal?.values === "function" ? Array.from(game.journal.values()) : []);
  for (const document of docs) {
    const meta = document?.getFlag?.(MODULE_ID, STORAGE.FLAG_META)
      ?? document?.flags?.[MODULE_ID]?.[STORAGE.FLAG_META];
    if (meta?.internal === true) ids.add(String(document.id));
  }
  if (!ids.size) return;
  for (const row of root.querySelectorAll("[data-entry-id], [data-document-id]")) {
    const id = String(row.dataset.entryId ?? row.dataset.documentId ?? "");
    if (ids.has(id)) row.hidden = true;
  }
}

export function injectJournalButton(app, html, openCampaignForge) {
  const root = rootElement(html) ?? rootElement(app?.element);
  if (!root) return;
  hideInternalStorageDocuments(root);
  if (!game.settings.get(MODULE_ID, SETTINGS.SHOW_JOURNAL_BUTTON)) return;
  if (root.querySelector("[data-campaign-forge-journal-button]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "campaign-forge-journal-button";
  button.dataset.campaignForgeJournalButton = "true";
  button.title = game.i18n.localize(game.user?.isGM ? "CAMPAIGN_FORGE.JournalButton.Tooltip" : "CAMPAIGN_FORGE.PlayerView.JournalButtonTooltip");
  button.setAttribute("aria-label", button.title);
  button.innerHTML = '<i class="fa-solid fa-book-open"></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openCampaignForge();
  });

  const candidates = [
    root.querySelector(".directory-header .header-actions"),
    root.querySelector(".directory-header .action-buttons"),
    root.querySelector(".directory-header")
  ].filter(Boolean);

  const target = candidates[0];
  if (target) target.append(button);
}

export function registerJournalIntegration(openCampaignForge) {
  if (journalIntegrationRegistered) return;
  journalIntegrationRegistered = true;

  Hooks.on("renderJournalDirectory", (app, html) => {
    injectJournalButton(app, html, openCampaignForge);
  });
}
