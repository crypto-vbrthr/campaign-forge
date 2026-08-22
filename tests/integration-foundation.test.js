import test from "node:test";
import assert from "node:assert/strict";

import { CampaignEngine, CampaignEngineError } from "../scripts/engine/campaign-engine.js";
import { FoundryForgeProviderRegistry } from "../scripts/integrations/forge-provider-registry.js";
import { MemoryRepository, deterministicOptions } from "./helpers.js";

function engineWithProvider(providerExecutor = null) {
  const repository = new MemoryRepository();
  const engine = new CampaignEngine(repository, { ...deterministicOptions(), providerExecutor });
  return { engine, repository };
}

test("external Forge references can be added, updated, removed, and are session logged", async () => {
  const { engine } = engineWithProvider();
  const entry = await engine.createEntry({ title: "Ostwall", type: "location" });
  await engine.startSession();

  const link = await engine.addExternalLink(entry.id, {
    provider: "cityForge",
    kind: "settlement",
    targetId: "settlement-1",
    label: "Ostwall",
    meta: { settlementName: "Ostwall" }
  });
  assert.equal(link.provider, "cityForge");
  assert.equal(link.targetId, "settlement-1");

  const updated = await engine.updateExternalLink(entry.id, link.id, {
    kind: "district",
    subTargetId: "district-1",
    label: "Unterstadt"
  });
  assert.equal(updated.kind, "district");
  assert.equal(updated.subTargetId, "district-1");

  await assert.rejects(
    () => engine.addExternalLink(entry.id, {
      provider: "cityForge",
      kind: "district",
      targetId: "settlement-1",
      subTargetId: "district-1"
    }),
    error => error instanceof CampaignEngineError && error.code === "EXTERNAL_LINK_EXISTS"
  );

  const removed = await engine.removeExternalLink(entry.id, link.id);
  assert.equal(removed.id, link.id);

  const state = await engine.getState();
  assert.equal(state.entries.find(candidate => candidate.id === entry.id).externalLinks.length, 0);
  const changes = state.sessions[0].changes.filter(change => change.action.startsWith("entry.externalLink."));
  assert.deepEqual(changes.map(change => change.action), [
    "entry.externalLink.added",
    "entry.externalLink.updated",
    "entry.externalLink.removed"
  ]);
});

test("provider transition actions appear in preview without executing", async () => {
  const calls = [];
  const providerExecutor = {
    validateAction: () => ({ valid: true }),
    executeAction: async action => { calls.push(action); return { ok: true }; }
  };
  const { engine } = engineWithProvider(providerExecutor);
  const source = await engine.createEntry({ title: "Mine sichern", type: "quest", status: "active" });

  await engine.createTransitionRule(source.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [{
      type: "providerAction",
      provider: "cityForge",
      action: "applyStatePatch",
      targetId: "ostwall",
      payload: { operation: "setDimension", dimension: "security", value: "good" }
    }]
  });

  const preview = await engine.previewEntryStatusTransition(source.id, "completed");
  assert.equal(calls.length, 0);
  assert.equal(preview.consequences.length, 1);
  assert.equal(preview.consequences[0].kind, "provider.action");
  assert.equal(preview.consequences[0].provider, "cityForge");
  assert.equal(preview.consequences[0].payload.dimension, "security");
});

test("provider transition actions execute once and share the session transaction", async () => {
  const calls = [];
  const providerExecutor = {
    validateAction: () => ({ valid: true }),
    executeAction: async (action, context) => {
      calls.push({ action, context });
      return { state: { settlement: { name: "Ostwall" } }, changedPaths: ["state.security"] };
    }
  };
  const { engine } = engineWithProvider(providerExecutor);
  const source = await engine.createEntry({ title: "Mine sichern", type: "quest", status: "active" });

  await engine.createTransitionRule(source.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [{
      type: "providerAction",
      provider: "cityForge",
      action: "applyStatePatch",
      targetId: "ostwall",
      payload: { operation: "setDimension", dimension: "security", value: "good" }
    }]
  });

  await engine.startSession();
  await engine.setEntryStatus(source.id, "completed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action.targetId, "ostwall");
  assert.equal(calls[0].context.entryId, source.id);

  const state = await engine.getState();
  const statusChange = state.sessions[0].changes.find(change => change.action === "entry.status");
  const providerChange = state.sessions[0].changes.find(change => change.action === "provider.action");
  assert.ok(statusChange);
  assert.ok(providerChange);
  assert.equal(providerChange.targetTitle, "Ostwall");
  assert.equal(providerChange.transactionId, statusChange.transactionId);
  assert.equal(providerChange.details.provider, "cityForge");
});

test("provider registry reports optional module readiness and capabilities", () => {
  const modules = new Map([
    ["pf2e-city-forge", {
      active: true,
      version: "1.0.1",
      api: {
        settlements: { list() {} },
        integrations: { campaign: { getContext() {}, applyStatePatch() {} } },
        ui: { openEditor() {} }
      }
    }],
    ["pf2e-npc-forge", { active: false, version: "1.0.0", api: { ui: { open() {} } } }],
    ["pf2e-weather-forge", { active: true, version: "1.1.3", api: null }]
  ]);
  const registry = new FoundryForgeProviderRegistry({ getModule: id => modules.get(id) ?? null });

  const city = registry.inspect("cityForge");
  assert.equal(city.ready, true);
  assert.equal(city.capabilities.references, true);
  assert.equal(city.capabilities.stateActions, true);
  assert.equal(city.capabilities.open, true);

  const npc = registry.inspect("npcForge");
  assert.equal(npc.installed, true);
  assert.equal(npc.active, false);
  assert.equal(npc.ready, false);

  const weather = registry.inspect("weatherForge");
  assert.equal(weather.active, true);
  assert.equal(weather.apiExposed, false);
  assert.equal(weather.ready, false);

  const loot = registry.inspect("lootForge");
  assert.equal(loot.installed, false);
  assert.equal(loot.ready, false);
});

test("City Forge provider actions compile to the public state-patch contract", async () => {
  const patches = [];
  const cityApi = {
    integrations: {
      campaign: {
        applyStatePatch: async (settlementId, patch, options) => {
          patches.push({ settlementId, patch, options });
          return { settlementId, state: { settlement: { name: "Ostwall" } } };
        }
      }
    }
  };
  const registry = new FoundryForgeProviderRegistry({
    getModule: id => id === "pf2e-city-forge" ? { active: true, version: "1.0.1", api: cityApi } : null
  });

  await registry.executeAction({
    provider: "cityForge", action: "applyStatePatch", targetId: "ostwall",
    payload: { operation: "setDimension", dimension: "mood", value: "poor" }
  }, { entryId: "quest-1", entryTitle: "Belagerung" });
  await registry.executeAction({
    provider: "cityForge", action: "applyStatePatch", targetId: "ostwall",
    payload: { operation: "setConditionEnabled", conditionId: "siege", enabled: false }
  });
  await registry.executeAction({
    provider: "cityForge", action: "applyStatePatch", targetId: "ostwall",
    payload: { operation: "setThreatActive", threatId: "orc-army", enabled: true }
  });

  assert.deepEqual(patches[0].patch, { dimensions: { mood: "poor" } });
  assert.deepEqual(patches[1].patch, { conditions: { disableIds: ["siege"] } });
  assert.deepEqual(patches[2].patch, { activeThreats: { add: ["orc-army"] } });
  assert.deepEqual(patches[0].options.source, { type: "campaign", id: "quest-1", label: "Belagerung" });
});

test("City Forge provider validation rejects incomplete state actions before execution", () => {
  const registry = new FoundryForgeProviderRegistry({ getModule: () => null });
  assert.deepEqual(registry.validateAction({
    provider: "cityForge", action: "applyStatePatch", targetId: "ostwall",
    payload: { operation: "setDimension", dimension: "unknown", value: "normal" }
  }), { valid: false, code: "INVALID_PROVIDER_ACTION" });
  assert.deepEqual(registry.validateAction({
    provider: "cityForge", action: "applyStatePatch", targetId: "ostwall",
    payload: { operation: "setConditionEnabled", conditionId: "" }
  }), { valid: false, code: "INVALID_PROVIDER_ACTION" });
  assert.deepEqual(registry.validateAction({
    provider: "cityForge", action: "applyStatePatch", targetId: "ostwall",
    payload: { operation: "setThreatActive", threatId: "" }
  }), { valid: false, code: "INVALID_PROVIDER_ACTION" });
});

test("provider registry exposes Loot Forge and Item Forge reward capabilities", () => {
  const modules = new Map([
    ["pf2e-loot-forge", {
      active: true,
      version: "0.3.5",
      api: {
        generateLoot() {},
        createEmbeddedEditor() {},
        addLootToActor() {}
      }
    }],
    ["pf2e-item-forge", {
      active: true,
      version: "0.0.37-rc.1",
      api: {
        generate() {},
        preview() {},
        open() {},
        getCapabilities() { return { embeddedEditor: true }; }
      }
    }]
  ]);
  const registry = new FoundryForgeProviderRegistry({ getModule: id => modules.get(id) ?? null });

  const loot = registry.inspect("lootForge");
  assert.equal(loot.ready, true);
  assert.equal(loot.capabilities.generate, true);
  assert.equal(loot.capabilities.embeddedEditor, true);
  assert.equal(loot.capabilities.actorDelivery, true);

  const item = registry.inspect("itemForge");
  assert.equal(item.ready, true);
  assert.equal(item.capabilities.generate, true);
  assert.equal(item.capabilities.preview, true);
  assert.equal(item.capabilities.embeddedEditor, true);
});
