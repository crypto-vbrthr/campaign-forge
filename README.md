# Campaign Forge v0.6.1

Campaign Forge is a GM-facing Foundry VTT module for tracking campaign structure, knowledge, quests, events, sessions, long-term campaign values, important NPCs, and rule-driven campaign state changes.

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

Further transition triggers and action types, provider integrations such as Loot Forge or Item Forge, further Journal polish, and player-facing permissions.


## Journal integration

Campaign entries can reference one or more Foundry Journals or individual Journal pages. A primary Journal can be opened directly from the Campaign tree. Existing entries can also be dragged into ProseMirror Journal text; after the Journal is saved, Campaign Forge enriches the lightweight reference into a live block. GM users can change the entry status from that block, and all transition rules continue to apply through the central Campaign Engine.

Journal embeds are references rather than copies. Renamed entries, status changes, descriptions, and visibility therefore remain synchronized with Campaign Forge data.


## 0.6.2 CSS isolation hotfix

All Campaign Forge UI rules are now scoped beneath the application's `.campaign-forge` root class. This prevents generic internal `.cf-*` class names from colliding with City Forge or other Forge-suite modules.
