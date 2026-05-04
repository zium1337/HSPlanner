## New
- **Chaos Gemstone** - new Heroic Charm
- **Random Unholy Affix pool** - 74 new affixes (ranges sourced from satanic crystal mods): attributes resistances/absorptions, enemy resistance penetration, recovery (life/mana per kill, replenish, leech, recoup), elemental damage 5×3, based-on-level (mana/life/AR), extra damage vs stunned/bleeding, physical mods (open wounds, crushing/deadly blow), speed (IAS/FCR/movement), crit (chance/damage/skill haste), misc(XP, return, AoE, mana cost), defensive (magic/physical reduction, damage taken, defense vs missiles).
- **Angelic Augments**
- **All Damage Taken Reduced** stat.
- **Item-granted skills** (e.g. *Wings of Hatred*, *Fallen God's Bloodlust*) - gear-rolled ranks are summed, scaled by stars, and contribute passive stats. New `Granted Skill Effects` section in the item tooltip.
- **Slider** and **Dropdown** component.
- **Tooltip Section Header** overhual.
- **Mask of the Celestial** sprite asset.

### Improved
- **Spell crit handling** - now uses `Critical Strike Chance for Spells`/`Critical Strike Damage for Spells` for skills tagged `Spell`, separate from melee crit. Spell crit no longer benefits from `Critical Strike Damage` (matches the in-game cap).
- **Enemy resistance handling** - final skill damage is reduced by `Monster x Resistance` and the cap is reduced by `Ignore Monster x Resistance` (clamped 0–100).
- **Stat sources** - Break stat source by `Additive` stats and `Multiplicative` which `Additive` adds stat by stat, `Multiplicative` multiple final stat by x%.
- **Item selection** use new filter. Firstly search by rarity → A-Z.
- **Socket selection** and **Affix selection** now use new `Dropdown`.
- **ItemTooltip sections** - every section now has a colored: `Implicit` → gold, `Granted Skill Effects` → orange, `Unholy Affixes` → pink, `Forged · Satanic Crystal` → red, `From Sockets` → gold.
- **StatsView** lists the new `All Damage Taken Reduced` stat in the Defensive section.

### Fixes
- Closing the app via the window `X` button now exits cleanly (Tauri window close handler).
- Base charm definitions corrected.
- Tree node description gaps filled
