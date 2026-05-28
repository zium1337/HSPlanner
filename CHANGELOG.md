## New
- **Build Select screen** - Brand-new build selection/management screen with folders, searchable build table, live preview panel and context menu. Replaces the old startup build modal and profile switcher.
- **Demon Slayer** - Added the Demon Slayer class with its full skill set and sprites.
- **Hero Level** - New derived stat that scales with the number of allocated tree nodes. Shown in the stats panel (`Hero Lv`) and inline in the build table.
- **Physical damage calculation** - Added physical damage handling (bleeding, critical strike, etc.), covered with tests.
- **Stats breakdown tooltips** - Hover preview that shows the source breakdown
  of each stat value.
- **Tooltips and node preview** - After hover over item or tree node in stat breakdown, you can see item tooltip/node preview for better reading your build
- **Storage error banner** - Surfaces save/storage failures to the user.

## Improve
- **Calc engine consolidated in Rust** - Removed the TypeScript mirror; weapon, stats and tree-parsing math reworked in the Tauri Rust backend.
- **GearView rewrite** - Split the monolithic GearView into modular sections (charms, sockets, affixes, augments, forged mods, stars, compare) with cleaner architecture and helpers.
- **Item database overhaul** - Added missing items and removed duplicates across rings, amulets, belts, armors, gloves, boots, helmets, shields and weapons. Refreshed all weapon stats.
- **Character head icons** in the build list menu (incl. Amazon & Stormweaver).
- **UI polish** - Added animations (motion) and flash-on-change feedback.
- Dependency bumps.

## Fixes
- Fix "defence" implicit stat handling.
- Fix negative numbers in stats calculation 
- improved stat-parsing regex.
- Fix stats / tooltip breakdown calculations.
- Fix build saving.
- Fix UX and tree validation.
- Fix skill hover behavior.
- Fix Torch of Shadow charm width.
- Font and lint fixes.