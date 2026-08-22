import { MODULE_ID, SETTINGS } from "../core/constants.js";

let journalIntegrationRegistered = false;

function rootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (html?.element instanceof HTMLElement) return html.element;
  return null;
}

export function injectJournalButton(app, html, openCampaignForge) {
  if (!game.settings.get(MODULE_ID, SETTINGS.SHOW_JOURNAL_BUTTON)) return;

  const root = rootElement(html) ?? rootElement(app?.element);
  if (!root || root.querySelector("[data-campaign-forge-journal-button]")) return;

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
