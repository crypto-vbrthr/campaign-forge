import { MODULE_ID, SETTINGS, STORAGE } from "../core/constants.js";
import { cloneData, createDefaultState, normalizeState } from "./state.js";
import { buildPlayerProjection, buildPlayerProjectionForUser, inflatePlayerProjection } from "../player/player-projection.js";

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Array.from(collection);
}

function gmUsers() {
  return collectionValues(game.users).filter(user => user?.isGM === true);
}

function playerUsers() {
  return collectionValues(game.users).filter(user => user && user.isGM !== true);
}

function journalDocuments() {
  return collectionValues(game.journal);
}

function ownershipNone() {
  return globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
}

function ownershipObserver() {
  return globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
}

function storageMeta(document) {
  return document?.getFlag?.(MODULE_ID, STORAGE.FLAG_META)
    ?? document?.flags?.[MODULE_ID]?.[STORAGE.FLAG_META]
    ?? null;
}

function storedState(document) {
  return document?.getFlag?.(MODULE_ID, STORAGE.FLAG_STATE)
    ?? document?.flags?.[MODULE_ID]?.[STORAGE.FLAG_STATE]
    ?? null;
}

function localize(key, fallback) {
  try {
    const value = game.i18n?.localize?.(key);
    if (value && value !== key) return value;
  } catch { /* noop */ }
  return fallback;
}

async function resolveUuid(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== "function") return null;
  try { return await globalThis.fromUuid(uuid); } catch { return null; }
}

export class CampaignStorageError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "CampaignStorageError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Protected persistence backend.
 *
 * Canonical GM state lives in an ownership-protected JournalEntry flag. Every
 * non-GM user receives a separate OBSERVER JournalEntry containing only their
 * permission-filtered player projection. The legacy world setting is scrubbed
 * after migration so full campaign state is no longer readable through
 * ClientSettings.
 */
export class FoundryCampaignRepository {
  constructor() {
    this._vault = null;
    this._projection = null;
    this._initialized = false;
    this._migratedThisRun = false;
  }

  get migratedThisRun() { return this._migratedThisRun; }

  get vaultId() { return this._vault?.id ?? game.settings.get(MODULE_ID, SETTINGS.VAULT_ID) ?? ""; }

  isStorageDocument(document) {
    const meta = storageMeta(document);
    return meta?.internal === true && [STORAGE.KIND_VAULT, STORAGE.KIND_PLAYER].includes(meta.kind);
  }

  isVaultDocument(document) {
    return storageMeta(document)?.kind === STORAGE.KIND_VAULT;
  }

  isProjectionDocument(document, userId = null) {
    const meta = storageMeta(document);
    if (meta?.kind !== STORAGE.KIND_PLAYER) return false;
    return userId == null || String(meta.userId ?? "") === String(userId);
  }

  async initialize() {
    if (this._initialized) return this.getStatus();
    if (game.user?.isGM) await this._initializeGM();
    else await this._initializePlayer();
    this._initialized = true;
    return this.getStatus();
  }

  async _initializeGM() {
    const configuredId = String(game.settings.get(MODULE_ID, SETTINGS.VAULT_ID) ?? "");
    let vault = configuredId ? game.journal?.get?.(configuredId) ?? null : null;
    if (!this.isVaultDocument(vault)) {
      vault = journalDocuments().find(document => this.isVaultDocument(document)) ?? null;
    }

    const storageVersion = Number(game.settings.get(MODULE_ID, SETTINGS.STORAGE_VERSION) ?? 0);
    if (!vault && storageVersion >= STORAGE.VERSION) {
      throw new CampaignStorageError("VAULT_MISSING", { configuredId, storageVersion });
    }

    if (!vault) {
      const legacyRaw = cloneData(game.settings.get(MODULE_ID, SETTINGS.DATA));
      if (legacyRaw?.protectedStorage === true) {
        throw new CampaignStorageError("VAULT_MISSING", { configuredId, storageVersion, legacyScrubbed: true });
      }
      const legacyState = normalizeState(legacyRaw);
      vault = await this._createVault(legacyState);
      this._migratedThisRun = true;
    }

    this._vault = vault;
    await this._enforceVaultOwnership(vault);
    if (String(game.settings.get(MODULE_ID, SETTINGS.VAULT_ID) ?? "") !== String(vault.id)) {
      await game.settings.set(MODULE_ID, SETTINGS.VAULT_ID, String(vault.id));
    }

    const canonical = normalizeState(cloneData(storedState(vault)));
    await this.syncPlayerProjections(canonical);

    // Security-critical: remove the former canonical payload from the world
    // setting only after the protected vault and player projections exist.
    await this._scrubLegacySetting();
    if (Number(game.settings.get(MODULE_ID, SETTINGS.STORAGE_VERSION) ?? 0) !== STORAGE.VERSION) {
      await game.settings.set(MODULE_ID, SETTINGS.STORAGE_VERSION, STORAGE.VERSION);
    }
  }

  async _initializePlayer() {
    this._projection = await this._findProjectionForUser(game.user?.id);
  }

  async _createVault(initialState) {
    const JournalEntryClass = globalThis.JournalEntry ?? globalThis.getDocumentClass?.("JournalEntry");
    if (!JournalEntryClass?.create) throw new CampaignStorageError("JOURNAL_CREATE_UNAVAILABLE");

    const name = localize("CAMPAIGN_FORGE.Security.VaultName", "Campaign Forge · Protected Data");
    const document = await JournalEntryClass.create({
      name,
      ownership: { default: ownershipNone() },
      flags: {
        [MODULE_ID]: {
          [STORAGE.FLAG_META]: {
            internal: true,
            kind: STORAGE.KIND_VAULT,
            storageVersion: STORAGE.VERSION,
            createdAt: new Date().toISOString()
          },
          [STORAGE.FLAG_STATE]: cloneData(initialState)
        }
      }
    }, { renderSheet: false });

    if (!document) throw new CampaignStorageError("VAULT_CREATE_FAILED");
    await game.settings.set(MODULE_ID, SETTINGS.VAULT_ID, String(document.id));
    return document;
  }

  async _enforceVaultOwnership(vault) {
    const current = cloneData(vault.ownership ?? {});
    const desired = { default: ownershipNone() };
    let changed = Number(current.default ?? ownershipNone()) !== ownershipNone();

    // Preserve explicit GM ownership if present, remove any non-GM grants.
    const gmIds = new Set(gmUsers().map(user => String(user.id)));
    for (const [userId, level] of Object.entries(current)) {
      if (userId === "default") continue;
      if (gmIds.has(String(userId))) desired[userId] = Number(level);
      else changed = true;
    }
    if (changed) await vault.update({ ownership: desired }, { render: false });
  }

  async _scrubLegacySetting() {
    const marker = {
      protectedStorage: true,
      storageVersion: STORAGE.VERSION,
      migratedAt: new Date().toISOString()
    };
    const current = game.settings.get(MODULE_ID, SETTINGS.DATA);
    const alreadyScrubbed = current?.protectedStorage === true && Number(current?.storageVersion) === STORAGE.VERSION;
    if (!alreadyScrubbed) await game.settings.set(MODULE_ID, SETTINGS.DATA, marker);
  }

  async _findProjectionForUser(userId) {
    if (!userId) return null;
    const ids = game.settings.get(MODULE_ID, SETTINGS.PROJECTION_IDS) ?? {};
    const configuredId = String(ids?.[userId] ?? "");
    let document = configuredId ? game.journal?.get?.(configuredId) ?? null : null;
    if (!document && configuredId && typeof globalThis.fromUuid === "function") {
      try { document = await globalThis.fromUuid(`JournalEntry.${configuredId}`); } catch { document = null; }
    }
    if (!this.isProjectionDocument(document, userId)) {
      document = journalDocuments().find(candidate => this.isProjectionDocument(candidate, userId)) ?? null;
    }
    return document;
  }

  async _ensureProjectionForUser(user) {
    let document = await this._findProjectionForUser(user.id);
    if (!document) {
      const JournalEntryClass = globalThis.JournalEntry ?? globalThis.getDocumentClass?.("JournalEntry");
      if (!JournalEntryClass?.create) throw new CampaignStorageError("JOURNAL_CREATE_UNAVAILABLE");
      document = await JournalEntryClass.create({
        name: localize("CAMPAIGN_FORGE.Security.PlayerProjectionName", "Campaign Forge · Player Data"),
        ownership: { default: ownershipNone(), [user.id]: ownershipObserver() },
        flags: {
          [MODULE_ID]: {
            [STORAGE.FLAG_META]: {
              internal: true,
              kind: STORAGE.KIND_PLAYER,
              userId: String(user.id),
              storageVersion: STORAGE.VERSION,
              createdAt: new Date().toISOString()
            },
            [STORAGE.FLAG_STATE]: buildPlayerProjection(createDefaultState())
          }
        }
      }, { renderSheet: false });
      if (!document) throw new CampaignStorageError("PLAYER_PROJECTION_CREATE_FAILED", { userId: user.id });
    }

    const desiredOwnership = { default: ownershipNone(), [user.id]: ownershipObserver() };
    const current = document.ownership ?? {};
    const sameOwnership = Number(current.default ?? ownershipNone()) === ownershipNone()
      && Number(current[user.id] ?? ownershipNone()) === ownershipObserver()
      && Object.keys(current).filter(key => key !== "default" && key !== String(user.id)).length === 0;
    if (!sameOwnership) await document.update({ ownership: desiredOwnership }, { render: false });

    const ids = cloneData(game.settings.get(MODULE_ID, SETTINGS.PROJECTION_IDS) ?? {});
    if (String(ids[user.id] ?? "") !== String(document.id)) {
      ids[user.id] = String(document.id);
      await game.settings.set(MODULE_ID, SETTINGS.PROJECTION_IDS, ids);
    }
    return document;
  }

  async syncPlayerProjections(state = null) {
    if (!game.user?.isGM) return;
    const canonical = normalizeState(cloneData(state ?? storedState(this._vault)));
    const validUserIds = new Set(playerUsers().map(user => String(user.id)));
    const idMap = cloneData(game.settings.get(MODULE_ID, SETTINGS.PROJECTION_IDS) ?? {});

    for (const user of playerUsers()) {
      const document = await this._ensureProjectionForUser(user);
      const projection = await buildPlayerProjectionForUser(canonical, user, { resolveDocument: resolveUuid });
      const existing = storedState(document);
      if (JSON.stringify(existing ?? null) !== JSON.stringify(projection)) {
        await document.setFlag(MODULE_ID, STORAGE.FLAG_STATE, cloneData(projection));
      }
      idMap[user.id] = String(document.id);
    }

    // Delete stale internal player projections when a Foundry user is removed.
    for (const document of journalDocuments()) {
      const meta = storageMeta(document);
      if (meta?.kind !== STORAGE.KIND_PLAYER) continue;
      if (!validUserIds.has(String(meta.userId ?? ""))) {
        await document.delete({ render: false });
      }
    }
    for (const userId of Object.keys(idMap)) {
      if (!validUserIds.has(String(userId))) delete idMap[userId];
    }
    const currentMap = game.settings.get(MODULE_ID, SETTINGS.PROJECTION_IDS) ?? {};
    if (JSON.stringify(currentMap) !== JSON.stringify(idMap)) {
      await game.settings.set(MODULE_ID, SETTINGS.PROJECTION_IDS, idMap);
    }
  }

  async refreshPlayerProjections() {
    if (!game.user?.isGM) return;
    const state = await this.load();
    await this.syncPlayerProjections(state);
  }

  async load() {
    if (!this._initialized) await this.initialize();
    if (game.user?.isGM) {
      if (!this._vault || !this.isVaultDocument(this._vault)) {
        throw new CampaignStorageError("VAULT_UNAVAILABLE");
      }
      return normalizeState(cloneData(storedState(this._vault)));
    }

    if (!this._projection || !this.isProjectionDocument(this._projection, game.user?.id)) {
      this._projection = await this._findProjectionForUser(game.user?.id);
    }
    if (!this._projection) {
      // Fail closed: never fall back to the legacy world setting for a player.
      return normalizeState(inflatePlayerProjection(buildPlayerProjection(createDefaultState())));
    }
    return normalizeState(inflatePlayerProjection(cloneData(storedState(this._projection))));
  }

  async save(state) {
    if (!game.user?.isGM) throw new CampaignStorageError("GM_REQUIRED");
    if (!this._initialized) await this.initialize();
    if (!this._vault || !this.isVaultDocument(this._vault)) throw new CampaignStorageError("VAULT_UNAVAILABLE");

    const normalized = normalizeState(cloneData(state));
    await this._vault.setFlag(MODULE_ID, STORAGE.FLAG_STATE, cloneData(normalized));
    await this.syncPlayerProjections(normalized);
    return cloneData(normalized);
  }

  getStatus() {
    const projectionIds = game.settings.get(MODULE_ID, SETTINGS.PROJECTION_IDS) ?? {};
    return {
      protected: Number(game.settings.get(MODULE_ID, SETTINGS.STORAGE_VERSION) ?? 0) >= STORAGE.VERSION,
      storageVersion: Number(game.settings.get(MODULE_ID, SETTINGS.STORAGE_VERSION) ?? 0),
      vaultId: this._vault?.id ?? String(game.settings.get(MODULE_ID, SETTINGS.VAULT_ID) ?? ""),
      projectionCount: Object.keys(projectionIds ?? {}).length,
      migratedThisRun: this._migratedThisRun
    };
  }
}
