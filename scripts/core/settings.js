import { MODULE_ID, SETTINGS } from "./constants.js";
import { createDefaultState } from "../data/state.js";

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.DATA, {
    scope: "world",
    config: false,
    type: Object,
    default: createDefaultState()
  });

  game.settings.register(MODULE_ID, SETTINGS.STORAGE_VERSION, {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, SETTINGS.VAULT_ID, {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.PROJECTION_IDS, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.COLLAPSED_GROUPS, {
    scope: "client",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_JOURNAL_BUTTON, {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_STRUCTURAL_CHANGES, {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });
}
