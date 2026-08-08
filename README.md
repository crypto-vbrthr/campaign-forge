# Campaign Forge v0.2.1

Campaign Forge is a GM-facing Foundry VTT module for tracking campaign structure, knowledge, quests, events, sessions, long-term campaign values, and important NPCs.

## v0.2.1 key-player milestone

- Journal sidebar button opens the Campaign Forge immediately after world load.
- Campaign tree with chapters, nested groups, typed entries, manual ordering, and drag & drop.
- Explicit session start/end with automatic and manual change logging.
- Numeric campaign values for reputation, progress, collections, and similar long-running values.
- Entries, groups/chapters, campaign values, and key players can be pinned to the Overview.
- Pinned groups calculate progress across all descendant entries using entry-type-aware reached states.
- New **Key Players** tab for important campaign NPCs.
- Add a key player by dragging an existing Foundry Actor into the Key Players view.
- Actor name and portrait are read live when available, with stored snapshot information used if the Actor later becomes unavailable.
- Key players can store a campaign role, current story state, GM note, linked reputation/relationship tracker, and linked Campaign Forge entries.
- Key players can be manually reordered, opened directly in Foundry, and marked as appearing in the currently active session.
- The last recorded appearance is shown by session number and is logged in the session history.
- German and English localization for all application text.

## Storage

Campaign data is stored in a hidden world setting. UI collapse state and display preferences are client-scoped. Overview pins and key-player links store references rather than copies of Campaign Forge content. Key-player Actor references keep a small name/image snapshot only as a fallback for missing Actors.

## Next planned blocks

Status transition rules, deeper Journal integration, and later reward/provider integrations.
