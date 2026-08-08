# Changelog

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
