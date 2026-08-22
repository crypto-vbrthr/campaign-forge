import { MODULE_ID, SETTINGS } from "./core/constants.js";
import { registerSettings } from "./core/settings.js";
import { FoundryCampaignRepository } from "./data/foundry-repository.js";
import { CampaignEngine } from "./engine/campaign-engine.js";
import { CampaignForgeApp } from "./app/campaign-forge-app.js";
import { injectJournalButton, registerJournalIntegration } from "./integrations/journal-sidebar.js";
import { campaignEntryEmbedSyntax, refreshJournalEmbeds, registerJournalEntryIntegration } from "./integrations/journal-entries.js";
import { FoundryRewardExecutor } from "./integrations/reward-provider.js";
import { FoundryForgeProviderRegistry } from "./integrations/forge-provider-registry.js";

let engine = null;
let app = null;
let providers = null;

function requireGM() {
  if (!game.user?.isGM) {
    throw new Error("Campaign Forge mutations are currently GM-only.");
  }
}

export function openCampaignForge(target = null) {
  if (!game.user?.isGM) {
    ui.notifications.warn(game.i18n.localize("CAMPAIGN_FORGE.Errors.GMOnly"));
    return null;
  }
  if (!app) app = new CampaignForgeApp(engine, { providers });
  app.render({ force: true });
  if (target?.targetType && target?.targetId) app.focusTarget?.(target.targetType, target.targetId);
  return app;
}

function exposeApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;

  module.api = {
    version: "0.7.1",
    open: openCampaignForge,
    getState: () => engine.getState(),
    getJournalEmbedSyntax: (entryId, mode = "card") => campaignEntryEmbedSyntax(entryId, mode),
    createGroup: data => {
      requireGM();
      return engine.createGroup(data);
    },
    updateGroup: (id, data) => {
      requireGM();
      return engine.updateGroup(id, data);
    },
    createEntry: data => {
      requireGM();
      return engine.createEntry(data);
    },
    updateEntry: (id, data) => {
      requireGM();
      return engine.updateEntry(id, data);
    },
    addExternalLink: (entryId, data) => {
      requireGM();
      return engine.addExternalLink(entryId, data);
    },
    updateExternalLink: (entryId, linkId, data) => {
      requireGM();
      return engine.updateExternalLink(entryId, linkId, data);
    },
    removeExternalLink: (entryId, linkId) => {
      requireGM();
      return engine.removeExternalLink(entryId, linkId);
    },
    getIntegrationStatus: () => providers?.listStatus?.() ?? [],
    integrations: Object.freeze({
      getStatus: () => providers?.listStatus?.() ?? [],
      getApi: providerId => providers?.getApi?.(providerId) ?? null
    }),
    addJournalLink: (entryId, data) => {
      requireGM();
      return engine.addJournalLink(entryId, data);
    },
    updateJournalLink: (entryId, linkId, data) => {
      requireGM();
      return engine.updateJournalLink(entryId, linkId, data);
    },
    removeJournalLink: (entryId, linkId) => {
      requireGM();
      return engine.removeJournalLink(entryId, linkId);
    },
    setEntryStatus: (id, status, options) => {
      requireGM();
      return engine.setEntryStatus(id, status, options);
    },
    previewEntryStatusTransition: (id, status) => engine.previewEntryStatusTransition(id, status),
    createTransitionRule: (entryId, data) => {
      requireGM();
      return engine.createTransitionRule(entryId, data);
    },
    updateTransitionRule: (entryId, ruleId, data) => {
      requireGM();
      return engine.updateTransitionRule(entryId, ruleId, data);
    },
    deleteTransitionRule: (entryId, ruleId) => {
      requireGM();
      return engine.deleteTransitionRule(entryId, ruleId);
    },
    createRewardRule: (entryId, data) => {
      requireGM();
      return engine.createRewardRule(entryId, data);
    },
    updateRewardRule: (entryId, ruleId, data) => {
      requireGM();
      return engine.updateRewardRule(entryId, ruleId, data);
    },
    deleteRewardRule: (entryId, ruleId) => {
      requireGM();
      return engine.deleteRewardRule(entryId, ruleId);
    },
    grantReward: (entryId, ruleId, rewardId) => {
      requireGM();
      return engine.grantReward(entryId, ruleId, rewardId);
    },
    skipReward: (entryId, ruleId, rewardId) => {
      requireGM();
      return engine.skipReward(entryId, ruleId, rewardId);
    },
    resetReward: (entryId, ruleId, rewardId) => {
      requireGM();
      return engine.resetReward(entryId, ruleId, rewardId);
    },
    startSession: () => {
      requireGM();
      return engine.startSession();
    },
    endSession: () => {
      requireGM();
      return engine.endSession();
    },
    createTracker: data => {
      requireGM();
      return engine.createTracker(data);
    },
    adjustTracker: (id, delta, options) => {
      requireGM();
      return engine.adjustTracker(id, delta, options);
    },
    createKeyPlayer: data => {
      requireGM();
      return engine.createKeyPlayer(data);
    },
    updateKeyPlayer: (id, data) => {
      requireGM();
      return engine.updateKeyPlayer(id, data);
    },
    markKeyPlayerSeen: id => {
      requireGM();
      return engine.markKeyPlayerSeen(id);
    },
    deleteKeyPlayer: id => {
      requireGM();
      return engine.deleteKeyPlayer(id);
    },
    moveKeyPlayerByOffset: (id, offset) => {
      requireGM();
      return engine.moveKeyPlayerByOffset(id, offset);
    },
    setOverviewPinned: (targetType, targetId, pinned = true) => {
      requireGM();
      return engine.setOverviewPinned(targetType, targetId, pinned);
    },
    moveOverviewPinByOffset: (pinId, offset) => {
      requireGM();
      return engine.moveOverviewPinByOffset(pinId, offset);
    }
  };
}

Hooks.once("init", () => {
  registerSettings();
  // Register the JournalDirectory render hook during init so it is already
  // listening when Foundry performs the sidebar's initial render.
  registerJournalIntegration(openCampaignForge);
  registerJournalEntryIntegration({ getEngine: () => engine, openCampaignForge });
});

Hooks.once("ready", async () => {
  providers = new FoundryForgeProviderRegistry();
  engine = new CampaignEngine(new FoundryCampaignRepository(), {
    userId: () => game.user?.id ?? null,
    gameTime: () => game.time?.worldTime ?? null,
    rewardExecutor: new FoundryRewardExecutor({ providers }),
    providerExecutor: providers
  });

  exposeApi();

  // Defensive fallback for worlds where the Journal directory was rendered
  // before ready. The injector is idempotent, so this cannot create a duplicate.
  if (game.user?.isGM) {
    const journal = ui.sidebar?.tabs?.journal;
    if (journal) injectJournalButton(journal, journal.element, openCampaignForge);
  }

  Hooks.on("updateSetting", setting => {
    if (!game.user?.isGM) return;
    if (setting?.key !== `${MODULE_ID}.${SETTINGS.DATA}`) return;
    if (app?.rendered) app.render();
    refreshJournalEmbeds().catch(error => console.warn(`${MODULE_ID} | Could not refresh Journal embeds`, error));
  });

  console.info(`${MODULE_ID} | Ready`);
});
