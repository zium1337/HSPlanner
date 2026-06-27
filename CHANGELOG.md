## New
- **All character classes & skills** - Added the remaining class skill sets and sprites: Demon Spawn, Exo, Jotunn, Marksman, Necromancer, Nomad, Paladin, Redneck, Pyromancer, Samurai, Pirate, Viking, Shaman, White Mage, Marauder, Plague Doctor, Shield Lancer, Illusionist, Butcher and Bard. Implemented head icons for every class.
- **Season system** - Support for game seasons: Incarnation tree, skill nerfs/buffs, item nerfs/buffs. You now switch between season 9 changes and season 10 with auto-conversion.
- **Skills view redesign** - Reworked the skill-tree detail panel and tree readability, with archetype skill-damage calc and full tree-node line classification.
- **Character summary** - Replaced the character tab with a summary (character content moved to the config tab). Calculations now support multiple skills.

## Improve
- **Calc engine moved to Rust** - Ported calculations to the Tauri Rust backend: item bonuses, subskills, skill tree, and affix display / custom stats / suggest input.
- **Gear** - Gear tab polish and gear slot modal rework: edit logic moved into a draft hook (`useGearDraft`) and item-edit helpers (`itemEdits`), an item list rail (`ItemListRail`), reworked build store (`build.ts`) and item rules. Added helmet sprites and removed duplicate items.
- **UI design consistency** - Unified the interface look: new shared `Dropdown` component, extracted damage colors (`damageColors`) and simplified/normalized many components (SearchableSelect, ShareButton, JewelSocketModal, stats panels, and the Stats/Notes/Skills views).

## Fixes
- Add missing class head icons.
- Correct `Vengeance` skill scaling.
- Correct `Lightning Surge` skill damage scaling
- Rename `shield_lancer` skill id `spiked_shields` → `knights_vigor`.
