# Campaign Forge v0.1.1

Campaign Forge is a system-agnostic Foundry VTT module for tracking campaign state: chapters, groups, quests, knowledge, events, mysteries, locations, items, notes, sessions, and numeric trackers.

## v0.1.1 foundation

- GM-only Campaign Forge button in the Journal sidebar.
- ApplicationV2 interface with Overview, Campaign, Sessions, Trackers, and Settings tabs.
- Chapters and nested groups.
- Entry types with type-specific status sets.
- Collapsible campaign tree.
- Manual ordering with drag-and-drop and up/down controls.
- Explicit session start/end.
- Session logging for managed Campaign Forge changes.
- Numeric trackers with manual +/- adjustment.
- Full German and English localization of application text.
- Small public API exposed at `game.modules.get("campaign-forge").api`.
- Foundry VTT v13 minimum, v14 verified target.

## Data storage

v0.1.1 stores Campaign Forge world data in a hidden world setting. UI collapse state and display preferences are client-scoped.

## Intentionally deferred

The data model is prepared for later phases, but v0.1.0 does not yet implement:

- Journal-embedded live Campaign Forge entries.
- Journal links on entries.
- Overview pinning and custom dashboard sections.
- Key players / Actor references.
- Transition rules and chained status changes.
- Rewards and external Forge integrations.
- Calendar-provider formatting for in-game timestamps.
- Player-facing views.

## Development

Run the engine tests with:

```bash
npm test
```

- Active sessions can also receive manual log entries for discoveries, events, decisions, and notes.
