import { MODULE_ID } from "./core/constants.js";
import { registerSettings } from "./core/settings.js";
import { CampaignStorageError, FoundryCampaignRepository } from "./data/foundry-repository.js";
import { CampaignEngine } from "./engine/campaign-engine.js";
import { CampaignForgeApp } from "./app/campaign-forge-app.js";
import { PlayerCampaignForgeApp } from "./player/player-campaign-forge-app.js";
import { buildPlayerProjection } from "./player/player-projection.js";
import { injectJournalButton, registerJournalIntegration } from "./integrations/journal-sidebar.js";
import { campaignEntryEmbedSyntax, refreshJournalEmbeds, registerJournalEntryIntegration } from "./integrations/journal-entries.js";
import { FoundryRewardExecutor } from "./integrations/reward-provider.js";
import { FoundryForgeProviderRegistry } from "./integrations/forge-provider-registry.js";

let engine = null;
let app = null;
let playerApp = null;
let providers = null;
let repository = null;
let projectionRefreshTimer = null;

function requireGM() {
  if (!game.user?.isGM) {
    throw new Error("Campaign Forge mutations are currently GM-only.");
  }
}

export function openPlayerCampaignForge() {
  if (!playerApp) playerApp = new PlayerCampaignForgeApp(engine);
  playerApp.render({ force: true });
  return playerApp;
}

export function openCampaignForge(target = null) {
  if (!game.user?.isGM) return openPlayerCampaignForge();
  if (!app) app = new CampaignForgeApp(engine, { providers, openPlayerView: openPlayerCampaignForge });
  app.render({ force: true });
  if (target?.targetType && target?.targetId) app.focusTarget?.(target.targetType, target.targetId);
  return app;
}

function exposeApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;

  module.api = {
    version: module.version ?? "1.0.0",
    apiVersion: 1,
    stability: "stable",
    schemaVersion: 2,
    contracts: Object.freeze({
      api: 1,
      stateSchema: 2,
      playerProjection: 1,
      journalEmbed: 1,
      protectedStorage: 1
    }),
    hooks: Object.freeze({
      ready: "campaignForge.ready"
    }),
    getCapabilities: () => Object.freeze({
      playerView: true,
      protectedPersistence: true,
      sessions: true,
      transitionRules: true,
      rewardRules: true,
      journalEmbeds: true,
      forgeProviders: true,
      backups: true
    }),
    open: openCampaignForge,
    openPlayerView: openPlayerCampaignForge,
    getState: async () => {
      const state = await engine.getState();
      return game.user?.isGM ? state : buildPlayerProjection(state);
    },
    getPlayerState: async () => buildPlayerProjection(await engine.getState()),
    exportState: async () => {
      requireGM();
      return engine.getState();
    },
    importState: rawState => {
      requireGM();
      return engine.replaceState(rawState);
    },
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
    captureEntryWeather: async entryId => {
      requireGM();
      const snapshot = await providers?.getCurrentWeatherSnapshot?.();
      if (!snapshot) throw new Error("Weather Forge context is unavailable.");
      return engine.setEntryWeatherSnapshot(entryId, snapshot, { source: "api" });
    },
    clearEntryWeather: entryId => {
      requireGM();
      return engine.setEntryWeatherSnapshot(entryId, null, { source: "api" });
    },
    getIntegrationStatus: () => providers?.listStatus?.() ?? [],
    integrations: Object.freeze({
      getStatus: () => providers?.listStatus?.() ?? [],
      getApi: providerId => {
        requireGM();
        return providers?.getApi?.(providerId) ?? null;
      }
    }),
    storage: Object.freeze({
      getStatus: () => {
        requireGM();
        return repository?.getStatus?.() ?? null;
      },
      refreshPlayerProjections: async () => {
        requireGM();
        return repository?.refreshPlayerProjections?.();
      }
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
    previewEntryStatusTransition: (id, status) => {
      requireGM();
      return engine.previewEntryStatusTransition(id, status);
    },
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
    startSession: async () => {
      requireGM();
      const weatherSnapshot = await providers?.getCurrentWeatherSnapshot?.().catch?.(() => null) ?? null;
      return engine.startSession({ weatherSnapshot });
    },
    endSession: () => {
      requireGM();
      return engine.endSession();
    },
    deleteSession: sessionId => {
      requireGM();
      return engine.deleteSession(sessionId);
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
    },
    setOverviewPlayerVisible: (pinId, visible = true) => {
      requireGM();
      return engine.setOverviewPlayerVisible(pinId, visible);
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
  repository = new FoundryCampaignRepository();
  let storageReady = false;
  try {
    await repository.initialize();
    storageReady = true;
  } catch (error) {
    console.error(`${MODULE_ID} | Protected storage initialization failed`, error);
    const key = error instanceof CampaignStorageError && error.code === "VAULT_MISSING"
      ? "CAMPAIGN_FORGE.Security.VaultMissing"
      : "CAMPAIGN_FORGE.Security.StorageInitFailed";
    ui.notifications?.error?.(game.i18n.localize(key), { permanent: true });
  }

  engine = new CampaignEngine(repository, {
    userId: () => game.user?.id ?? null,
    gameTime: () => game.time?.worldTime ?? null,
    rewardExecutor: new FoundryRewardExecutor({ providers }),
    providerExecutor: providers
  });

  exposeApi();
  if (storageReady) Hooks.callAll("campaignForge.ready", game.modules.get(MODULE_ID)?.api ?? null);

  if (game.user?.isGM && repository?.migratedThisRun) {
    ui.notifications?.info?.(game.i18n.localize("CAMPAIGN_FORGE.Security.MigrationComplete"));
  }

  // Defensive fallback for worlds where the Journal directory was rendered
  // before ready. The injector is idempotent, so this cannot create a duplicate.
  {
    const journal = ui.sidebar?.tabs?.journal;
    if (journal) injectJournalButton(journal, journal.element, openCampaignForge);
  }

  const rerenderStorageConsumer = document => {
    if (!repository?.isStorageDocument?.(document)) return;
    if (repository.isVaultDocument(document)) {
      if (game.user?.isGM && app?.rendered) app.render();
    } else if (repository.isProjectionDocument(document, game.user?.id)) {
      if (playerApp?.rendered) playerApp.render();
    }
    refreshJournalEmbeds().catch(error => console.warn(`${MODULE_ID} | Could not refresh Journal embeds`, error));
  };

  const scheduleProjectionRefresh = () => {
    if (!game.user?.isGM || !repository?.refreshPlayerProjections) return;
    clearTimeout(projectionRefreshTimer);
    projectionRefreshTimer = setTimeout(() => {
      repository.refreshPlayerProjections().catch(error =>
        console.warn(`${MODULE_ID} | Could not refresh player projections`, error));
    }, 100);
  };

  Hooks.on("updateJournalEntry", (document, changes) => {
    if (repository?.isStorageDocument?.(document)) return rerenderStorageConsumer(document);
    if (Object.prototype.hasOwnProperty.call(changes ?? {}, "ownership")) scheduleProjectionRefresh();
  });
  Hooks.on("deleteJournalEntry", document => {
    if (repository?.isVaultDocument?.(document) && game.user?.isGM) {
      ui.notifications?.error?.(game.i18n.localize("CAMPAIGN_FORGE.Security.VaultDeleted"), { permanent: true });
      return;
    }
    if (repository?.isProjectionDocument?.(document)) {
      scheduleProjectionRefresh();
      return;
    }
    if (!repository?.isStorageDocument?.(document)) scheduleProjectionRefresh();
  });
  Hooks.on("updateActor", (_document, changes) => {
    if (Object.prototype.hasOwnProperty.call(changes ?? {}, "ownership")) scheduleProjectionRefresh();
  });
  Hooks.on("createUser", scheduleProjectionRefresh);
  Hooks.on("updateUser", (_user, changes) => {
    if (Object.prototype.hasOwnProperty.call(changes ?? {}, "role") || Object.prototype.hasOwnProperty.call(changes ?? {}, "active")) scheduleProjectionRefresh();
  });
  Hooks.on("deleteUser", scheduleProjectionRefresh);

  console.info(`${MODULE_ID} | Ready`);
});
