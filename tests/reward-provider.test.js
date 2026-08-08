import test from "node:test";
import assert from "node:assert/strict";

import { REWARD_TARGET_ALL_PLAYERS } from "../scripts/core/constants.js";
import { FoundryRewardExecutor } from "../scripts/integrations/reward-provider.js";

function character(uuid, name, { playerOwned = true } = {}) {
  return {
    uuid,
    name,
    documentName: "Actor",
    type: "character",
    hasPlayerOwner: playerOwned,
    system: { details: { xp: { value: 10 } } },
    inventory: {},
    async update(patch) {
      this.system.details.xp.value = patch["system.details.xp.value"];
    }
  };
}

function withFoundry({ actors = [], documents = {} }, callback) {
  const previousGame = globalThis.game;
  const previousFromUuid = globalThis.fromUuid;
  globalThis.game = { actors: { contents: actors }, users: { contents: [] } };
  globalThis.fromUuid = async uuid => documents[uuid] ?? actors.find(actor => actor.uuid === uuid) ?? null;
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      globalThis.game = previousGame;
      globalThis.fromUuid = previousFromUuid;
    });
}

test("all-players XP grants the full XP amount to every player character", async () => {
  const heroA = character("Actor.a", "A");
  const heroB = character("Actor.b", "B");
  const gmCharacter = character("Actor.gm", "GM Character", { playerOwned: false });

  await withFoundry({ actors: [heroA, heroB, gmCharacter] }, async () => {
    const result = await new FoundryRewardExecutor().execute({
      type: "xp",
      actorUuid: REWARD_TARGET_ALL_PLAYERS,
      amount: 125
    });
    assert.equal(heroA.system.details.xp.value, 135);
    assert.equal(heroB.system.details.xp.value, 135);
    assert.equal(gmCharacter.system.details.xp.value, 10);
    assert.equal(result.recipientCount, 2);
    assert.equal(result.amount, 125);
  });
});

test("all-players currency grants the full coin bundle to every player character", async () => {
  const heroA = character("Actor.a", "A");
  const heroB = character("Actor.b", "B");
  const receivedA = [];
  const receivedB = [];
  heroA.inventory.addCurrency = async coins => receivedA.push({ ...coins });
  heroB.inventory.addCurrency = async coins => receivedB.push({ ...coins });

  await withFoundry({ actors: [heroA, heroB] }, async () => {
    const result = await new FoundryRewardExecutor().execute({
      type: "currency",
      actorUuid: REWARD_TARGET_ALL_PLAYERS,
      coins: { gp: 25, sp: 3 }
    });
    assert.deepEqual(receivedA, [{ pp: 0, gp: 25, sp: 3, cp: 0 }]);
    assert.deepEqual(receivedB, [{ pp: 0, gp: 25, sp: 3, cp: 0 }]);
    assert.equal(result.recipientCount, 2);
  });
});

test("all-players item rewards grant the full quantity to every player character", async () => {
  const heroA = character("Actor.a", "A");
  const heroB = character("Actor.b", "B");
  const sourcesA = [];
  const sourcesB = [];
  heroA.inventory.add = async source => { sourcesA.push(structuredClone(source)); return [{ id: "a-item" }]; };
  heroB.inventory.add = async source => { sourcesB.push(structuredClone(source)); return [{ id: "b-item" }]; };
  const item = {
    uuid: "Item.reward",
    name: "Reward Item",
    documentName: "Item",
    toObject: () => ({ name: "Reward Item", system: { quantity: 1 } })
  };

  await withFoundry({ actors: [heroA, heroB], documents: { [item.uuid]: item } }, async () => {
    const result = await new FoundryRewardExecutor().execute({
      type: "item",
      actorUuid: REWARD_TARGET_ALL_PLAYERS,
      itemUuid: item.uuid,
      itemName: item.name,
      quantity: 3
    });
    assert.equal(sourcesA[0].system.quantity, 3);
    assert.equal(sourcesB[0].system.quantity, 3);
    assert.equal(result.recipientCount, 2);
    assert.equal(result.quantity, 3);
  });
});

test("currency and item rewards can target a PF2e party Actor as team inventory", async () => {
  const currencyReceived = [];
  const itemSources = [];
  const party = {
    uuid: "Actor.party",
    name: "The Party",
    documentName: "Actor",
    type: "party",
    inventory: {
      addCurrency: async coins => currencyReceived.push({ ...coins }),
      add: async source => { itemSources.push(structuredClone(source)); return [{ id: "party-item" }]; }
    }
  };
  const item = {
    uuid: "Item.partyReward",
    name: "Party Reward",
    documentName: "Item",
    toObject: () => ({ name: "Party Reward", system: { quantity: 1 } })
  };

  await withFoundry({ actors: [party], documents: { [item.uuid]: item } }, async () => {
    const executor = new FoundryRewardExecutor();
    await executor.execute({ type: "currency", actorUuid: party.uuid, coins: { gp: 10 } });
    await executor.execute({ type: "item", actorUuid: party.uuid, itemUuid: item.uuid, quantity: 2 });
    assert.deepEqual(currencyReceived, [{ pp: 0, gp: 10, sp: 0, cp: 0 }]);
    assert.equal(itemSources[0].system.quantity, 2);
  });
});
