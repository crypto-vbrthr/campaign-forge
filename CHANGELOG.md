# Changelog

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
