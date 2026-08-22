# Campaign Forge v0.7.2

### v0.7.2 compatibility hotfix

- Session weather capture now tolerates a Weather Forge 1.1.x runtime in which its API is exposed before/without the hidden `weatherState` setting being registered. Campaign Forge falls back read-only to Weather Forge's persisted world state/history and does not register foreign settings.
- The Campaign entry `Active` and `Visible` checkboxes now use explicit prepared labels and hardened module-scoped styling so their captions remain visible across Foundry themes.

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

## Storage

Campaign data is stored in a hidden world setting. UI collapse state and display preferences are client-scoped. Overview pins, Actor links, and transition targets store references rather than copies of Campaign Forge content.

## Next planned blocks

Reward providers for Loot Forge and Item Forge, Creature Forge references, Weather Forge session/event context, further Journal polish, and player-facing permissions.


## Journal integration

Campaign entries can reference one or more Foundry Journals or individual Journal pages. A primary Journal can be opened directly from the Campaign tree. Existing entries can also be dragged into ProseMirror Journal text; after the Journal is saved, Campaign Forge enriches the lightweight reference into a live block. GM users can change the entry status from that block, and all transition rules continue to apply through the central Campaign Engine.

Journal embeds are references rather than copies. Renamed entries, status changes, descriptions, and visibility therefore remain synchronized with Campaign Forge data.


### NPC Forge embedding
Campaign Forge mounts NPC Forge through its public embedded-editor session in a dedicated ApplicationV2 host. This preserves NPC Forge's native independent scrolling for controls and preview while Campaign Forge owns the Generate / Commit / Cancel footer.

### v0.7.2 context fixes

- Session start captures the current Weather Forge context directly and falls back to Weather Forge's current weather state when the richer context read is unavailable.
- Completed sessions can be deleted from the Sessions tab after a destructive confirmation. Active sessions must be ended first.
- Campaign entry `Active` and `Visible` checkboxes use explicit localized labels.
