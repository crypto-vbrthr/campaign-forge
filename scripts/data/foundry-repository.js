import { MODULE_ID, SETTINGS } from "../core/constants.js";
import { cloneData, normalizeState } from "./state.js";

export class FoundryCampaignRepository {
  async load() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.DATA);
    return normalizeState(cloneData(raw));
  }

  async save(state) {
    return game.settings.set(MODULE_ID, SETTINGS.DATA, cloneData(state));
  }
}
