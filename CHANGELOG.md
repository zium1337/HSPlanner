## New
- **Self-condition tree mods** - Parses `+X% ... when Critical Strike Chance is below 40%` and `+X% ... while below 40% Maximum Life` notables (Ying & Yang, Fragile Berserker, the +X% IAS-when-low-life minors, etc.).
- **Multicast** - `+X% Chance to cast an additional time when casting` (Double Cast minors and the Witch's Cackle augment) now multiplies spell average-per-cast damage by `(1 + multicast/100)`.
- **Elemental Break** - `+X% to Elemental Break` (and the `Inflicted on hit` / `on spell hit` variants) now multiplies elemental skill damage. Generic source applies to both melee and spell elemental skills.
- **Per-attribute % bonuses** - `+X% Increased Strength/Dexterity/Intelligence/Energy/Vitality/Armor` stack with `increased_all_attributes` and lift the matching attribute.
- **Cross-stat conversions** - Generic conversion engine for tree nodes reads the FINAL source value and contributes the converted amount to the target.
- **Skill Projectile Counts** - New panel in Configuration to manually set how many projectiles a skill fires. Multiplies the skill's per-cast damage and DPS. Per-skill, persisted in the build snapshot.

## Improve
- **Buff / aura passive scaling** - Active buffs and auras now apply their `passiveStats` at the EFFECTIVE skill rank (base + `+to-all-skills` + `+to-<element>-skills` + item `+to-this-skill`) instead of the bare allocated rank.
- **Attack Speed → Faster Cast Rate conversion** - Fallen God's Bloodlust (Gabriel's Broken Wings) now reads the EFFECTIVE Attack Speed instead of just the additive sum, matching in-game behaviour.
- **Custom Stats ordering** - Custom Config overrides are now applied BEFORE the buff/aura passive pass, so a manual `+10 to all skills` override actually lifts the effective rank used for buff scaling.

## Fixed
- **Jewelry tree sockets** - Right-click on an allocated jewelry node opens the gem/rune picker. Left-click is now always allocate/deallocate so the keystone can be undone without going through the socket modal.
- Pathing in incarnation tree respect starting nodes.
- Fix `Overloaded Dice` rarity from satanic -> unholy
- Fix `Left Panel` attack speed and cast speed calculation
- Fix some notables in tree
