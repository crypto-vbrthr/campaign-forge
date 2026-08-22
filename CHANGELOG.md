## 1.0.0 - Stable Release

- Promoted the validated `1.0.0-rc.1` codebase to the first stable release without changing Campaign State Schema v2 or Protected Storage Contract v1.
- Marked Public API v1 as stable and froze the documented API/contract meanings for the 1.x line.
- Updated package metadata, README, API contract, and release regression checks for stable status.
- No campaign-data migration is required from `1.0.0-rc.1`.

## 1.0.0-rc.1 - Release Candidate & Final Review

- Completed the final pre-1.0 review across Campaign Engine, protected persistence, Player View privacy, Journal integration, optional Forge providers, rewards, localization, CSS isolation, backups, and large-campaign behavior.
- Added Public API v1 release-candidate metadata: `apiVersion`, `stability`, `schemaVersion`, versioned `contracts`, capability discovery, and a `campaignForge.ready` hook that is emitted only after protected storage initializes successfully.
- Raw optional-provider API access and protected-storage diagnostics through Campaign Forge's public API are now GM-only.
- Corrected stale README text that still described the pre-v0.9.2 world-setting persistence model.
- Added RC manifest/version/documentation regression checks.
- Campaign state remains Schema v2 and protected persistence remains Storage Contract v1; upgrading from v0.9.2 does not require another data migration.

## 0.9.2 - Protected Persistence & Security Hardening

- Moved the canonical GM campaign state out of the client-readable world setting and into an ownership-protected internal JournalEntry.
- Added an automatic one-time migration from the legacy `campaignData` setting. The legacy setting is scrubbed only after the protected vault and player projections have been created successfully.
- Added one permission-filtered internal player-projection JournalEntry per non-GM user. These projections contain only published Campaign Forge data and only include Journal/Actor UUIDs the specific user can observe.
- Player repositories fail closed and never fall back to the legacy world setting. Player-side mutations are rejected defensively even if called outside the normal UI/API guard.
- Added automatic projection refresh after Campaign Forge saves and after relevant Foundry ownership/user changes. Stale projection documents are removed when users are deleted.
- The protected vault defaults to no player ownership; non-GM ownership grants are stripped during initialization. Missing vaults after migration fail closed instead of silently creating an empty replacement.
- Internal storage documents are hidden from the Journal directory UI; this is UX-only and not the security boundary. Document ownership remains the actual access control.
- Added a Settings persistence/security status panel and public GM storage diagnostics/refresh helpers.
- Added migration, projection filtering, fail-closed storage, and non-GM write regression coverage. Full regression suite: **108 tests**.

## 0.9.1 - Search Focus Hotfix

- Fixed campaign-tree live search losing keyboard focus after the debounced results rerender.
- Search focus and caret/selection are restored after filtering only when the field was still active when the rerender started, avoiding unwanted focus stealing after the user clicks elsewhere.
- Added regression coverage for the focus-preservation path. Full regression suite: **104 tests**.

## 0.9.0 - Hardening & UX Review

- Added campaign-tree text search, type filtering, and scope filtering for active/inactive, player-visible, and GM-only content. Matching branches auto-expand while saved collapse state remains untouched.
- Disabled manual campaign reordering while a filter is active to protect canonical ordering from filtered-view drag operations.
- Closed-session history now renders 20 sessions at a time with an explicit load-more action for long-running campaigns.
- Added a Settings **Data Integrity & Backup** panel with structural audit results plus missing Journal, Creature Actor, Key Player Actor, reward Item, and inactive-provider diagnostics.
- Added direct navigation from integrity issues to the affected Campaign Forge object when possible.
- Added JSON backup export/import. Imports are normalized, audited, and rejected atomically if duplicate IDs, multiple active sessions, duplicate session numbers, or other fatal integrity faults are present.
- Hardened state normalization: orphaned groups/entries are safely re-homed, group cycles are broken deterministically, stale overview pins are removed, and transition rules with missing targets are disabled.
- Added serialized client-side mutation execution and state revision increments to prevent overlapping asynchronous edits from losing updates.
- Added GM-only public API helpers for state export/import.
- Optimized group/entry traversal with indexed parent lookups and added large-data regression coverage.
- Added DE/EN localization for all hardening and filter UI.
- Documented that the player-facing projection is filtered but the canonical world-setting persistence is not an adversarial secrecy boundary; ownership-protected canonical storage remains a pre-release architecture item.
- Full regression suite: **103 tests**.

## 0.8.0 - Player View

- Added a dedicated read-only Campaign Forge player application, available to non-GM users from the Journal sidebar and to GMs as a preview.
- Added a GM-facing Player View tab explaining publication controls and opening the exact player-facing view for review.
- Existing entry visibility now explicitly means player visibility in the entry editor; hidden entries are excluded from the player projection.
- Chapters/groups, campaign values, and key players now have independent player-publication flags. Existing groups, trackers, and key players migrate conservatively as private until explicitly published.
- Campaign values support a separate player description; key players support a separate player note so GM descriptions/notes never need to be reused for players.
- Overview pins require an additional player-publication toggle. Pinning something for GM use therefore never publishes it automatically.
- Player overview group progress is calculated only from player-visible entries, so hidden clues cannot be inferred from a larger denominator.
- Player Campaign view re-homes visible content past private ancestor groups instead of leaking hidden group titles.
- Player Journal/Actor quick-open actions are only rendered when the current user has observer permission for the referenced Foundry document.
- Player UI omits sessions, GM notes, transition rules, reward rules, provider payloads, weather internals, and other GM-only management data.
- Added DE/EN localization and regression coverage for projection privacy, publication flags, and hidden-progress behavior.

## 0.7.3 - Integration Review & Workspace Polish

- Completed a cross-module integration review against the currently supplied City Forge, NPC Forge, Creature Forge, Loot Forge, Item Forge, and Weather Forge contracts.
- Increased the default Campaign Forge workspace from 1040×720 to 1220×800 and widened editor/detail columns for denser campaign data without changing the responsive single-column fallback.
- City Forge transition consequences targeting the same settlement are now merged into one public State Patch instead of issuing several independent writes.
- City Forge batches are dry-run preflighted before persistence and use the dry-run revision as `expectedRevision`, reducing partial or stale state updates when several campaign consequences fire together.
- Provider diagnostics now surface the advertised public API version and embedded-editor contract version where a Forge exposes them, making integration mismatches easier to diagnose from Campaign Forge Settings.
- Confirmed optional-provider boundaries: no Forge module is a hard dependency, Weather Forge compatibility fallback remains read-only, and provider-owned generation/persistence logic is not duplicated in Campaign Forge.
- Added regression coverage for workspace sizing, City Forge batch/preflight behavior, provider contract diagnostics, DE/EN localization parity, and optional-provider ownership boundaries.
- Full regression suite: 92 tests.

## 0.7.2 - Creature Link Display Fix

- Creature Actor references are now rendered directly inside the Creature Forge section of a campaign entry.
- Actors linked by drag & drop and Actors created through the embedded Creature Forge become visible immediately after linking.
- Linked creature rows show the Actor portrait, current name, open action, and remove action.
- Missing Actors remain visible as broken references instead of disappearing.
- Creature links are separated from the generic external-link list to avoid confusing placement and duplicate rendering.

## 0.7.2 hotfix – Live active-session changes

### Event weather context visibility fix
- The Event weather-context panel is now present in the entry editor from the start and appears immediately when the type is changed to Event.
- New Event entries explain that they must be saved before a weather snapshot can be captured.
- Existing entries changed to Event stay open after saving so the weather snapshot action is immediately available.


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
