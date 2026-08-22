import { REWARD_TARGET_ALL_PLAYERS } from "../core/constants.js";
import { CampaignEngineError } from "../engine/campaign-engine.js";

async function resolveDocument(uuid) {
  if (!uuid) return null;
  try {
    return await globalThis.fromUuid?.(uuid);
  } catch {
    return null;
  }
}

function cloneData(value) {
  if (value === undefined) return undefined;
  if (globalThis.foundry?.utils?.deepClone) return globalThis.foundry.utils.deepClone(value);
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function actorCollection() {
  return [...(globalThis.game?.actors?.contents ?? globalThis.game?.actors ?? [])];
}

function userCollection() {
  return [...(globalThis.game?.users?.contents ?? globalThis.game?.users ?? [])];
}

export function isPlayerCharacter(actor) {
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") return false;
  if (actor.hasPlayerOwner === true) return true;

  const ownerLevel = Number(globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3);
  const ownership = actor.ownership ?? {};
  return userCollection().some(user => !user?.isGM && Number(ownership[user.id] ?? 0) >= ownerLevel);
}

export function getPlayerCharacterActors() {
  return actorCollection().filter(isPlayerCharacter);
}

function cleanCoins(coins = {}) {
  return Object.fromEntries(["pp", "gp", "sp", "cp"].map(denom => [
    denom,
    Math.max(0, Math.trunc(Number(coins?.[denom] ?? 0) || 0))
  ]));
}

function itemSourceWithQuantity(item, quantity) {
  const source = item.toObject();
  delete source._id;
  source.system ??= {};
  source.system.quantity = quantity;
  return source;
}

function generatedSourceWithQuantity(itemSource, quantity) {
  const source = cloneData(itemSource ?? {});
  delete source._id;
  source.system ??= {};
  source.system.quantity = quantity;
  return source;
}

function lootSummary(loot = {}) {
  return {
    coins: cleanCoins(loot?.coins ?? {}),
    pf2eItemCount: Array.isArray(loot?.pf2eItems) ? loot.pf2eItems.length : 0,
    generatedItemCount: Array.isArray(loot?.generatedItems) ? loot.generatedItems.length : 0
  };
}

export class FoundryRewardExecutor {
  constructor({ providers = null } = {}) {
    this.providers = providers;
  }

  async execute(reward) {
    if (!reward?.type) throw new CampaignEngineError("INVALID_REWARD_TYPE");
    if (reward.type === "xp") return this._grantXp(reward);
    if (reward.type === "currency") return this._grantCurrency(reward);
    if (reward.type === "item") return this._grantItem(reward);
    if (reward.type === "lootForge") return this._grantLootForge(reward);
    if (reward.type === "itemForge") return this._grantItemForge(reward);
    throw new CampaignEngineError("REWARD_PROVIDER_UNAVAILABLE", { type: reward.type });
  }

  _providerApi(providerId) {
    const api = this.providers?.getApi?.(providerId) ?? null;
    if (!api) throw new CampaignEngineError("REWARD_PROVIDER_UNAVAILABLE", { type: providerId });
    return api;
  }

  async _getActor(uuid) {
    const actor = await resolveDocument(uuid);
    if (!actor || actor.documentName !== "Actor") {
      throw new CampaignEngineError("REWARD_ACTOR_NOT_FOUND", { uuid });
    }
    return actor;
  }

  _getAllPlayerCharacters() {
    const actors = getPlayerCharacterActors();
    if (!actors.length) throw new CampaignEngineError("REWARD_NO_PLAYER_CHARACTERS");
    return actors;
  }

  async _resolveTargets(actorUuid) {
    if (actorUuid === REWARD_TARGET_ALL_PLAYERS) return this._getAllPlayerCharacters();
    return [await this._getActor(actorUuid)];
  }

  async _grantXp(reward) {
    const amount = Math.max(1, Math.trunc(Number(reward.amount) || 0));
    if (reward.actorUuid === REWARD_TARGET_ALL_PLAYERS) {
      const actors = this._getAllPlayerCharacters();
      const updates = actors.map(actor => {
        const previous = Number(actor.system?.details?.xp?.value ?? 0);
        return { actor, previous, value: previous + amount };
      });
      await Promise.all(updates.map(({ actor, value }) => actor.update({ "system.details.xp.value": value })));
      return {
        target: "allPlayers",
        recipientCount: updates.length,
        amount,
        recipients: updates.map(({ actor, previous, value }) => ({
          actorUuid: actor.uuid,
          actorName: actor.name ?? "",
          amount,
          previous,
          value
        }))
      };
    }

    const actor = await this._getActor(reward.actorUuid);
    if (actor.type !== "character") {
      throw new CampaignEngineError("REWARD_XP_CHARACTER_ONLY", { uuid: actor.uuid });
    }
    const previous = Number(actor.system?.details?.xp?.value ?? 0);
    const value = previous + amount;
    await actor.update({ "system.details.xp.value": value });
    return { actorUuid: actor.uuid, actorName: actor.name ?? "", amount, previous, value };
  }

  async _grantCurrencyToActor(actor, coins) {
    const addCurrency = actor.inventory?.addCurrency ?? actor.inventory?.addCoins;
    if (typeof addCurrency !== "function") {
      throw new CampaignEngineError("REWARD_CURRENCY_UNSUPPORTED", { uuid: actor.uuid });
    }
    await addCurrency.call(actor.inventory, coins);
    return { actorUuid: actor.uuid, actorName: actor.name ?? "", coins };
  }

  async _grantCurrency(reward) {
    const coins = cleanCoins(reward.coins);
    if (reward.actorUuid === REWARD_TARGET_ALL_PLAYERS) {
      const actors = this._getAllPlayerCharacters();
      for (const actor of actors) {
        const addCurrency = actor.inventory?.addCurrency ?? actor.inventory?.addCoins;
        if (typeof addCurrency !== "function") {
          throw new CampaignEngineError("REWARD_CURRENCY_UNSUPPORTED", { uuid: actor.uuid });
        }
      }
      const recipients = [];
      for (const actor of actors) recipients.push(await this._grantCurrencyToActor(actor, coins));
      return { target: "allPlayers", recipientCount: recipients.length, coins, recipients };
    }

    const actor = await this._getActor(reward.actorUuid);
    return this._grantCurrencyToActor(actor, coins);
  }

  async _grantSourceToActor(actor, source, details = {}) {
    if (typeof actor.inventory?.add === "function") {
      const created = await actor.inventory.add(source);
      return {
        actorUuid: actor.uuid,
        actorName: actor.name ?? "",
        ...details,
        createdIds: created?.map?.(entry => entry.id) ?? []
      };
    }

    if (typeof actor.createEmbeddedDocuments !== "function") {
      throw new CampaignEngineError("REWARD_ITEM_TARGET_UNSUPPORTED", { uuid: actor.uuid });
    }
    const created = await actor.createEmbeddedDocuments("Item", [source]);
    return {
      actorUuid: actor.uuid,
      actorName: actor.name ?? "",
      ...details,
      createdIds: created?.map?.(entry => entry.id) ?? []
    };
  }

  async _grantItemToActor(actor, item, quantity) {
    const source = itemSourceWithQuantity(item, quantity);
    return this._grantSourceToActor(actor, source, {
      itemUuid: item.uuid,
      itemName: item.name ?? "",
      quantity
    });
  }

  async _grantItem(reward) {
    const item = await resolveDocument(reward.itemUuid);
    if (!item || item.documentName !== "Item") {
      throw new CampaignEngineError("REWARD_ITEM_NOT_FOUND", { uuid: reward.itemUuid });
    }
    const quantity = Math.max(1, Math.trunc(Number(reward.quantity ?? 1) || 1));

    if (reward.actorUuid === REWARD_TARGET_ALL_PLAYERS) {
      const actors = this._getAllPlayerCharacters();
      for (const actor of actors) {
        if (typeof actor.inventory?.add !== "function" && typeof actor.createEmbeddedDocuments !== "function") {
          throw new CampaignEngineError("REWARD_ITEM_TARGET_UNSUPPORTED", { uuid: actor.uuid });
        }
      }
      const recipients = [];
      for (const actor of actors) recipients.push(await this._grantItemToActor(actor, item, quantity));
      return {
        target: "allPlayers",
        recipientCount: recipients.length,
        itemUuid: item.uuid,
        itemName: item.name ?? reward.itemName ?? "",
        quantity,
        recipients
      };
    }

    const actor = await this._getActor(reward.actorUuid);
    return this._grantItemToActor(actor, item, quantity);
  }

  async _grantLootForge(reward) {
    const api = this._providerApi("lootForge");
    if (typeof api.generateLoot !== "function" || typeof api.addLootToActor !== "function") {
      throw new CampaignEngineError("REWARD_PROVIDER_CAPABILITY_UNAVAILABLE", { type: "lootForge" });
    }

    const targets = await this._resolveTargets(reward.actorUuid);
    const loot = await api.generateLoot(cloneData(reward.lootConfig ?? {}));
    const recipients = [];
    for (const actor of targets) {
      const created = await api.addLootToActor(actor, cloneData(loot), {
        mystifyMagicItems: reward.mystifyMagicItems === true
      });
      recipients.push({
        actorUuid: actor.uuid,
        actorName: actor.name ?? "",
        createdIds: created?.map?.(entry => entry.id) ?? []
      });
    }

    return {
      target: reward.actorUuid === REWARD_TARGET_ALL_PLAYERS ? "allPlayers" : "actor",
      recipientCount: recipients.length,
      provider: "lootForge",
      summary: lootSummary(loot),
      recipients
    };
  }

  async _grantItemForge(reward) {
    const api = this._providerApi("itemForge");
    if (typeof api.generate !== "function") {
      throw new CampaignEngineError("REWARD_PROVIDER_CAPABILITY_UNAVAILABLE", { type: "itemForge" });
    }

    const targets = await this._resolveTargets(reward.actorUuid);
    for (const actor of targets) {
      if (typeof actor.inventory?.add !== "function" && typeof actor.createEmbeddedDocuments !== "function") {
        throw new CampaignEngineError("REWARD_ITEM_TARGET_UNSUPPORTED", { uuid: actor.uuid });
      }
    }

    const generated = await api.generate(cloneData(reward.itemRequest ?? {}));
    const itemSource = generated?.itemSource;
    if (!itemSource || typeof itemSource !== "object") {
      throw new CampaignEngineError("REWARD_ITEM_FORGE_RESULT_INVALID");
    }

    const quantity = Math.max(1, Math.trunc(Number(reward.quantity ?? 1) || 1));
    const itemName = String(itemSource.name ?? reward.itemPreviewName ?? "");
    const recipients = [];
    for (const actor of targets) {
      const source = generatedSourceWithQuantity(itemSource, quantity);
      recipients.push(await this._grantSourceToActor(actor, source, {
        provider: "itemForge",
        itemName,
        quantity
      }));
    }

    return {
      target: reward.actorUuid === REWARD_TARGET_ALL_PLAYERS ? "allPlayers" : "actor",
      recipientCount: recipients.length,
      provider: "itemForge",
      itemName,
      quantity,
      metadata: cloneData(generated?.metadata ?? null),
      recipients
    };
  }
}
