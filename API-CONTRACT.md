# Campaign Forge Public API v1 — Stable Contract

## Status

Campaign Forge 1.0.0 exposes **Public API v1** as a stable contract.
Public API v1 method meanings and the listed contract-version meanings are frozen for the 1.x line. Additive, backward-compatible capabilities may still be introduced.

```js
const campaign = game.modules.get("campaign-forge")?.api;

campaign.apiVersion === 1;
campaign.stability === "stable";
campaign.schemaVersion === 2;
```

The package release string is available as `campaign.version`.

## Contract registry

```js
campaign.contracts
```

1.0.0 exposes:

```js
{
  api: 1,
  stateSchema: 2,
  playerProjection: 1,
  journalEmbed: 1,
  protectedStorage: 1
}
```

Consumers should prefer capability detection over comparing package release strings:

```js
campaign.getCapabilities();
```

## Ready hook

Campaign Forge emits this hook only after protected persistence initializes successfully and the Campaign Engine, optional provider discovery, and public API are available:

```js
Hooks.on("campaignForge.ready", api => {
  // api === game.modules.get("campaign-forge")?.api
});
```

The hook name is also exposed as `campaign.hooks.ready`.

## Player-safe reads

`getState()` is permission-sensitive:

- GMs receive the canonical Campaign Forge state.
- non-GMs receive only their already-filtered Player View projection.

`getPlayerState()` returns the generic published Player View projection and is suitable for GM preview/read-only consumers. When called by a non-GM, its source state is already that user's permission-filtered projection.

The published projection omits GM notes, sessions, transition and reward definitions, provider action payloads, and private entries/groups/trackers/key players. The per-user protected projection documents additionally omit Journal/Actor UUIDs that the specific user cannot observe.

## GM-only mutation surface

Campaign mutations are GM-only. This includes group/entry creation and updates, status transitions, transition/reward-rule maintenance, reward payout, sessions, trackers, key players, overview publication, backups/imports, provider API access, and protected-storage maintenance.

Callers must handle rejected GM-only calls rather than assuming client role.

## Journal embeds

`getJournalEmbedSyntax(entryId, mode)` returns the stable Campaign Forge Journal reference syntax for `card` or `compact` mode. Journal status changes by a GM still pass through the central Campaign Engine, including transition consequences and reward handling.

## Optional Forge providers

Provider readiness can be inspected through:

```js
campaign.getIntegrationStatus();
campaign.integrations.getStatus();
```

Raw provider APIs are intentionally exposed through `campaign.integrations.getApi(providerId)` only to GMs. Consumers that directly integrate with another Forge should normally use that Forge's own public API instead of routing through Campaign Forge.

Optional providers are not hard dependencies and must be feature-detected.

## Persistence contract

Canonical GM state lives in an ownership-protected internal `JournalEntry`. Non-GM clients read separate per-user projection documents. The legacy world setting is not a canonical persistence source after migration.

Storage diagnostics are GM-only:

```js
campaign.storage.getStatus();
await campaign.storage.refreshPlayerProjections();
```

## Compatibility rule for 1.0

Public API v1 method meanings and the listed contract-version meanings are frozen for the 1.x line. Additive methods and optional fields may be introduced when they remain backward compatible. A breaking semantic change requires a new API/contract version.
