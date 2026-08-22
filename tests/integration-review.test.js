import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CampaignEngine } from "../scripts/engine/campaign-engine.js";
import { FoundryForgeProviderRegistry } from "../scripts/integrations/forge-provider-registry.js";
import { MemoryRepository, deterministicOptions } from "./helpers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function flatten(value, prefix = "", out = {}) {
  for (const [key, entry] of Object.entries(value ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) flatten(entry, full, out);
    else out[full] = entry;
  }
  return out;
}

test("main Campaign Forge workspace defaults to the reviewed larger desktop size", () => {
  const source = fs.readFileSync(path.join(root, "scripts/app/campaign-forge-app.js"), "utf8");
  const start = source.indexOf("export class CampaignForgeApp");
  const block = source.slice(start, start + 1600);
  assert.match(block, /width:\s*1220/);
  assert.match(block, /height:\s*800/);

  const css = fs.readFileSync(path.join(root, "styles/campaign-forge.css"), "utf8");
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) 370px/);
});

test("City Forge transition actions are dry-run preflighted and batched per settlement", async () => {
  const calls = [];
  const cityApi = {
    integrations: {
      campaign: {
        applyStatePatch: async (settlementId, patch, options = {}) => {
          calls.push({ settlementId, patch, options });
          return {
            revision: options.dryRun ? 7 : 8,
            state: { settlement: { id: settlementId, name: "Ostwall" } },
            changedPaths: ["state.security", "state.mood", "state.conditions"]
          };
        }
      }
    }
  };
  const registry = new FoundryForgeProviderRegistry({
    getModule: id => id === "pf2e-city-forge" ? { active: true, version: "1.0.1", api: cityApi } : null
  });

  const results = await registry.executeActions([
    {
      provider: "cityForge", action: "applyStatePatch", targetId: "ostwall",
      payload: { operation: "setDimension", dimension: "security", value: "good" }
    },
    {
      provider: "cityForge", action: "applyStatePatch", targetId: "ostwall",
      payload: { operation: "setDimension", dimension: "mood", value: "poor" }
    },
    {
      provider: "cityForge", action: "applyStatePatch", targetId: "ostwall",
      payload: { operation: "setConditionEnabled", conditionId: "siege", enabled: true }
    }
  ], { entryId: "quest-1", entryTitle: "Belagerung" });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.dryRun, true);
  assert.deepEqual(calls[0].patch, {
    dimensions: { security: "good", mood: "poor" },
    conditions: { enableIds: ["siege"] }
  });
  assert.equal(calls[1].options.dryRun, undefined);
  assert.equal(calls[1].options.expectedRevision, 7);
  assert.deepEqual(calls[1].options.source, { type: "campaign", id: "quest-1", label: "Belagerung" });
  assert.equal(results.length, 3);
  assert.equal(results[0].revision, 8);
  assert.equal(results[1].revision, 8);
  assert.equal(results[2].revision, 8);
});

test("Campaign Engine uses provider batch execution once while preserving one log row per consequence", async () => {
  const calls = [];
  const providerExecutor = {
    validateAction: () => ({ valid: true }),
    executeActions: async (actions, context) => {
      calls.push({ actions, context });
      return actions.map(() => ({ state: { settlement: { name: "Ostwall" } }, revision: 8 }));
    },
    executeAction: async () => { throw new Error("batch path should be preferred"); }
  };
  const repository = new MemoryRepository();
  const engine = new CampaignEngine(repository, { ...deterministicOptions(), providerExecutor });
  const entry = await engine.createEntry({ title: "Belagerung beenden", type: "quest", status: "active" });
  await engine.createTransitionRule(entry.id, {
    fromStatus: "active",
    toStatus: "completed",
    actions: [
      { type: "providerAction", provider: "cityForge", action: "applyStatePatch", targetId: "ostwall", payload: { operation: "setDimension", dimension: "security", value: "good" } },
      { type: "providerAction", provider: "cityForge", action: "applyStatePatch", targetId: "ostwall", payload: { operation: "setDimension", dimension: "mood", value: "good" } }
    ]
  });
  await engine.startSession();
  await engine.setEntryStatus(entry.id, "completed");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].actions.length, 2);
  assert.equal(calls[0].context.entryId, entry.id);
  const state = await engine.getState();
  assert.equal(state.sessions[0].changes.filter(change => change.action === "provider.action").length, 2);
});

test("provider diagnostics expose public API and embedded-editor contract versions when advertised", () => {
  const modules = new Map([
    ["pf2e-creature-forge", {
      active: true,
      version: "1.0.0",
      api: { version: "1.0.0", createActor() {}, ui: { openCreatureForge() {}, creatureEditor: { contractVersion: 12, create() {} } } }
    }],
    ["pf2e-loot-forge", {
      active: true,
      version: "0.3.5",
      api: { embeddedContractVersion: 2, generateLoot() {}, createEmbeddedEditor() {}, addLootToActor() {} }
    }]
  ]);
  const registry = new FoundryForgeProviderRegistry({ getModule: id => modules.get(id) ?? null });
  const creature = registry.inspect("creatureForge");
  const loot = registry.inspect("lootForge");
  assert.equal(creature.apiVersion, "1.0.0");
  assert.equal(creature.embeddedContractVersion, "12");
  assert.equal(loot.embeddedContractVersion, "2");
});

test("German and English application localization remain structurally identical", () => {
  const de = flatten(JSON.parse(fs.readFileSync(path.join(root, "lang/de.json"), "utf8")));
  const en = flatten(JSON.parse(fs.readFileSync(path.join(root, "lang/en.json"), "utf8")));
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
});

test("integration foundation keeps Forge modules optional and never writes foreign Weather Forge settings", () => {
  const moduleJson = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
  const serialized = JSON.stringify(moduleJson);
  for (const id of ["pf2e-city-forge", "pf2e-npc-forge", "pf2e-creature-forge", "pf2e-loot-forge", "pf2e-item-forge", "pf2e-weather-forge"]) {
    assert.equal(serialized.includes(id), false);
  }
  const providers = fs.readFileSync(path.join(root, "scripts/integrations/forge-provider-registry.js"), "utf8");
  assert.doesNotMatch(providers, /game\?*\.settings\?*\.set\?*\(\s*["']pf2e-weather-forge/);
  assert.doesNotMatch(providers, /game\.settings\.set\(\s*["']pf2e-weather-forge/);
});
