# Changelog

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
