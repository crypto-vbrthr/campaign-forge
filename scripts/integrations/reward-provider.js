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
  if (source.system && Object.hasOwn(source.system, "quantity")) source.system.quantity = quantity;
  return source;
}

export class FoundryRewardExecutor {
  async execute(reward) {
    if (!reward?.type) throw new CampaignEngineError("INVALID_REWARD_TYPE");
    if (reward.type === "xp") return this._grantXp(reward);
    if (reward.type === "currency") return this._grantCurrency(reward);
    if (reward.type === "item") return this._grantItem(reward);
    throw new CampaignEngineError("REWARD_PROVIDER_UNAVAILABLE", { type: reward.type });
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

  async _grantItemToActor(actor, item, quantity) {
    const source = itemSourceWithQuantity(item, quantity);

    if (typeof actor.inventory?.add === "function") {
      const created = await actor.inventory.add(source);
      return {
        actorUuid: actor.uuid,
        actorName: actor.name ?? "",
        itemUuid: item.uuid,
        itemName: item.name ?? "",
        quantity,
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
      itemUuid: item.uuid,
      itemName: item.name ?? "",
      quantity,
      createdIds: created?.map?.(entry => entry.id) ?? []
    };
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
}
