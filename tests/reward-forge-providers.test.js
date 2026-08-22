import test from "node:test";
import assert from "node:assert/strict";

import { CampaignEngine } from "../scripts/engine/campaign-engine.js";
import { REWARD_TARGET_ALL_PLAYERS } from "../scripts/core/constants.js";
import { FoundryRewardExecutor } from "../scripts/integrations/reward-provider.js";
import { MemoryRepository, deterministicOptions } from "./helpers.js";

function character(uuid, name) {
  return {
    uuid,
    name,
    documentName: "Actor",
    type: "character",
    hasPlayerOwner: true,
    inventory: {}
  };
}

async function withFoundry({ actors = [], documents = {} }, callback) {
  const previousGame = globalThis.game;
  const previousFromUuid = globalThis.fromUuid;
  globalThis.game = { actors: { contents: actors }, users: { contents: [] } };
  globalThis.fromUuid = async uuid => documents[uuid] ?? actors.find(actor => actor.uuid === uuid) ?? null;
  try {
    return await callback();
  } finally {
    globalThis.game = previousGame;
    globalThis.fromUuid = previousFromUuid;
  }
}

test("Loot Forge rewards generate once and deliver the full loot bundle to every player", async () => {
  const heroA = character("Actor.a", "A");
  const heroB = character("Actor.b", "B");
  const deliveries = [];
  let generationCount = 0;
  const lootApi = {
    async generateLoot(config) {
      generationCount += 1;
      assert.equal(config.level, 8);
      return {
        coins: { gp: 20 },
        pf2eItems: [{ name: "Potion", system: { quantity: 1 } }],
        generatedItems: [{ name: "Silver Idol", system: { quantity: 1 } }]
      };
    },
    async addLootToActor(actor, loot, options) {
      deliveries.push({ actor: actor.uuid, loot: structuredClone(loot), options: { ...options } });
      return [{ id: `${actor.uuid}-loot` }];
    }
  };
  const providers = { getApi: id => id === "lootForge" ? lootApi : null };

  await withFoundry({ actors: [heroA, heroB] }, async () => {
    const result = await new FoundryRewardExecutor({ providers }).execute({
      type: "lootForge",
      actorUuid: REWARD_TARGET_ALL_PLAYERS,
      lootConfig: { level: 8, theme: "ruins" },
      mystifyMagicItems: true
    });
    assert.equal(generationCount, 1);
    assert.equal(deliveries.length, 2);
    assert.deepEqual(deliveries.map(entry => entry.actor), ["Actor.a", "Actor.b"]);
    assert.equal(deliveries[0].loot.coins.gp, 20);
    assert.equal(deliveries[1].loot.generatedItems[0].name, "Silver Idol");
    assert.equal(deliveries[0].options.mystifyMagicItems, true);
    assert.equal(result.recipientCount, 2);
    assert.deepEqual(result.summary, {
      coins: { pp: 0, gp: 20, sp: 0, cp: 0 },
      pf2eItemCount: 1,
      generatedItemCount: 1
    });
  });
});

test("Item Forge rewards generate one item and deliver the configured quantity to team inventory", async () => {
  const received = [];
  const party = {
    uuid: "Actor.party",
    name: "Party",
    documentName: "Actor",
    type: "party",
    inventory: {
      async add(source) {
        received.push(structuredClone(source));
        return [{ id: "created-item" }];
      }
    }
  };
  let generationCount = 0;
  const itemApi = {
    async generate(request) {
      generationCount += 1;
      assert.equal(request.category, "magic.worn.footwear");
      return {
        itemSource: { name: "Wayfarer Boots", type: "equipment", system: { quantity: 1, level: { value: 10 } } },
        metadata: { generator: "worn-magic" }
      };
    }
  };
  const providers = { getApi: id => id === "itemForge" ? itemApi : null };

  await withFoundry({ actors: [party] }, async () => {
    const result = await new FoundryRewardExecutor({ providers }).execute({
      type: "itemForge",
      actorUuid: party.uuid,
      itemRequest: { mode: "magic", category: "magic.worn.footwear", level: 10 },
      quantity: 2
    });
    assert.equal(generationCount, 1);
    assert.equal(received.length, 1);
    assert.equal(received[0].name, "Wayfarer Boots");
    assert.equal(received[0].system.quantity, 2);
    assert.equal(result.itemName, "Wayfarer Boots");
    assert.equal(result.quantity, 2);
  });
});

test("Campaign reward rules accept Loot Forge and Item Forge provider definitions", async () => {
  const repository = new MemoryRepository();
  const calls = [];
  const engine = new CampaignEngine(repository, {
    ...deterministicOptions(),
    rewardExecutor: { execute: async reward => { calls.push(structuredClone(reward)); return { ok: true }; } }
  });
  const entry = await engine.createEntry({ title: "Reward quest", type: "quest", status: "active" });
  const rule = await engine.createRewardRule(entry.id, {
    fromStatus: "active",
    toStatus: "completed",
    rewards: [
      {
        type: "lootForge",
        actorUuid: REWARD_TARGET_ALL_PLAYERS,
        lootConfig: { level: 6, theme: "temple", environment: "underground" },
        mystifyMagicItems: true
      },
      {
        type: "itemForge",
        actorUuid: "Actor.party",
        itemRequest: { mode: "existing", category: "weapon.melee", level: 6 },
        itemPreviewName: "Preview Sword",
        quantity: 1
      }
    ]
  });
  assert.equal(rule.rewards[0].type, "lootForge");
  assert.equal(rule.rewards[0].lootConfig.theme, "temple");
  assert.equal(rule.rewards[1].type, "itemForge");
  assert.equal(rule.rewards[1].itemRequest.category, "weapon.melee");

  const preview = await engine.previewEntryStatusTransition(entry.id, "completed");
  assert.deepEqual(preview.rewardOffers.map(reward => reward.type), ["lootForge", "itemForge"]);
  assert.equal(preview.rewardOffers[0].lootConfig.level, 6);
  assert.equal(preview.rewardOffers[1].itemPreviewName, "Preview Sword");

  await engine.setEntryStatus(entry.id, "completed", { rewardMode: "grant" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, "lootForge");
  assert.equal(calls[1].type, "itemForge");
});
