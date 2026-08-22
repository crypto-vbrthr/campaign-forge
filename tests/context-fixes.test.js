import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CampaignEngine, CampaignEngineError } from "../scripts/engine/campaign-engine.js";
import { FoundryForgeProviderRegistry } from "../scripts/integrations/forge-provider-registry.js";
import { MemoryRepository } from "./helpers.js";

function makeEngine() {
  let now = 1000;
  return new CampaignEngine(new MemoryRepository(), {
    now: () => ++now,
    idFactory: (() => { let id = 0; return () => `id-${++id}`; })(),
    userId: () => "gm",
    gameTime: () => 42
  });
}

test("Weather Forge session snapshot falls back to getWeather when context read fails", async () => {
  const modules = new Map([["pf2e-weather-forge", {
    active: true,
    version: "1.1.3",
    api: {
      getCurrentWeatherContext: async () => { throw new Error("context unavailable"); },
      getWeather: () => ({
        temperature: 8,
        precipitation: "rain",
        timeSegment: "evening",
        month: "lamashan",
        dayOfMonth: 12,
        year: 4726
      })
    }
  }]]);
  const registry = new FoundryForgeProviderRegistry({ getModule: id => modules.get(id) ?? null });
  const snapshot = await registry.getCurrentWeatherSnapshot();
  assert.equal(snapshot.weather.temperature, 8);
  assert.equal(snapshot.weather.precipitation, "rain");
});

test("completed sessions can be deleted but active sessions cannot", async () => {
  const engine = makeEngine();
  const first = await engine.startSession();
  await engine.endSession();
  const deleted = await engine.deleteSession(first.id);
  assert.equal(deleted.id, first.id);
  assert.equal((await engine.getState()).sessions.length, 0);

  const active = await engine.startSession();
  await assert.rejects(
    () => engine.deleteSession(active.id),
    error => error instanceof CampaignEngineError && error.code === "ACTIVE_SESSION_CANNOT_BE_DELETED"
  );
});

test("deleting a session repairs key-player last appearance references", async () => {
  const engine = makeEngine();
  const keyPlayer = await engine.createKeyPlayer({ actorUuid: "Actor.test", actorName: "Mushka" });
  const first = await engine.startSession();
  await engine.markKeyPlayerSeen(keyPlayer.id);
  await engine.endSession();
  const second = await engine.startSession();
  await engine.markKeyPlayerSeen(keyPlayer.id);
  await engine.endSession();

  await engine.deleteSession(second.id);
  const state = await engine.getState();
  assert.equal(state.keyPlayers[0].lastSeenSessionId, first.id);
});

test("campaign editor labels entry checkboxes and completed sessions expose deletion control", () => {
  const template = fs.readFileSync(new URL("../templates/campaign-forge.hbs", import.meta.url), "utf8");
  assert.match(template, /name="active"[\s\S]*CAMPAIGN_FORGE\.Fields\.Active/);
  assert.match(template, /name="visible"[\s\S]*CAMPAIGN_FORGE\.Fields\.Visible/);
  assert.match(template, /data-action="deleteSession"/);
});

test("Weather Forge snapshot can read persisted weather when the provider setting is not registered", async () => {
  const previousGame = globalThis.game;
  const modules = new Map([["pf2e-weather-forge", {
    active: true,
    version: "1.1.3",
    api: {
      getCurrentWeatherContext: async () => { throw new Error('"pf2e-weather-forge.weatherState" is not a registered game setting'); },
      getWeather: () => { throw new Error('"pf2e-weather-forge.weatherState" is not a registered game setting'); }
    }
  }]]);
  globalThis.game = {
    settings: {
      settings: new Map(),
      storage: new Map([["world", new Map([[
        "pf2e-weather-forge.weatherState",
        { value: { temperature: 3, precipitation: "snow", timeSegment: "night", month: "kuthona", dayOfMonth: 4, year: 4726 } }
      ]])]])
    }
  };

  try {
    const registry = new FoundryForgeProviderRegistry({ getModule: id => modules.get(id) ?? null });
    const snapshot = await registry.getCurrentWeatherSnapshot();
    assert.equal(snapshot.weather.temperature, 3);
    assert.equal(snapshot.weather.precipitation, "snow");
    assert.equal(snapshot.weather.timeSegment, "night");
  } finally {
    globalThis.game = previousGame;
  }
});

test("entry active/visible labels are prepared as text and forced visible by module-scoped CSS", () => {
  const template = fs.readFileSync(new URL("../templates/campaign-forge.hbs", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../scripts/app/campaign-forge-app.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles/campaign-forge.css", import.meta.url), "utf8");
  assert.match(template, /cf-entry-boolean-fields/);
  assert.match(template, /\{\{editor\.activeLabel\}\}/);
  assert.match(template, /\{\{editor\.visibleLabel\}\}/);
  assert.match(app, /activeLabel:\s*localize\("CAMPAIGN_FORGE\.Fields\.Active"\)/);
  assert.match(app, /visibleLabel:\s*localize\("CAMPAIGN_FORGE\.Fields\.Visible"\)/);
  assert.match(css, /\.campaign-forge \.cf-checkbox-row > \.cf-checkbox-label\{[\s\S]*visibility:\s*visible !important;[\s\S]*opacity:\s*1 !important;/);
});


test("active session is shown only in the live session card, not duplicated in session history", () => {
  const app = fs.readFileSync(new URL("../scripts/app/campaign-forge-app.js", import.meta.url), "utf8");
  assert.match(app, /const sessions = \[\.\.\.state\.sessions\][\s\S]*?\.filter\(session => session\.status === "closed"\)[\s\S]*?\.sort\(/);
});

test("entry active/visible checkbox layout pins each label beside its checkbox", () => {
  const css = fs.readFileSync(new URL("../styles/campaign-forge.css", import.meta.url), "utf8");
  assert.match(css, /\.campaign-forge \.cf-entry-boolean-fields\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2, max-content\);/);
  assert.match(css, /\.campaign-forge \.cf-checkbox-row\{[\s\S]*?display:\s*inline-grid !important;[\s\S]*?grid-template-columns:\s*1\.15rem max-content;/);
  assert.match(css, /\.campaign-forge \.cf-checkbox-row input\[type="checkbox"\]\{[\s\S]*?width:\s*1rem !important;[\s\S]*?margin:\s*0 !important;/);
});

test("active session renders its live changes before the closed-session history", () => {
  const app = fs.readFileSync(new URL("../scripts/app/campaign-forge-app.js", import.meta.url), "utf8");
  const template = fs.readFileSync(new URL("../templates/campaign-forge.hbs", import.meta.url), "utf8");
  assert.match(app, /const sessionChangesView = \(session\) =>/);
  assert.match(app, /const activeSessionView = activeSession \? \{[\s\S]*?changes: sessionChangesView\(activeSession\)/);
  assert.match(app, /activeSessionView\.changeCount = activeSessionView\.changes\.length/);
  assert.match(template, /cf-active-change-list[\s\S]*?\{\{#each activeSession\.changes\}\}[\s\S]*?data-action="editSessionChange"/);
});
