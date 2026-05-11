## New
- **Loading screen** - Animated splash on app start. Progress bar tracks Rust game-data warm-up and sprite preloading.
- **Item editor** - Edit equipped items with custom affixes/satanic affixes/angelic augs and stars.
- **Suggested Tree** - New button at *tree tab* named "suggest". BFS Algorytm calculate the best outcome for combine DPS (for now)
- Net change now works with incarnation tree.

## Improve
- **Calc engine moved to Rust** - All stats / damage / tree-mod / subskill math now runs in the Tauri Rust backend instead of TypeScript.
- Redesign sub-skills windows /w sprites
- Added some tree notable nodes to calculation (not all)
- Update all affixes on charms to match with season 9

## Fixes
- Cleanup GHA assets to be more clear
- Fix item rarity sorting. For now, gear window sorts items to Unholy -> Angelic -> Heroic -> Satanic Set -> Satanic -> Base (common)
