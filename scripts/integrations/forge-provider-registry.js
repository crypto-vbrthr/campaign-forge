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
        embeddedEditor: Boolean(api?.ui?.creatureEditor?.create || api?.ui?.creatureEditor?.createSession),
        createActor: Boolean(api?.createActor)
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

function registeredSetting(fullKey) {
  return Boolean(globalThis.game?.settings?.settings?.has?.(fullKey));
}

function storedWorldSetting(moduleId, key) {
  const fullKey = `${moduleId}.${key}`;
  const storage = globalThis.game?.settings?.storage?.get?.("world");
  if (!storage) return null;

  let record = storage.get?.(fullKey) ?? null;
  if (!record && typeof storage.find === "function") {
    record = storage.find(candidate => candidate?.key === fullKey || candidate?._source?.key === fullKey) ?? null;
  }

  let value = record?.value ?? record?._source?.value ?? null;
  for (let i = 0; i < 2 && typeof value === "string"; i += 1) {
    try { value = JSON.parse(value); } catch { break; }
  }
  return value && typeof value === "object" ? clone(value) : null;
}

function isUnregisteredSettingError(error) {
  return /not a registered game setting/i.test(String(error?.message ?? error ?? ""));
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

  openCreatureForge(options = {}) {
    return this.getApi("creatureForge")?.ui?.openCreatureForge?.(options) ?? null;
  }

  createCreatureEditor(options = {}) {
    const api = this.getApi("creatureForge");
    if (!api?.ui?.creatureEditor?.create) return null;
    return api.ui.creatureEditor.create(options);
  }

  async createCreatureActor(blueprint, options = {}) {
    const api = this.getApi("creatureForge");
    if (!api?.createActor) return null;
    return api.createActor(blueprint, options);
  }

  async openCreatureActor(uuid) {
    if (!uuid || typeof globalThis.fromUuid !== "function") return null;
    try {
      const actor = await globalThis.fromUuid(uuid);
      if (!actor || actor.documentName !== "Actor") return null;
      actor.sheet?.render?.(true);
      return actor;
    } catch {
      return null;
    }
  }

  openWeatherForge(options = {}) {
    return this.getApi("weatherForge")?.open?.(options) ?? null;
  }

  async getCurrentWeatherSnapshot(options = {}) {
    // Resolve lazily at call time. This matters when Campaign Forge rendered before
    // Weather Forge finished its ready hook and attached module.api.
    let api = this.getApi("weatherForge");
    if (!api) {
      await Promise.resolve();
      api = this.getApi("weatherForge");
    }
    if (!api) return null;

    // Weather Forge 1.1.x can expose module.api even when its hidden weatherState
    // setting was not registered successfully during init. Calling the public getter
    // in that state throws from ClientSettings.get(). Campaign Forge therefore treats
    // the API as preferred, but can read the already-persisted world setting as a
    // read-only compatibility fallback. It never registers or writes another module's
    // settings.
    const weatherSettingKey = "pf2e-weather-forge.weatherState";
    const registrationRegistryAvailable = typeof globalThis.game?.settings?.settings?.has === "function";
    const weatherSettingReady = !registrationRegistryAvailable || registeredSetting(weatherSettingKey);

    let context = null;
    if (weatherSettingReady && typeof api.getCurrentWeatherContext === "function") {
      try { context = await api.getCurrentWeatherContext(options); }
      catch (error) {
        if (!isUnregisteredSettingError(error)) {
          console.warn?.("campaign-forge | Weather Forge current context failed; using stored weather fallback", error);
        }
        context = null;
      }
    }

    let currentWeather = null;
    if (weatherSettingReady && typeof api.getWeather === "function") {
      try { currentWeather = await api.getWeather(); }
      catch (error) {
        if (!isUnregisteredSettingError(error)) {
          console.warn?.("campaign-forge | Weather Forge getWeather() failed; using stored weather fallback", error);
        }
        currentWeather = null;
      }
    }

    currentWeather ??= storedWorldSetting("pf2e-weather-forge", "weatherState");
    if (!currentWeather) {
      const history = storedWorldSetting("pf2e-weather-forge", "weatherHistory");
      if (Array.isArray(history) && history.length) currentWeather = clone(history.at(-1));
    }
    const weather = clone(context?.weather ?? currentWeather);
    if (!weather) return null;
    const resolution = clone(context?.climateResolution ?? null);
    const provenance = clone(context?.provenance ?? weather?.weatherForgeCityContext ?? null);
    const cityContext = provenance ?? {};
    return {
      schema: "campaign-forge/weather-snapshot",
      version: 1,
      capturedAt: new Date().toISOString(),
      provider: "weatherForge",
      providerVersion: String(this.inspect("weatherForge")?.version ?? ""),
      weather: {
        timeSegment: weather.timeSegment ?? null,
        climateZone: weather.climateZone ?? null,
        temperature: Number.isFinite(Number(weather.temperature)) ? Number(weather.temperature) : null,
        precipitation: weather.precipitation ?? null,
        humidity: Number.isFinite(Number(weather.humidity)) ? Number(weather.humidity) : null,
        cloudDensity: Number.isFinite(Number(weather.cloudDensity)) ? Number(weather.cloudDensity) : null,
        windStrength: Number.isFinite(Number(weather.windStrength)) ? Number(weather.windStrength) : null,
        weekday: weather.weekday ?? null,
        dayOfMonth: Number.isFinite(Number(weather.dayOfMonth)) ? Number(weather.dayOfMonth) : null,
        month: weather.month ?? null,
        year: Number.isFinite(Number(weather.year)) ? Number(weather.year) : null,
        moonPhase: weather.moonPhase ?? null,
        season: weather.season ?? null,
        descriptionKey: weather.descriptionKey ?? null,
        extremeWeather: clone(weather.extremeWeather ?? null)
      },
      location: {
        sceneUuid: cityContext.sceneUuid ?? resolution?.sceneUuid ?? null,
        settlementId: cityContext.settlementId ?? resolution?.context?.settlement?.id ?? null,
        settlementName: cityContext.settlementName ?? resolution?.context?.settlement?.name ?? null,
        districtId: cityContext.districtId ?? resolution?.context?.scope?.district?.id ?? null,
        districtName: cityContext.districtName ?? resolution?.context?.scope?.district?.name ?? null,
        locationId: cityContext.locationId ?? resolution?.context?.scope?.location?.id ?? null,
        locationName: cityContext.locationName ?? resolution?.context?.scope?.location?.name ?? null,
        region: cityContext.region ?? resolution?.context?.geography?.region ?? null,
        terrain: cityContext.terrain ?? resolution?.context?.geography?.terrain ?? null
      },
      source: resolution?.source ?? weather?.weatherForgeClimateSource ?? null,
      mismatch: Boolean(context?.mismatch)
    };
  }

}

export function providerDefinitions() {
  return DEFINITIONS;
}
