import { CampaignEngineError } from "../engine/campaign-engine.js";

async function resolveDocument(uuid) {
  if (!uuid) return null;
  try {
    return await fromUuid(uuid);
  } catch {
    return null;
  }
}

function cleanCoins(coins = {}) {
  return Object.fromEntries(["pp", "gp", "sp", "cp"].map(denom => [
    denom,
    Math.max(0, Math.trunc(Number(coins?.[denom] ?? 0) || 0))
  ]));
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

  async _grantXp(reward) {
    const actor = await this._getActor(reward.actorUuid);
    if (actor.type !== "character") {
      throw new CampaignEngineError("REWARD_XP_CHARACTER_ONLY", { uuid: actor.uuid });
    }
    const previous = Number(actor.system?.details?.xp?.value ?? 0);
    const amount = Math.max(1, Math.trunc(Number(reward.amount) || 0));
    const value = previous + amount;
    await actor.update({ "system.details.xp.value": value });
    return { actorUuid: actor.uuid, actorName: actor.name ?? "", amount, previous, value };
  }

  async _grantCurrency(reward) {
    const actor = await this._getActor(reward.actorUuid);
    const coins = cleanCoins(reward.coins);
    const addCurrency = actor.inventory?.addCurrency ?? actor.inventory?.addCoins;
    if (typeof addCurrency !== "function") {
      throw new CampaignEngineError("REWARD_CURRENCY_UNSUPPORTED", { uuid: actor.uuid });
    }
    await addCurrency.call(actor.inventory, coins);
    return { actorUuid: actor.uuid, actorName: actor.name ?? "", coins };
  }

  async _grantItem(reward) {
    const actor = await this._getActor(reward.actorUuid);
    const item = await resolveDocument(reward.itemUuid);
    if (!item || item.documentName !== "Item") {
      throw new CampaignEngineError("REWARD_ITEM_NOT_FOUND", { uuid: reward.itemUuid });
    }

    const source = item.toObject();
    delete source._id;
    const quantity = Math.max(1, Math.trunc(Number(reward.quantity ?? 1) || 1));
    if (source.system && Object.hasOwn(source.system, "quantity")) source.system.quantity = quantity;

    if (typeof actor.inventory?.add === "function") {
      const created = await actor.inventory.add(source);
      return {
        actorUuid: actor.uuid,
        actorName: actor.name ?? "",
        itemUuid: item.uuid,
        itemName: item.name ?? reward.itemName ?? "",
        quantity,
        createdIds: created?.map?.(entry => entry.id) ?? []
      };
    }

    const created = await actor.createEmbeddedDocuments("Item", [source]);
    return {
      actorUuid: actor.uuid,
      actorName: actor.name ?? "",
      itemUuid: item.uuid,
      itemName: item.name ?? reward.itemName ?? "",
      quantity,
      createdIds: created?.map?.(entry => entry.id) ?? []
    };
  }
}
