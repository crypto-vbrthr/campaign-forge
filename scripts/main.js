import { MODULE_ID, SETTINGS } from "./core/constants.js";
import { registerSettings } from "./core/settings.js";
import { FoundryCampaignRepository } from "./data/foundry-repository.js";
import { CampaignEngine } from "./engine/campaign-engine.js";
import { CampaignForgeApp } from "./app/campaign-forge-app.js";
import { injectJournalButton, registerJournalIntegration } from "./integrations/journal-sidebar.js";

let engine = null;
let app = null;

function requireGM() {
  if (!game.user?.isGM) {
    throw new Error("Campaign Forge mutations are currently GM-only.");
  }
}

export function openCampaignForge() {
  if (!game.user?.isGM) {
    ui.notifications.warn(game.i18n.localize("CAMPAIGN_FORGE.Errors.GMOnly"));
    return null;
  }
  if (!app) app = new CampaignForgeApp(engine);
  app.render({ force: true });
  return app;
}

function exposeApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;

  module.api = {
    version: "0.2.1",
    open: openCampaignForge,
    getState: () => engine.getState(),
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
    setEntryStatus: (id, status, options) => {
      requireGM();
      return engine.setEntryStatus(id, status, options);
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
});

Hooks.once("ready", async () => {
  engine = new CampaignEngine(new FoundryCampaignRepository(), {
    userId: () => game.user?.id ?? null,
    gameTime: () => game.time?.worldTime ?? null
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
  });

  console.info(`${MODULE_ID} | Ready`);
});
