# Campaign Forge v1.0.0

Campaign Forge is a campaign-management and campaign-memory module for Foundry VTT. It tracks quests, knowledge, events, long-running plot threads, sessions, reputation and other numeric campaign values, important NPCs, Journal references, rule-driven consequences, and rewards. A dedicated read-only Player View exposes only information explicitly published by the GM.

The module also acts as an optional integration hub for the Forge suite. City Forge, NPC Forge, Creature Forge, Loot Forge, Item Forge, and Weather Forge remain independent providers; Campaign Forge references or orchestrates their public functionality without taking ownership of their specialist data.


## Part of the Forge Suite

Campaign Forge is part of the **Forge Suite**, a growing collection of Foundry VTT modules and add-ons built for the busy Game Master. The suite is designed to reduce preparation and bookkeeping, make common GM tasks easier, and add useful tools that help make running and playing campaigns smoother and more enjoyable.

An overview of the Forge Suite, its modules, add-ons, and shared documentation is available here:

**Forge Suite:** https://github.com/crypto-vbrthr/pf2e-forge-suite

## v1.0.0 Stable Release

- Promoted the tested `1.0.0-rc.1` codebase to the first stable Campaign Forge release with no feature or state-schema changes.
- Public API v1 is now marked **stable** and its documented method/contract meanings are frozen for the 1.x line.
- Campaign state remains Schema v2 and protected persistence remains Storage Contract v1; no migration is required from `1.0.0-rc.1`.
- Optional City Forge, NPC Forge, Creature Forge, Loot Forge, Item Forge, and Weather Forge integrations remain capability-detected and non-mandatory.
- Final release validation covers protected persistence, Player View privacy, Journal integration, rewards, transition rules, provider integrations, localization, CSS isolation, backup/restore, and large-campaign behavior.

## v1.0.0-rc.1 Release Candidate & Final Review

- Completed the pre-1.0 architecture, persistence, security, integration, localization, and large-campaign review.
- Added Public API v1 release-candidate metadata, capability discovery, a versioned contract registry, and the `campaignForge.ready` discovery hook.
- Restricted raw provider API access and storage diagnostics in the Campaign Forge public API to GMs. Player-facing state access remains projection-only.
- Corrected outdated README storage/security notes left behind by the v0.9.2 protected-persistence migration.
- Corrected GM Player View preview group-progress calculation to use the published projection rather than hidden canonical descendants.
- Added RC manifest/version consistency and release-documentation regression coverage.
- No campaign-data migration is required from v0.9.2; protected storage remains Storage Contract v1 and campaign state remains Schema v2.
- Final automated regression suite: **114 tests**.

## v0.9.2 Protected Persistence & Security Hardening

- The complete GM campaign state now lives in an internal ownership-protected JournalEntry instead of a world setting readable through `ClientSettings`.
- Existing worlds migrate automatically on the first GM load. The old `campaignData` world-setting payload is scrubbed only after the protected document store and player projections exist.
- Every non-GM Foundry user receives a separate safe projection document containing only published Campaign Forge information. Journal and Actor references are included only when that specific user already has Observer access to the referenced Foundry document.
- The player repository never falls back to the legacy world setting, and non-GM writes are rejected at the repository boundary.
- Internal Campaign Forge storage documents are hidden from the Journal directory for a clean workspace. This is only UI polish; Foundry document ownership is the real security boundary.
- Settings now reports protected-storage status and the number of maintained player projections.
- Missing protected storage after migration fails closed rather than silently creating a replacement and risking data loss.
- Added regression coverage for migration, legacy-setting scrubbing, per-user projection filtering, fail-closed recovery behavior, and non-GM write rejection.


## v0.9.1 Search Focus Hotfix

- Campaign-tree live search now preserves keyboard focus and caret position across its debounced rerender. Typing can continue normally while results update.
- The fix only restores focus when the search field was still the active control when the debounced filter render began, so clicking elsewhere does not pull focus back unexpectedly.
- Added regression coverage for the search-focus preservation path. Full regression suite: **104 tests**.

## v0.9.0 Hardening & UX Review

- Added fast campaign-tree search across entry titles, descriptions, tags, and group text, plus entry-type and scope filters for active/inactive, player-visible, and GM-only content. Filtering expands matching branches automatically without changing saved collapse state.
- Manual reordering is intentionally disabled while filters are active so a temporary filtered projection cannot accidentally rewrite the canonical campaign order.
- Large session histories now render in batches of 20 closed sessions with an explicit **Show older sessions** action, reducing initial DOM load in long-running campaigns.
- Added a **Data Integrity & Backup** section to Settings. It audits structural integrity plus missing Journal, Actor, reward-Item, and optional-provider references and can navigate directly to affected Campaign Forge objects.
- Added JSON backup export/import with normalization and integrity validation. Invalid imports are rejected before replacing the active campaign state.
- State normalization now repairs safe orphan/cycle cases deterministically and disables transition rules whose targets no longer exist instead of allowing broken automation to execute.
- Campaign mutations are serialized on the client and state revisions are incremented, preventing rapid overlapping asynchronous edits from overwriting each other.
- Added guarded public GM-only state export/import helpers for recovery and tooling.
- Optimized campaign-tree and descendant traversal with indexed parent lookups, improving behavior for large chapter/group structures.
- Added regression coverage for concurrent mutations, state repair/audit, guarded imports, large group progress, filters, diagnostics, backups, and UX hardening. Full regression suite: **103 tests**.


## v0.8.0 Player View

- Players can open a dedicated read-only Campaign Forge view from the Journal sidebar. GMs can open the same view from the new **Player View / Spieleransicht** tab as a preview.
- Player View contains **Overview**, **Campaign**, and **Key Players** tabs. Its application projection omits session logs, GM notes, transition/reward rules, and Forge provider payloads.
- Entries use the existing visibility flag, now labelled explicitly as player visibility. Chapters/groups, campaign values, key players, and overview pins must be explicitly published separately.
- Values and key players have separate player-facing text fields so GM descriptions and notes can remain private.
- Group progress is privacy-safe: only visible entries are counted, preventing hidden clues from being inferred through progress totals.
- Hidden parent groups are skipped and visible descendants are re-homed to the nearest published ancestor or root.
- Journal and Actor shortcuts only appear when the player already has Foundry observer permission for the referenced document.


## v0.7.3 Integration Review & Workspace Polish

- The default Campaign Forge window is larger (1220×800) and the side editor has more room for integration-heavy entries, while existing responsive fallbacks remain intact.
- The integration layer was reviewed against the supplied City Forge, NPC Forge, Creature Forge, Loot Forge, Item Forge, and Weather Forge builds. All remain optional runtime providers rather than hard dependencies.
- Multiple City Forge consequences for one settlement are now combined into one State Patch. Campaign Forge dry-runs the complete batch first and persists it with City Forge's optimistic revision guard.
- The Settings integration panel now shows public API and embedded-editor contract versions when the provider advertises them.
- Weather Forge compatibility access remains strictly read-only; Campaign Forge never registers or writes Weather Forge settings.
- DE/EN localization key parity and integration-boundary checks are part of the automated regression suite.

### Integration-review note

Item Forge currently advertises embedded-editor support but does not expose a public `createEmbeddedEditor()` factory. Campaign Forge therefore prefers such a factory when available and otherwise uses Item Forge's documented reusable `ItemForgeEditor` module asset. This is the only integration seam that is not yet a pure runtime API call; it is isolated in the provider registry so a future Item Forge factory can replace the fallback without touching Campaign Engine code.

Campaign Forge is a GM-facing Foundry VTT module for tracking campaign structure, knowledge, quests, events, sessions, long-term campaign values, important NPCs, and rule-driven campaign state changes.

## v0.7.2 Creature & Weather Context

- Campaign entries can link existing Foundry creature/NPC Actors by drag & drop as Creature Forge references. Linked Actors remain owned by Foundry/Creature Forge and can be opened directly from Campaign Forge.
- A saved Campaign entry can open the public embedded Creature Forge editor in a dedicated ApplicationV2 host. Creating the Actor from that host automatically adds the resulting Actor UUID as an external Campaign reference.
- The Creature Forge integration uses the stable public `api.ui.creatureEditor.create()` and `api.createActor()` contracts and does not duplicate Creature Forge generation logic.
- Starting a Campaign Forge session automatically captures the current Weather Forge context when available. The stored snapshot includes current weather, game date/daypart, optional City Forge place provenance, provider version, and mismatch state.
- Event entries can explicitly capture, refresh, or clear a Weather Forge snapshot. Snapshots are historical copies, not live weather links, so later weather changes never rewrite the recorded event/session context.
- Weather Forge and Creature Forge remain optional. Missing or inactive providers do not prevent Campaign Forge from loading or using already-stored historical snapshots and references.
- Added German/English localization and regression tests for Creature Forge host integration, Actor references, session/event snapshots, provider capability detection, and Weather Forge normalization.


## v0.7.1 Reward Providers

- Added **Loot Forge** and **Item Forge** as optional Campaign Forge reward providers. Both remain runtime-only integrations with no hard module dependency.
- Loot Forge rewards store the host-local Loot Forge generation configuration and can be edited through Loot Forge's public embedded editor in a dedicated Campaign Forge dialog. The reward is generated only when it is actually granted.
- Item Forge rewards store a canonical Item Forge request and use the reusable embedded Item Forge editor for configuration and preview. Item Forge returns a creation-ready Item source which Campaign Forge delivers to the configured target when the reward is granted.
- Both provider rewards can target an individual player character, **All players**, or a PF2e **Team inventory** Party Actor. All-player delivery duplicates the complete reward for each player rather than dividing it.
- Provider reward previews are informational; payout uses the saved Forge configuration/request and generates a fresh result at grant time.
- Loot Forge rewards optionally pass through the existing magic-item mystification setting.
- Provider rewards participate in the existing reward lifecycle (`locked`, `pending`, `granted`, `skipped`, `failed`), duplicate-payout protection, reset/retry behavior, transition previews, Journal-triggered status changes, and session transaction logging.
- Added German and English localization, provider configuration summaries, and regression coverage for Loot Forge delivery, Item Forge generation, and provider reward-rule persistence.

## v0.7.0 Integration Foundation

- Added a central Forge provider registry with capability detection for City Forge, NPC Forge, Creature Forge, Loot Forge, Item Forge, and Weather Forge. Optional modules remain optional and Campaign Forge keeps working when a provider is absent or inactive.
- Added an integration status panel in Settings showing provider version, readiness, and exposed capabilities.
- Campaign entries now support generic external references owned by other Forge modules. The first concrete reference provider is City Forge, with links to settlements, districts, locations, and factions.
- Added City Forge transition actions. A Campaign Forge status transition can set a City Forge state dimension, enable/disable an existing city condition, or activate/deactivate an existing threat through City Forge's public campaign state-patch contract.
- Provider actions participate in the normal transition preview and active-session transaction log.
- Added NPC Forge integration for Key Players: open NPC Forge directly or create a new NPC in the embedded NPC editor and automatically register the created Actor as a Campaign Forge key player.
- Creature Forge, Loot Forge, Item Forge, and Weather Forge are capability-detected in this foundation release and are prepared for the following integration blocks without creating hard dependencies.
- Added German and English localization for all integration UI, validation, and session-history text.

## v0.6.1 Reward target polish

- XP, currency, and Item rewards can target **All players**. This resolves to all player-owned character Actors.
- Currency and Item rewards can additionally target a PF2e **Team inventory** through available Party Actors.
- All-player currency and Item rewards are never divided: every player character receives the complete configured amount or Item quantity, with an explicit warning before payout.
- Reward previews show the selected destination.

## v0.6.0 Conditional transition rules

- Transition rules may now contain optional additional conditions.
- A rule can require all conditions or at least one condition.
- Conditions can inspect another entry's status, active state, or visibility, compare campaign/reputation values, or check group/chapter progress.
- Group progress can be tested by reached-entry count or percentage.
- The transition preview reports passed and failed conditions before the status change is confirmed.
- Existing multi-action rules continue to work, including chained automatic status changes.
- Reward reset behavior from v0.5.1 remains unchanged: reset re-arms a reward for a later matching trigger without reversing anything already granted.

## v0.5.0 Rewards milestone

- Journal sidebar launcher and ApplicationV2 campaign workspace.
- Campaign tree with chapters, nested groups, typed entries, manual ordering, and drag & drop.
- Explicit numbered sessions with automatic and manual change logging.
- Numeric campaign values for reputation, progress, collections, and similar long-running values.
- Curated Overview with pinned entries, groups, campaign values, and key players.
- Key Players reference existing Foundry Actors and can track campaign role, state, relationship values, linked entries, and last session appearance.
- New **Transition Rules** for Campaign Forge entries.
- Rules trigger on an explicit status transition such as `active -> completed`.
- A rule can change another entry's status, active state, or visibility, and can adjust a campaign value.
- One status change can execute several follow-up actions.
- Status changes caused by rules can trigger further rules, allowing controlled chains.
- Before a status change with consequences is applied, the GM receives a preview of all resulting changes.
- Cyclic transition chains are detected and blocked before data is changed.
- All changes in one chain share a transaction identifier and are grouped visually in the session history.
- Transition-rule editing and rule-maintenance changes are treated as structural session changes.
- Campaign entries can reference multiple Foundry Journals or individual Journal pages, with semantic roles and one primary Journal.
- Existing Campaign Forge entries can be dragged into ProseMirror Journal text and are enriched into live blocks after saving.
- GMs can change entry status directly from a Journal live block; the central transition engine, consequence preview, and session logging remain in effect.
- Non-GM users receive read-only live blocks and entries marked hidden are not exposed through Journal embeds.
- German and English localization for all application text.
- New **Reward Rules** attach one or more rewards to an explicit entry status transition.
- Supported built-in rewards: PF2e character XP, currency, existing Foundry Items, and Campaign Forge reputation/campaign values.
- XP, currency, and Item rewards can target an individual character or all player characters; currency and Items can also target a PF2e Party Actor as team inventory. Items can be referenced from the world or a compendium by drag & drop.
- Reward previews are shown together with transition consequences before the status change is applied.
- The GM can grant due rewards immediately or defer them while still applying the status transition.
- Reward lifecycle states distinguish not-yet-due, pending, granted, skipped, and failed rewards.
- Granted rewards are protected against accidental duplicate payout; skipped or failed rewards can be deliberately reset/retried.
- Journal-originated status changes use the same reward flow as changes made in Campaign Forge.
- Reward changes are included in the active session log and share transaction IDs with the triggering status transition.

## Storage and security

The canonical GM campaign state is stored in an internal ownership-protected `JournalEntry`. The legacy `campaignData` world-setting payload is retained only as a scrubbed migration marker after a successful upgrade. Each non-GM user receives a separate ownership-filtered projection document containing only published player data and only document UUIDs that user may observe.

UI collapse state and display preferences remain client-scoped. Overview pins, Actor links, Journal links, and transition targets store references rather than copies of the referenced Foundry or Forge-owned documents.

## Stable release status

Campaign Forge 1.0.0 is the first stable release. Public API v1 and the listed contract-version meanings are frozen for the 1.x line; additive, backward-compatible capabilities may still be introduced. Optional Forge providers remain optional, and missing integrations must never prevent core campaign management from loading.

## Journal integration

Campaign entries can reference one or more Foundry Journals or individual Journal pages. A primary Journal can be opened directly from the Campaign tree. Existing entries can also be dragged into ProseMirror Journal text; after the Journal is saved, Campaign Forge enriches the lightweight reference into a live block. GM users can change the entry status from that block, and all transition rules continue to apply through the central Campaign Engine.

Journal embeds are references rather than copies. Renamed entries, status changes, descriptions, and visibility therefore remain synchronized with Campaign Forge data.


### NPC Forge embedding
Campaign Forge mounts NPC Forge through its public embedded-editor session in a dedicated ApplicationV2 host. This preserves NPC Forge's native independent scrolling for controls and preview while Campaign Forge owns the Generate / Commit / Cancel footer.

### v0.7.2 context fixes

- Session start captures the current Weather Forge context directly and falls back to Weather Forge's current weather state when the richer context read is unavailable.
- Completed sessions can be deleted from the Sessions tab after a destructive confirmation. Active sessions must be ended first.
- Campaign entry `Active` and `Visible` checkboxes use explicit localized labels.

### Creature references in campaign entries

Creature Actor links are displayed in a dedicated **Creature Forge** area of the entry editor. Actors added by drag & drop and Actors created through the embedded Creature Forge are shown there immediately with their portrait, current name, open action, and remove action. The stored link remains a UUID reference; Campaign Forge does not duplicate creature data.
