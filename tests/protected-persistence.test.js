import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODULE_ID, SETTINGS, STORAGE } from "../scripts/core/constants.js";
import { FoundryCampaignRepository, CampaignStorageError } from "../scripts/data/foundry-repository.js";
import { normalizeState } from "../scripts/data/state.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

class FakeCollection {
  constructor() { this.contents = []; }
  get(id) { return this.contents.find(document => document.id === id) ?? null; }
  values() { return this.contents.values(); }
}

class FakeDocument {
  constructor(collection, data, id) {
    this.collection = collection;
    this.id = id;
    this.name = data.name ?? "";
    this.ownership = structuredClone(data.ownership ?? { default: 0 });
    this.flags = structuredClone(data.flags ?? {});
  }
  getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
  async setFlag(scope, key, value) {
    this.flags[scope] ??= {};
    this.flags[scope][key] = structuredClone(value);
    return this;
  }
  async update(changes) {
    if (changes.ownership) this.ownership = structuredClone(changes.ownership);
    return this;
  }
  async delete() {
    this.collection.contents = this.collection.contents.filter(document => document !== this);
  }
}

function setupFoundry({ legacyState, users, uuidDocuments = {} }) {
  const values = new Map([
    [`${MODULE_ID}.${SETTINGS.DATA}`, structuredClone(legacyState)],
    [`${MODULE_ID}.${SETTINGS.STORAGE_VERSION}`, 0],
    [`${MODULE_ID}.${SETTINGS.VAULT_ID}`, ""],
    [`${MODULE_ID}.${SETTINGS.PROJECTION_IDS}`, {}]
  ]);
  const journal = new FakeCollection();
  let nextDocument = 0;
  const gm = users.find(user => user.isGM);

  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
  globalThis.game = {
    user: gm,
    users,
    journal,
    i18n: { localize: key => key },
    settings: {
      get(scope, key) { return structuredClone(values.get(`${scope}.${key}`)); },
      async set(scope, key, value) {
        values.set(`${scope}.${key}`, structuredClone(value));
        return value;
      }
    }
  };
  globalThis.JournalEntry = class {
    static async create(data) {
      const document = new FakeDocument(journal, data, `internal-${++nextDocument}`);
      journal.contents.push(document);
      return document;
    }
  };
  globalThis.fromUuid = async uuid => {
    if (uuid.startsWith("JournalEntry.internal-")) return journal.get(uuid.split(".")[1]);
    return uuidDocuments[uuid] ?? null;
  };

  return { values, journal, gm };
}

function permissionDocument(allowedUserIds) {
  return {
    testUserPermission(user, level) {
      return level === "OBSERVER" && allowedUserIds.has(user.id);
    }
  };
}

function legacyCampaign() {
  return normalizeState({
    groups: [{ id: "g", title: "Public Group", kind: "chapter", playerVisible: true }],
    entries: [
      {
        id: "visible", type: "knowledge", title: "Visible clue", description: "Safe", status: "discovered",
        visible: true, parentId: "g",
        journalLinks: [
          { id: "pub", uuid: "JournalEntry.public", role: "handout", primary: true, label: "Public" },
          { id: "priv", uuid: "JournalEntry.private", role: "notes", primary: false, label: "Private" }
        ],
        transitionRules: [{ id: "secret-rule", enabled: true, fromStatus: "unknown", toStatus: "discovered", conditions: [], actions: [] }]
      },
      { id: "hidden", type: "knowledge", title: "Secret clue", description: "Secret", status: "confirmed", visible: false, parentId: "g" }
    ],
    trackers: [{ id: "rep", title: "Reputation", value: 5, playerVisible: true, playerDescription: "Known reputation" }],
    keyPlayers: [{
      id: "kp", actorUuid: "Actor.secretNpc", actorName: "Known Name", actorImg: "npc.webp", role: "informant", state: "active",
      playerVisible: true, playerNote: "Known to the party", note: "GM-only motive"
    }],
    overviewPins: [{ id: "pin", targetType: "entry", targetId: "visible", playerVisible: true }],
    sessions: [{ id: "session", number: 1, status: "closed", changes: [{ targetTitle: "Secret session detail" }] }]
  });
}

test("legacy world-setting state migrates into a protected GM vault and is scrubbed", async () => {
  const users = [
    { id: "gm", isGM: true },
    { id: "p1", isGM: false },
    { id: "p2", isGM: false }
  ];
  const publicJournal = permissionDocument(new Set(["p1", "p2"]));
  const privateJournal = permissionDocument(new Set([]));
  const actor = permissionDocument(new Set(["p1"]));
  const { values, journal } = setupFoundry({
    legacyState: legacyCampaign(), users,
    uuidDocuments: {
      "JournalEntry.public": publicJournal,
      "JournalEntry.private": privateJournal,
      "Actor.secretNpc": actor
    }
  });

  const repository = new FoundryCampaignRepository();
  await repository.initialize();

  const status = repository.getStatus();
  assert.equal(status.protected, true);
  assert.equal(status.projectionCount, 2);
  assert.equal(repository.migratedThisRun, true);

  const vault = journal.get(status.vaultId);
  assert.ok(vault);
  assert.equal(vault.ownership.default, 0);
  assert.equal(vault.getFlag(MODULE_ID, STORAGE.FLAG_META).kind, STORAGE.KIND_VAULT);
  assert.equal(vault.getFlag(MODULE_ID, STORAGE.FLAG_STATE).sessions.length, 1);
  assert.equal(vault.getFlag(MODULE_ID, STORAGE.FLAG_STATE).entries.some(entry => entry.id === "hidden"), true);

  const legacy = values.get(`${MODULE_ID}.${SETTINGS.DATA}`);
  assert.equal(legacy.protectedStorage, true);
  assert.equal(JSON.stringify(legacy).includes("Secret clue"), false);
  assert.equal(JSON.stringify(legacy).includes("Secret session detail"), false);

  const projectionIds = values.get(`${MODULE_ID}.${SETTINGS.PROJECTION_IDS}`);
  const p1Projection = journal.get(projectionIds.p1).getFlag(MODULE_ID, STORAGE.FLAG_STATE);
  const p2Projection = journal.get(projectionIds.p2).getFlag(MODULE_ID, STORAGE.FLAG_STATE);
  assert.deepEqual(p1Projection.entries.map(entry => entry.id), ["visible"]);
  assert.deepEqual(p1Projection.entries[0].journalLinks.map(link => link.uuid), ["JournalEntry.public"]);
  assert.equal(p1Projection.keyPlayers[0].actorUuid, "Actor.secretNpc");
  assert.equal(p2Projection.keyPlayers[0].actorUuid, "");
  assert.equal("sessions" in p1Projection, false);
  assert.equal(JSON.stringify(p1Projection).includes("GM-only motive"), false);
  assert.equal(JSON.stringify(p1Projection).includes("secret-rule"), false);
});

test("player repository reads only its protected projection and cannot save canonical state", async () => {
  const users = [{ id: "gm", isGM: true }, { id: "p1", isGM: false }];
  const { journal } = setupFoundry({ legacyState: legacyCampaign(), users });
  const gmRepository = new FoundryCampaignRepository();
  await gmRepository.initialize();

  game.user = users[1];
  const playerRepository = new FoundryCampaignRepository();
  await playerRepository.initialize();
  const state = await playerRepository.load();

  assert.equal(state.entries.some(entry => entry.id === "hidden"), false);
  assert.equal(state.sessions.length, 0);
  assert.equal(state.groups[0].playerVisible, true);
  assert.equal(state.entries[0].visible, true);
  assert.equal(journal.contents.some(document => document.getFlag(MODULE_ID, STORAGE.FLAG_META)?.kind === STORAGE.KIND_VAULT), true);

  await assert.rejects(
    () => playerRepository.save(state),
    error => error instanceof CampaignStorageError && error.code === "GM_REQUIRED"
  );
});

test("missing protected vault fails closed after migration instead of rebuilding from player data", async () => {
  const users = [{ id: "gm", isGM: true }];
  const { values } = setupFoundry({ legacyState: legacyCampaign(), users });
  values.set(`${MODULE_ID}.${SETTINGS.STORAGE_VERSION}`, STORAGE.VERSION);
  values.set(`${MODULE_ID}.${SETTINGS.VAULT_ID}`, "gone");
  values.set(`${MODULE_ID}.${SETTINGS.DATA}`, { protectedStorage: true, storageVersion: STORAGE.VERSION });

  const repository = new FoundryCampaignRepository();
  await assert.rejects(
    () => repository.initialize(),
    error => error instanceof CampaignStorageError && error.code === "VAULT_MISSING"
  );
});

test("security block no longer uses the world setting as canonical persistence", () => {
  const repository = fs.readFileSync(path.join(ROOT, "scripts", "data", "foundry-repository.js"), "utf8");
  const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
  const sidebar = fs.readFileSync(path.join(ROOT, "scripts", "integrations", "journal-sidebar.js"), "utf8");
  const template = fs.readFileSync(path.join(ROOT, "templates", "campaign-forge.hbs"), "utf8");

  assert.match(repository, /KIND_VAULT/);
  assert.match(repository, /setFlag\(MODULE_ID, STORAGE\.FLAG_STATE/);
  assert.match(repository, /Fail closed: never fall back to the legacy world setting for a player/);
  assert.match(repository, /buildPlayerProjectionForUser/);
  assert.match(main, /refreshPlayerProjections/);
  assert.match(sidebar, /hideInternalStorageDocuments/);
  assert.match(template, /CAMPAIGN_FORGE\.Security\.Protected/);
});
