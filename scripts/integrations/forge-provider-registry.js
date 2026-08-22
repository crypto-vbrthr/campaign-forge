const CITY_DIMENSIONS = new Set(["prosperity", "supply", "security", "order", "mood", "health"]);
const CITY_STATE_LEVELS = new Set(["very-poor", "poor", "normal", "good", "very-good"]);

const DEFINITIONS = Object.freeze({
  cityForge: Object.freeze({
    moduleId: "pf2e-city-forge",
    labelKey: "CAMPAIGN_FORGE.Integrations.Providers.cityForge",
    capabilities(api) {
      return {
        references: Boolean(api?.settlements?.list && api?.integrations?.campaign?.getContext),
        stateActions: Boolean(api?.integrations?.campaign?.applyStatePatch || api?.state?.applyPatch),
        open: Boolean(api?.ui?.openEditor)
      };
    }
  }),
  npcForge: Object.freeze({
    moduleId: "pf2e-npc-forge",
    labelKey: "CAMPAIGN_FORGE.Integrations.Providers.npcForge",
    capabilities(api) {
      return {
        open: Boolean(api?.ui?.open),
        embeddedEditor: Boolean(api?.ui?.createEditor)
      };
    }
  }),
  creatureForge: Object.freeze({
    moduleId: "pf2e-creature-forge",
    labelKey: "CAMPAIGN_FORGE.Integrations.Providers.creatureForge",
    capabilities(api) {
      return {
        open: Boolean(api?.ui?.openCreatureForge),
        embeddedEditor: Boolean(api?.ui?.creatureEditor?.create || api?.ui?.creatureEditor?.createSession)
      };
    }
  }),
  lootForge: Object.freeze({
    moduleId: "pf2e-loot-forge",
    labelKey: "CAMPAIGN_FORGE.Integrations.Providers.lootForge",
    capabilities(api) {
      return {
        generate: Boolean(api?.generateLoot),
        embeddedEditor: Boolean(api?.createEmbeddedEditor),
        actorDelivery: Boolean(api?.addLootToActor)
      };
    }
  }),
  itemForge: Object.freeze({
    moduleId: "pf2e-item-forge",
    labelKey: "CAMPAIGN_FORGE.Integrations.Providers.itemForge",
    capabilities(api) {
      const advertised = typeof api?.getCapabilities === "function" ? api.getCapabilities() : null;
      return {
        generate: Boolean(api?.generate),
        preview: Boolean(api?.preview),
        open: Boolean(api?.open),
        embeddedEditor: Boolean(advertised?.embeddedEditor)
      };
    }
  }),
  weatherForge: Object.freeze({
    moduleId: "pf2e-weather-forge",
    labelKey: "CAMPAIGN_FORGE.Integrations.Providers.weatherForge",
    capabilities(api) {
      return {
        currentContext: Boolean(api?.getCurrentWeatherContext),
        weatherState: Boolean(api?.getWeather),
        open: Boolean(api?.open)
      };
    }
  })
});

function clone(value) {
  if (value === undefined) return undefined;
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function moduleRecord(moduleId) {
  return globalThis.game?.modules?.get?.(moduleId) ?? null;
}

function normalizeProviderAction(action) {
  return {
    provider: String(action?.provider ?? ""),
    action: String(action?.action ?? ""),
    targetId: String(action?.targetId ?? ""),
    payload: clone(action?.payload ?? {})
  };
}

function cityPatchFromPayload(payload = {}) {
  const operation = String(payload.operation ?? "");
  if (operation === "setDimension") {
    const dimension = String(payload.dimension ?? "");
    const value = String(payload.value ?? "");
    return { dimensions: { [dimension]: value } };
  }
  if (operation === "setConditionEnabled") {
    const conditionId = String(payload.conditionId ?? "");
    return {
      conditions: payload.enabled === false
        ? { disableIds: [conditionId] }
        : { enableIds: [conditionId] }
    };
  }
  if (operation === "setThreatActive") {
    const threatId = String(payload.threatId ?? "");
    return {
      activeThreats: payload.enabled === false
        ? { remove: [threatId] }
        : { add: [threatId] }
    };
  }
  throw Object.assign(new Error(`Unsupported City Forge operation: ${operation}`), {
    code: "UNSUPPORTED_PROVIDER_ACTION"
  });
}

export class FoundryForgeProviderRegistry {
  constructor({ getModule = moduleRecord } = {}) {
    this.getModule = getModule;
    this._capabilityCache = new Map();
  }

  get definitions() {
    return DEFINITIONS;
  }

  getApi(providerId) {
    const definition = DEFINITIONS[providerId];
    if (!definition) return null;
    const module = this.getModule(definition.moduleId);
    return module?.active ? (module.api ?? null) : null;
  }

  inspect(providerId) {
    const definition = DEFINITIONS[providerId];
    if (!definition) return null;
    const module = this.getModule(definition.moduleId);
    const api = module?.active ? (module.api ?? null) : null;
    let capabilities = {};
    const cached = this._capabilityCache.get(providerId);
    if (api && cached?.api === api) {
      capabilities = cached.capabilities;
    } else {
      try {
        capabilities = api ? definition.capabilities(api) : {};
      } catch {
        capabilities = {};
      }
      if (api) this._capabilityCache.set(providerId, { api, capabilities: { ...capabilities } });
      else this._capabilityCache.delete(providerId);
    }
    const capabilityValues = Object.values(capabilities);
    return Object.freeze({
      id: providerId,
      moduleId: definition.moduleId,
      labelKey: definition.labelKey,
      installed: Boolean(module),
      active: Boolean(module?.active),
      apiExposed: Boolean(api),
      ready: Boolean(api) && (capabilityValues.length === 0 || capabilityValues.some(Boolean)),
      version: module?.version ?? "",
      capabilities: Object.freeze({ ...capabilities })
    });
  }

  listStatus() {
    return Object.keys(DEFINITIONS).map(id => this.inspect(id));
  }

  supports(providerId, capability) {
    return Boolean(this.inspect(providerId)?.capabilities?.[capability]);
  }

  validateAction(action) {
    const normalized = normalizeProviderAction(action);
    if (!DEFINITIONS[normalized.provider]) return { valid: false, code: "UNKNOWN_PROVIDER" };
    if (!normalized.action || !normalized.targetId) return { valid: false, code: "INVALID_PROVIDER_ACTION" };
    if (normalized.provider === "cityForge") {
      if (normalized.action !== "applyStatePatch") return { valid: false, code: "UNSUPPORTED_PROVIDER_ACTION" };
      const operation = String(normalized.payload?.operation ?? "");
      if (!new Set(["setDimension", "setConditionEnabled", "setThreatActive"]).has(operation)) {
        return { valid: false, code: "UNSUPPORTED_PROVIDER_ACTION" };
      }
      if (operation === "setDimension") {
        if (!CITY_DIMENSIONS.has(String(normalized.payload?.dimension ?? ""))) return { valid: false, code: "INVALID_PROVIDER_ACTION" };
        if (!CITY_STATE_LEVELS.has(String(normalized.payload?.value ?? ""))) return { valid: false, code: "INVALID_PROVIDER_ACTION" };
      }
      if (operation === "setConditionEnabled" && !String(normalized.payload?.conditionId ?? "").trim()) {
        return { valid: false, code: "INVALID_PROVIDER_ACTION" };
      }
      if (operation === "setThreatActive" && !String(normalized.payload?.threatId ?? "").trim()) {
        return { valid: false, code: "INVALID_PROVIDER_ACTION" };
      }
    }
    return { valid: true };
  }

  async executeAction(action, context = {}) {
    const normalized = normalizeProviderAction(action);
    const validation = this.validateAction(normalized);
    if (!validation.valid) {
      const error = new Error(validation.code);
      error.code = validation.code;
      throw error;
    }

    const api = this.getApi(normalized.provider);
    if (!api) {
      const error = new Error(`Provider unavailable: ${normalized.provider}`);
      error.code = "PROVIDER_UNAVAILABLE";
      throw error;
    }

    if (normalized.provider === "cityForge" && normalized.action === "applyStatePatch") {
      const applyPatch = api.integrations?.campaign?.applyStatePatch ?? api.state?.applyPatch;
      if (typeof applyPatch !== "function") {
        const error = new Error("City Forge state patch capability is unavailable");
        error.code = "PROVIDER_CAPABILITY_UNAVAILABLE";
        throw error;
      }
      const patch = cityPatchFromPayload(normalized.payload);
      return applyPatch(normalized.targetId, patch, {
        source: {
          type: "campaign",
          id: context.entryId ?? null,
          label: context.entryTitle ?? "Campaign Forge"
        }
      });
    }

    const error = new Error(`Unsupported provider action: ${normalized.provider}/${normalized.action}`);
    error.code = "UNSUPPORTED_PROVIDER_ACTION";
    throw error;
  }

  async listCitySettlements() {
    const api = this.getApi("cityForge");
    if (!api?.settlements?.list) return [];
    return clone(await api.settlements.list());
  }

  async getCityCampaignContext(settlementId) {
    const api = this.getApi("cityForge");
    if (!api?.integrations?.campaign?.getContext) return null;
    return clone(await api.integrations.campaign.getContext(settlementId));
  }

  async openCitySettlement(settlementId) {
    const api = this.getApi("cityForge");
    if (!api?.ui?.openEditor) return null;
    return api.ui.openEditor(settlementId);
  }

  openNpcForge(options = {}) {
    return this.getApi("npcForge")?.ui?.open?.(options) ?? null;
  }

  createNpcEditorSession(options = {}) {
    const api = this.getApi("npcForge");
    if (!api?.ui?.createEditor) return null;
    return api.ui.createEditor(options);
  }

  createLootRewardEditor(options = {}) {
    const api = this.getApi("lootForge");
    if (!api?.createEmbeddedEditor) return null;
    return api.createEmbeddedEditor(options);
  }

  async createItemRewardEditor(options = {}) {
    const api = this.getApi("itemForge");
    if (!api) return null;

    // Prefer a future public factory if Item Forge exposes one. The current
    // v0.0.37 RC advertises the embedded editor contract but exposes the
    // reusable editor class as a module asset rather than an API factory.
    if (typeof api.createEmbeddedEditor === "function") {
      return api.createEmbeddedEditor(options);
    }

    try {
      const route = globalThis.foundry?.utils?.getRoute?.("modules/pf2e-item-forge/src/app/item-forge-editor.js")
        ?? "/modules/pf2e-item-forge/src/app/item-forge-editor.js";
      const module = await import(route);
      if (typeof module?.ItemForgeEditor !== "function") return null;
      return new module.ItemForgeEditor({ api, ...options });
    } catch (error) {
      console.warn("campaign-forge | Could not load the Item Forge embedded editor", error);
      return null;
    }
  }

  openItemForge(options = {}) {
    return this.getApi("itemForge")?.open?.(options) ?? null;
  }
}

export function providerDefinitions() {
  return DEFINITIONS;
}
