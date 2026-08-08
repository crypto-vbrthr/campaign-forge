# Campaign Forge v0.3.0

Campaign Forge is a GM-facing Foundry VTT module for tracking campaign structure, knowledge, quests, events, sessions, long-term campaign values, important NPCs, and rule-driven campaign state changes.

## v0.3.0 status-transition milestone

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
- German and English localization for all application text.

## Storage

Campaign data is stored in a hidden world setting. UI collapse state and display preferences are client-scoped. Overview pins, Actor links, and transition targets store references rather than copies of Campaign Forge content.

## Next planned blocks

Deeper Journal integration, Journal references/embedded controls, and later reward/provider integrations.
