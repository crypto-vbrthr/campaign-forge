## 0.7.2 hotfix – Live active-session changes

- Active sessions now render their current change log immediately below the live session card instead of only exposing changes after the session is closed.
- Manual live-session entries retain their Edit/Delete controls while the session is active.
- Active-session change counts now use the same structural-change visibility filter as the displayed live log, keeping the counter and visible rows consistent.
- Added regression coverage for active-session live rendering.

## 0.7.2 - Weather Snapshot & Entry Label Hotfix


### v0.7.2 hotfix – Session list & entry checkbox layout

- The currently active session is no longer rendered a second time in the historical session list. The top active-session card remains the single live-session view; the list below now contains closed sessions only.
- Active/Visible fields in the campaign entry editor use a fixed two-column checkbox/label grid so Foundry/theme form styles cannot separate labels from their checkboxes.

- Hardened Weather Forge snapshot capture against Weather Forge 1.1.x runtimes where `module.api` is available but the hidden `weatherState` setting is not registered. Campaign Forge now uses the public API when safe and otherwise reads the already-persisted Weather Forge world state as a read-only compatibility fallback, with latest history as a secondary fallback.
- Avoids noisy `ClientSettings.get()` warnings for the known unregistered-setting path and still never registers or writes Weather Forge settings itself.
- Reworked the entry `Active` / `Visible` controls into an explicit boolean field row with labels prepared in application context and module-scoped high-contrast CSS so Foundry theme/form rules cannot hide the captions.
- Added regression coverage for unregistered Weather Forge settings and visible entry checkbox labels.

## 0.7.2 - Context Fix

- Fixed session-start Weather Forge capture by attempting the live provider read directly instead of gating it on a potentially stale capability snapshot.
- Added a safe Weather Forge `getWeather()` fallback and a visible warning if an active Weather Forge still cannot provide context.
- Made the `Active` and `Visible` labels in the campaign entry editor explicitly visible and readable.
- Added deletion of completed sessions with a destructive confirmation warning. Active sessions cannot be deleted.
- Deleting a session repairs Keyplayer `lastSeenSessionId` references and, if another session is active, logs the deletion as a structural change.

## 0.7.2 - Creature & Weather Context

- Added Creature Forge context integration for Campaign entries. Existing creature/NPC Actors can be dropped onto an entry, opened directly, or created through the public embedded Creature Forge editor and automatically linked back to the entry.
- Added a dedicated ApplicationV2 host for the Creature Forge embedded editor so its native scroll/footer layout remains intact.
- Added Weather Forge context snapshots. Starting a session automatically records the current Weather Forge context when available, including weather, game date/daypart, City Forge provenance, and mismatch state.
- Event entries can capture, replace, or clear an explicit current-weather snapshot and can open Weather Forge directly.
- Weather snapshots are historical copies rather than live references, so later weather changes do not rewrite past sessions or events.
- Extended provider capability detection and public integration helpers for Creature Forge actor creation and Weather Forge context capture.
- Added DE/EN localization and regression coverage for Creature/Weather integration and snapshot normalization.

## 0.7.1 hotfix - NPC Forge embedded scrolling

### NPC Forge embedded host hardening
- Replaced the NPC Forge `DialogV2` wrapper with a dedicated `ApplicationV2` host. `DialogV2` wraps arbitrary content in an intrinsic-height form, which prevented NPC Forge's two internal scroll panes from receiving a reliable constrained height.
- The new host mirrors NPC Forge's own standalone shell: the editor mount receives the full available application height while Campaign Forge keeps its Generate / Commit / Cancel action bar in a fixed footer.
- NPC Forge remains mounted exclusively through its public `api.ui.createEditor()` / `NpcEditorSession` contract.


- Fixed the Campaign Forge NPC host losing the shared NPC Forge editor scrollbars.
- The DialogV2 content and host shell now preserve a constrained full-height layout with `min-height: 0`, allowing NPC Forge's own controls/preview scroll panes to calculate overflow correctly.
- Removed the host `height: auto` override that broke the embedded editor's internal scrolling contract.
- Added regression coverage for the embedded host sizing/overflow contract.

## 0.7.1 hotfix - NPC Forge host controls

- Switched the embedded NPC Forge integration to the documented `actionBar: "host"` mode.
- Campaign Forge now owns Generate, Commit/Use NPC, and Cancel controls outside NPC Forge's re-rendered mount element.
- Host controls call the public `session.generate()`, `session.commit()`, and `session.cancel()` methods directly and route failures through `session.reportError()`.
- This avoids relying on nested DialogV2 content to dispatch NPC Forge's internal action buttons and keeps controls stable across editor re-renders.
- Added DE/EN labels and regression coverage for the host-owned action path.

## 0.7.1
- Fixed NPC Forge embedded editor lifecycle in Campaign Forge: the host now waits for the shared editor to finish rendering before accepting Generate, avoids an eager concurrent generation race, wires Commit to Actor creation, and reports embedded action failures.

# Changelog

## 0.7.1 hotfix - Provider editor dialogs

- Fixed Loot Forge and Item Forge reward editor dialogs on Foundry versions where `DialogV2` requires at least one configured button.
- Added a localized Close button to provider editor dialogs.
- Applied the same hardening to the embedded NPC Forge dialog to prevent the identical failure path.
- Added a regression test that rejects empty `DialogV2` button arrays.

## 0.7.1 - Reward Providers

- Added Loot Forge and Item Forge reward types to status-triggered Reward Rules.
- Loot Forge rewards use the public embedded editor contract for host-local configuration and the public `generateLoot()` / `addLootToActor()` workflow for payout.
- Item Forge rewards store canonical generation requests, provide an embedded configuration/preview dialog, generate creation-ready Item sources through the public API, and let Campaign Forge own delivery.
- Added individual character, All players, and Party/Team Inventory destinations for both provider rewards. All-player provider rewards are duplicated in full rather than divided.
- Added provider configuration and preview summaries plus the existing mass-payout warning for provider rewards.
- Added optional Loot Forge magic-item mystification forwarding.
- Provider reward data survives state normalization/migration and remains part of the existing pending/granted/skipped/failed/reset lifecycle and session transaction log.
- Added provider-specific validation/errors and complete DE/EN localization.
- Regression suite expanded from 57 to 61 tests.


## 0.7.0

- Fixed CSS isolation so critical Campaign Forge application selectors are scoped beneath `.campaign-forge` and cannot leak into other Foundry/module UIs.
- Added a CSS isolation regression test covering the toolbar, tabs, panels, tree rows, editors, row actions, and icon buttons.
- Added a provider registry and capability detection layer for City Forge, NPC Forge, Creature Forge, Loot Forge, Item Forge, and Weather Forge.
- Added a Settings integration-status panel showing installation/activity state, provider version, and available capabilities without introducing hard module dependencies.
- Added generic external references to Campaign entries. City Forge references can currently target settlements, districts, locations, and factions and open the owning settlement directly.
- Added City Forge as the first external transition-action provider. Rules can set the settlement dimensions prosperity, supply, security, order, mood, or health; enable/disable existing state conditions; and activate/deactivate existing threats.
- City state changes are sent through City Forge's public campaign state-patch API and are included in Campaign Forge transition previews and active-session transaction logs.
- Added NPC Forge integration to Key Players. GMs can open NPC Forge or use its embedded editor to generate/create a new NPC and automatically register the resulting Actor as a Campaign Forge key player.
- Added provider-validation and external-link validation errors plus German and English localization for the complete integration foundation.
- Creature Forge, Loot Forge, Item Forge, and Weather Forge are detected and surfaced in the provider registry for upcoming focused integration releases.
- Regression suite expanded from 50 to 56 tests, including provider execution, City state-patch mapping, integration status, external references, and validation coverage.

## 0.6.1

- Added an **All players** reward target for XP, currency, and Item rewards.
- The all-player target resolves to player-owned character Actors and grants the configured reward to every matching character.
- XP grants the full configured XP amount to every player character.
- Currency and Item rewards explicitly do **not** split their configured amount when targeting all players; every player character receives the full bundle or quantity.
- Added an inline warning in the reward editor plus a confirmation warning before mass currency/Item payout.
- Added PF2e **Team inventory** targets for currency and Item rewards by exposing available Party Actors in the target selector.
- Party Actors remain unavailable for XP rewards.
- Reward previews now include their destination, making all-player and team-inventory payouts immediately visible before confirmation.
- Added validation for missing player characters and unsupported Item targets.
- Added German and English localization for all new reward-target UI and warnings.
- Regression suite expanded from 46 to 50 tests, including full-per-player payout and Party inventory coverage.

## 0.6.0

- Added optional conditions to transition rules while keeping the existing simple `from status -> to status` trigger model.
- Rules can require either **all** conditions or **at least one** condition. Nested boolean groups are deliberately not part of this release.
- Added condition types for another entry's status, active state, visibility, numeric campaign/reputation values, and group/chapter progress.
- Entry-status conditions support equality, inequality, and ordered comparisons such as “at least Discovered”.
- Numeric conditions support `=`, `!=`, `>`, `>=`, `<`, and `<=`.
- Group-progress conditions can compare either reached-entry count or progress percentage using the same type-aware progress logic as the Overview.
- Transition previews now show which conditions passed or failed and whether each matching rule will execute.
- Existing multi-action rules remain supported; several follow-up actions can run when a conditional rule passes.
- Conditional rules also work in chained automatic status transitions and Journal-originated status changes because evaluation remains inside the central Campaign Engine.
- Deleting an entry, tracker, or group used by a condition removes the broken condition and disables the affected rule rather than silently broadening it.
- Added full German and English localization for condition editing, comparison operators, validation, and preview output.
- Regression suite expanded from 38 to 46 engine tests.

## 0.5.1

- Fixed reward reset semantics: resetting now returns a reward to `locked` and clears its previous trigger metadata.
- A reset reward becomes due again when its configured `from status -> to status` trigger occurs later.
- Resetting an already granted reward still does not reverse previously awarded XP, currency, Items, or tracker/reputation changes; it deliberately allows a later trigger to award it again.
- Added regression coverage for skipped and already-granted rewards being re-armed and triggered again.

## 0.5.0

- Added status-triggered Reward Rules to Campaign Forge entries.
- One reward rule can contain multiple rewards and is tied to an explicit `from status -> to status` transition.
- Added built-in reward types for PF2e XP, currency, Foundry Items, and Campaign Forge reputation/campaign values.
- XP, currency, and Item rewards target a character Actor; reward Items can be selected by drag & drop from world Items or compendiums.
- Transition previews now include all rewards that become due, including rewards reached through chained status transitions.
- GMs can grant rewards immediately when changing status or defer payout while leaving rewards pending.
- Added explicit reward states: locked, pending, granted, skipped, and failed.
- Added duplicate-payout protection plus deliberate skip, reset, retry, and re-enable workflows.
- Failed external rewards remain retryable without rolling back the campaign status transition.
- Tracker/reputation rewards execute inside Campaign Forge and share the triggering transition transaction.
- Journal-originated status changes use the same reward preview and grant/defer workflow.
- Reward-rule maintenance and reward lifecycle changes are represented in session history.
- Public API expanded with reward-rule CRUD plus grant/skip/reset operations.
- Added German and English localization for the complete reward workflow.
- Regression suite expanded from 29 to 37 engine tests, including multi-reward rules and locked-reward safeguards.

## 0.4.0

- Added Journal references to Campaign Forge entries with drag & drop support for both `JournalEntry` and `JournalEntryPage` documents.
- Entries can link multiple Journals, assign semantic link roles, choose one primary Journal, open links directly, and retain broken references visibly for repair.
- Added a direct primary-Journal button to campaign rows that have Journal references.
- Campaign Forge entries can now be dragged from the Campaign tree into ProseMirror Journal text. They are stored as lightweight `@CampaignForge[...]` references and enriched into live Journal blocks after saving.
- Live Journal blocks show entry type, current status, and optionally the entry description. GMs can change status directly from the Journal while players receive a read-only view.
- Journal-originated status changes use the same transition engine, preview consequences, run dependent status rules, and are logged with `source: journal`.
- Entries marked not visible are not exposed through Journal embeds to non-GM users.
- Open Journal blocks can jump directly back to the referenced Campaign Forge entry.
- Journal blocks refresh when Campaign Forge data changes, avoiding stale status displays in already-open Journal views.
- Added German and English localization for the complete Journal-reference and Journal-embed workflow.
- Regression suite expanded from 24 to 29 engine tests.

## 0.3.0

- Added status-transition rules to Campaign Forge entries.
- Rules trigger on a specific `from status -> to status` change.
- Added follow-up actions for setting another entry status, activating/deactivating an entry, showing/hiding an entry, and adjusting a campaign value.
- Added chained rule execution when an automatic status change triggers another rule.
- Added a GM preview dialog listing all consequences before a status transition is applied.
- Added cycle detection plus depth/action safety limits so invalid rule chains are blocked atomically.
- Session logs now group a root status change and all automatic consequences through a shared transaction ID.
- Added a dedicated transition-rule editor in the Campaign view.
- Deleting entries or campaign values cleans obsolete rule actions and removes empty rules.
- Public API expanded with transition preview and rule CRUD methods.
- Added complete German and English localization for transition rules and consequence previews.
- Regression suite expanded from 20 to 24 engine tests.

## 0.2.1

- Added the Key Players view for important campaign NPCs.
- Foundry Actors can be added by drag & drop from the Actor sidebar.
- Key players reference their Actor UUID and use live Actor name/portrait data when available, with snapshot fallbacks for missing Actors.
- Added campaign roles, story states, GM notes, optional relationship/reputation tracker links, and Campaign Forge entry links.
- Added manual Key Player ordering and direct Actor opening.
- Key players can be pinned to the Overview and appear there with portrait, role, state, and optional relationship value.
- Added explicit “appeared in current session” tracking with last-session display and session change logging.
- Deleting linked entries or trackers cleans up Key Player references automatically.
- Missing Actors are displayed safely without deleting the stored reference.
- Public API expanded for Key Player create/update/delete/reorder/appearance operations.
- Added German and English localization for the complete Key Player workflow.
- Regression suite expanded from 16 to 20 engine tests.

## 0.2.0

- Added the first curated Overview workflow.
- Entries, groups/chapters, and campaign values can be pinned and unpinned from their normal views.
- Added manual ordering for pinned Overview items.
- Added automatic nested group progress calculation with entry-type-aware reached states.
- Added compact progress bars for groups and bounded campaign values.
- Added direct navigation from Overview items back to their source.
- Deleting a source object now removes its Overview reference automatically.
- Overview management changes are recorded as structural session changes when a session is active.
- Added German and English localization for the Overview controls and messages.
- Expanded regression coverage for pins, ordering, cleanup, and group progress.

## 0.1.4

- Sitzungsansicht nutzt ohne geöffneten Änderungseditor nun die volle verfügbare Fensterbreite.
- Bearbeiten- und Löschen-Aktionen manueller Sitzungsänderungen bleiben gemeinsam in einer Zeile.
- Der rechte Editorbereich wird nur noch reserviert, wenn tatsächlich eine Sitzungsänderung bearbeitet oder angelegt wird.

## 0.1.3

- Manuell hinzugefügte Änderungen einer aktiven Sitzung können jetzt bearbeitet werden.
- Bearbeitungen erhalten einen `editedAt`-Zeitstempel, ohne den ursprünglichen Sitzungszeitpunkt zu verändern.
- Deutsche UI-Terminologie für numerische Tracker vereinheitlicht: Reiter „Werte & Ruf“, „Kampagnenwerte“ und „Neuer Wert“.
- Texte zur Sitzungsprotokollierung entsprechend präzisiert.

## 0.1.2

- Added an **Add change** control to active sessions.
- Added manual session log entries for notes, discoveries, events, decisions, and other developments.
- Manual session entries support an optional description and can be removed again while the session is active.
- Clarified in the UI that changes to Campaign Forge entries and trackers are still logged automatically.
- Added engine tests for manual session changes.

## 0.1.1

### Fixed
- Register the Journal-directory render hook during Foundry `init`, so the Campaign Forge launcher is present on the Journal tab immediately after world load instead of only appearing after the Journal directory is re-rendered.
- Keep a defensive `ready`-time injection for already-rendered sidebars without creating duplicate buttons.

## 0.1.0

Initial foundation release.

### Added
- Campaign Forge Journal-sidebar launcher.
- ApplicationV2 GUI with five main tabs.
- Chapter/group/entry data model.
- Quest, Knowledge, Event, Mystery, Location, Item, and Note entry types.
- Type-specific status schemas.
- Collapsible and manually sortable campaign tree.
- Explicit numbered sessions with timestamps.
- Automatic session change logging while a session is active.
- Numeric trackers.
- German and English localization.
- Public module API foundation.
- Engine-level regression tests.
