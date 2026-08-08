# Campaign Forge v0.2.0

Campaign Forge is a GM-facing Foundry VTT module for tracking campaign structure, knowledge, quests, events, sessions, and long-term campaign values.

## v0.2.0 overview milestone

- Journal sidebar button opens the Campaign Forge immediately after world load.
- Campaign tree with chapters, nested groups, and typed entries.
- Manual ordering and drag & drop within the campaign tree.
- Explicit session start/end with automatic change logging.
- Manual session changes can be added, edited, and removed during the active session.
- Numeric campaign values for reputation, progress, collections, and similar long-running values.
- Entries, groups/chapters, and campaign values can be pinned to the Overview.
- Pinned overview items can be reordered with up/down controls.
- Pinned groups calculate progress across all descendant entries using entry-type-aware reached states.
- Bounded campaign values show a compact progress indicator in the Overview.
- Overview items jump directly to their source entry, group, or campaign value.
- German and English localization for all application text.

## Storage

Campaign data is stored in a hidden world setting. UI collapse state and display preferences are client-scoped. Overview pins store references to Campaign Forge objects rather than copies of their content.

## Next planned blocks

Key players / important NPC references, status transition rules, deeper Journal integration, and later reward/provider integrations.
