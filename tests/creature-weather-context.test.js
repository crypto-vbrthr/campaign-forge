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

test("sessions preserve a historical Weather Forge snapshot", async () => {
  const engine = makeEngine();
  const snapshot = {
    schema: "campaign-forge/weather-snapshot",
    version: 1,
    weather: { temperature: 7, precipitation: "rain" },
    location: { settlementName: "Ostwall" }
  };
  const session = await engine.startSession({ weatherSnapshot: snapshot });
  snapshot.weather.temperature = 99;
  const state = await engine.getState();
  const stored = state.sessions.find(s => s.id === session.id);
  assert.equal(stored.weatherSnapshot.weather.temperature, 7);
  assert.equal(stored.weatherSnapshot.location.settlementName, "Ostwall");
});

test("Event entries can capture and clear weather snapshots and log those changes", async () => {
  const engine = makeEngine();
  const event = await engine.createEntry({ title: "Attack on the gate", type: "event" });
  await engine.startSession();
  await engine.setEntryWeatherSnapshot(event.id, { weather: { temperature: 4 } });
  let state = await engine.getState();
  let stored = state.entries.find(e => e.id === event.id);
  assert.equal(stored.weatherSnapshot.weather.temperature, 4);
  assert.equal(state.sessions[0].changes.at(-1).action, "entry.weather.captured");
  await engine.setEntryWeatherSnapshot(event.id, null);
  state = await engine.getState();
  stored = state.entries.find(e => e.id === event.id);
  assert.equal(stored.weatherSnapshot, null);
  assert.equal(state.sessions[0].changes.at(-1).action, "entry.weather.cleared");
});

test("Weather snapshots are restricted to Event entries", async () => {
  const engine = makeEngine();
  const quest = await engine.createEntry({ title: "Quest", type: "quest" });
  await assert.rejects(
    () => engine.setEntryWeatherSnapshot(quest.id, { weather: { temperature: 4 } }),
    error => error instanceof CampaignEngineError && error.code === "WEATHER_SNAPSHOT_EVENT_ONLY"
  );
});

test("Creature Forge capability detection includes embedded creation and Actor creation", () => {
  const modules = new Map([["pf2e-creature-forge", {
    active: true,
    version: "1.0.0",
    api: {
      createActor() {},
      ui: { openCreatureForge() {}, creatureEditor: { create() {} } }
    }
  }]]);
  const registry = new FoundryForgeProviderRegistry({ getModule: id => modules.get(id) ?? null });
  const status = registry.inspect("creatureForge");
  assert.equal(status.ready, true);
  assert.equal(status.capabilities.embeddedEditor, true);
  assert.equal(status.capabilities.createActor, true);
  assert.equal(status.capabilities.open, true);
});

test("Weather Forge current context is normalized into a stable Campaign snapshot", async () => {
  const modules = new Map([["pf2e-weather-forge", {
    active: true,
    version: "1.1.1",
    api: {
      getWeather: () => ({ temperature: 13 }),
      getCurrentWeatherContext: async () => ({
        weather: {
          temperature: 9,
          precipitation: "rain",
          timeSegment: "evening",
          month: "lamashan",
          dayOfMonth: 17,
          year: 4726,
          season: "autumn"
        },
        climateResolution: { source: "cityForge", sceneUuid: "Scene.1" },
        provenance: {
          settlementId: "ostwall",
          settlementName: "Ostwall",
          districtId: "harbor",
          districtName: "Harbor"
        },
        mismatch: false
      })
    }
  }]]);
  const registry = new FoundryForgeProviderRegistry({ getModule: id => modules.get(id) ?? null });
  const snapshot = await registry.getCurrentWeatherSnapshot();
  assert.equal(snapshot.weather.temperature, 9);
  assert.equal(snapshot.weather.precipitation, "rain");
  assert.equal(snapshot.location.settlementName, "Ostwall");
  assert.equal(snapshot.location.districtName, "Harbor");
  assert.equal(snapshot.source, "cityForge");
  assert.equal(snapshot.providerVersion, "1.1.1");
});

test("Campaign UI exposes Creature Forge linking and Event weather capture controls", () => {
  const template = fs.readFileSync(new URL("../templates/campaign-forge.hbs", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../scripts/app/campaign-forge-app.js", import.meta.url), "utf8");
  assert.match(template, /data-cf-creature-link-drop/);
  assert.match(template, /data-action="createCreatureWithForge"/);
  assert.match(template, /data-action="captureEntryWeather"/);
  assert.match(template, /weatherSnapshotView/);
  assert.match(app, /class CampaignCreatureForgeHostApp/);
  assert.match(app, /getCurrentWeatherSnapshot/);
});

test("Creature Forge ApplicationV2 host keeps the embedded editor height constrained", () => {
  const css = fs.readFileSync(new URL("../styles/campaign-forge.css", import.meta.url), "utf8");
  const template = fs.readFileSync(new URL("../templates/creature-forge-host.hbs", import.meta.url), "utf8");
  assert.match(css, /\.campaign-forge\.cf-creature-forge-host-app \.window-content/);
  assert.match(css, /\.campaign-forge\.cf-creature-forge-host-app \.cf-creature-forge-host\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(template, /data-cf-creature-forge-host/);
  assert.match(template, /data-action="creatureCreateLink"/);
});


test("linked Creature Forge Actors render inside the Creature Forge section", () => {
  const template = fs.readFileSync(new URL("../templates/campaign-forge.hbs", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../scripts/app/campaign-forge-app.js", import.meta.url), "utf8");
  assert.match(app, /const creatureLinks = externalLinks\.filter/);
  assert.match(app, /links: creatureLinks/);
  assert.match(template, /editor\.creatureIntegration\.hasLinks/);
  assert.match(template, /editor\.creatureIntegration\.links/);
  assert.match(template, /cf-creature-linked-row/);
});

test("Creature Forge links are not duplicated in the generic external-link list", () => {
  const app = fs.readFileSync(new URL("../scripts/app/campaign-forge-app.js", import.meta.url), "utf8");
  const template = fs.readFileSync(new URL("../templates/campaign-forge.hbs", import.meta.url), "utf8");
  assert.match(app, /const generalExternalLinks = externalLinks\.filter/);
  assert.match(template, /editor\.generalExternalLinks/);
});
