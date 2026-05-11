// Mirror of src/utils/treeStats.ts — parser infrastructure (types, helpers,
// rule dispatchers with cache). Phase 2 step 2a establishes the skeleton with
// empty RULES / CONVERSION_RULES / DISABLE_RULES vectors; 2b/2c populate them.
//
// TREE_NODE_INFO JSON loading and aggregateTreeStats stay deferred until
// Phase 2 step 4 (Pattern B data layer).

use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use regex::{Captures, Regex};

// ---------- types ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SelfConditionKey {
    CritChanceBelow40,
    LifeBelow40,
}

impl SelfConditionKey {
    pub fn as_str(self) -> &'static str {
        match self {
            SelfConditionKey::CritChanceBelow40 => "crit_chance_below_40",
            SelfConditionKey::LifeBelow40 => "life_below_40",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            SelfConditionKey::CritChanceBelow40 => "Critical Strike Chance is below 40% (auto)",
            SelfConditionKey::LifeBelow40 => "Current Life is below 40% of Maximum",
        }
    }
}

pub const SELF_CONDITION_KEYS: &[SelfConditionKey] = &[
    SelfConditionKey::CritChanceBelow40,
    SelfConditionKey::LifeBelow40,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DisableTarget {
    LifeReplenish,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedMod {
    pub key: String,
    pub value: f64,
    pub self_condition: Option<SelfConditionKey>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ConvertKind {
    Stat,
    Attribute,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedConversion {
    pub from_key: String,
    pub from_kind: ConvertKind,
    pub to_key: String,
    pub to_kind: ConvertKind,
    pub pct: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedDisable {
    pub target: DisableTarget,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ParsedMeta {
    Convert(ParsedConversion),
    Disable(ParsedDisable),
}

pub const ELEMENTS: &[&str] = &["arcane", "cold", "fire", "lightning", "poison"];

// ---------- rule shapes ----------

type ModBuild = fn(&Captures<'_>) -> Option<ParsedMod>;
type ConversionBuild = fn(&Captures<'_>) -> Option<ParsedConversion>;

pub(crate) struct ParseRule {
    pub test: Regex,
    pub build: ModBuild,
}

pub(crate) struct ConversionRule {
    pub test: Regex,
    pub build: ConversionBuild,
}

pub(crate) struct DisableRule {
    pub test: Regex,
    pub target: DisableTarget,
}

// CONVERSION_TARGET_STATS maps the lowercased TS strings to canonical stat
// keys. Populated here (not behind a rule) so 2c rules can read it directly.
pub(crate) static CONVERSION_TARGET_STATS: Lazy<HashMap<&'static str, &'static str>> =
    Lazy::new(|| {
        [
            ("magic skill damage", "magic_skill_damage"),
            ("damage return", "damage_return"),
            ("increased maximum life", "increased_life"),
            ("maximum life", "life"),
            ("maximum mana", "mana"),
            ("physical damage", "additive_physical_damage"),
            ("attack damage", "attack_damage"),
            ("ranged physical damage", "ranged_physical_per_500_mana"),
            ("increased life", "increased_life"),
            ("increased damage", "enhanced_damage"),
        ]
        .into_iter()
        .collect()
    });

// ---------- regex helpers (lazily compiled once) ----------

static SELF_CONDITION_SUFFIXES: Lazy<Vec<(Regex, SelfConditionKey)>> = Lazy::new(|| {
    vec![
        (
            Regex::new(r"(?i)\s+when\s+critical\s+strike\s+chance\s+is\s+below\s+40%$").unwrap(),
            SelfConditionKey::CritChanceBelow40,
        ),
        (
            Regex::new(
                r"(?i)\s+(?:when|while)\s+(?:current\s+life\s+is\s+)?below\s+40%(?:\s+of)?\s+maximum\s+life$",
            )
            .unwrap(),
            SelfConditionKey::LifeBelow40,
        ),
    ]
});

static WEAPON_CONTEXT_SUFFIX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\s+(?:when|while)\s+(?:using|wielding|dual\s+wielding)\s+(?:a\s+|an\s+)?(?:two\s+handed\s+)?(?:melee\s+)?(?:axe[s]?|sword[s]?|bow[s]?|gun[s]?|wand[s]?|staff(?:\s+or\s+a\s+cane)?|cane|shield[s]?|throwing\s+weapon[s]?|two\s+handed\s+weapon|two\s+handed\s+melee\s+weapon)$",
    )
    .unwrap()
});

pub(crate) fn strip_weapon_context(line: &str) -> String {
    let stripped = WEAPON_CONTEXT_SUFFIX.replace(line, "");
    stripped.trim_end().to_string()
}

pub(crate) fn strip_self_condition(line: &str) -> (String, Option<SelfConditionKey>) {
    for (re, cond) in SELF_CONDITION_SUFFIXES.iter() {
        if re.is_match(line) {
            let stripped = re.replace(line, "");
            return (stripped.trim_end().to_string(), Some(*cond));
        }
    }
    (line.to_string(), None)
}

pub(crate) fn num(s: &str) -> f64 {
    // TS: s.replace(/^\+/, '') then Number(). Strip leading '+', try parse.
    // f64::parse returns Err on failure → translate to NaN to match JS Number().
    let cleaned = s.strip_prefix('+').unwrap_or(s);
    cleaned.parse::<f64>().unwrap_or(f64::NAN)
}

// ---------- rule-building macros ----------
//
// `mod_rule!(pattern, key)` — simple `key: literal, value: num(m[1])` rules.
// `mod_rule!(pattern, base, more)` — same but pick `more` when capture group 2
//   is present (the standard TS `(Total\s+)?` variant pattern).
// `fixed_rule!(pattern, key, value)` — rule with constant value, ignores caps.
// `null_rule!(pattern)` — rule that matches and explicitly returns None.
// `cond_rule!(pattern, key, cond)` — rule with built-in self_condition.

macro_rules! mod_rule {
    ($pattern:expr, $key:literal $(,)?) => {
        ParseRule {
            test: Regex::new($pattern).unwrap(),
            build: |m| Some(ParsedMod {
                key: $key.to_string(),
                value: num(&m[1]),
                self_condition: None,
            }),
        }
    };
    ($pattern:expr, $base:literal, $more:literal $(,)?) => {
        ParseRule {
            test: Regex::new($pattern).unwrap(),
            build: |m| Some(ParsedMod {
                key: if m.get(2).is_some() {
                    $more.to_string()
                } else {
                    $base.to_string()
                },
                value: num(&m[1]),
                self_condition: None,
            }),
        }
    };
}

macro_rules! fixed_rule {
    ($pattern:expr, $key:literal, $value:expr $(,)?) => {
        ParseRule {
            test: Regex::new($pattern).unwrap(),
            build: |_| Some(ParsedMod {
                key: $key.to_string(),
                value: $value,
                self_condition: None,
            }),
        }
    };
}

macro_rules! null_rule {
    ($pattern:expr $(,)?) => {
        ParseRule {
            test: Regex::new($pattern).unwrap(),
            build: |_| None,
        }
    };
}

macro_rules! cond_rule {
    ($pattern:expr, $key:literal, $cond:expr $(,)?) => {
        ParseRule {
            test: Regex::new($pattern).unwrap(),
            build: |m| Some(ParsedMod {
                key: $key.to_string(),
                value: num(&m[1]),
                self_condition: Some($cond),
            }),
        }
    };
}

// ---------- rule vectors (populated in 2b/2c) ----------

pub(crate) static RULES: Lazy<Vec<ParseRule>> = Lazy::new(|| {
    vec![
        // 1. +N to Maximum Life
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Life$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "life".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 2. +N to Maximum Mana
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Mana$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "mana".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 3. N% Increased Maximum Life
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)%\s+Increased\s+Maximum\s+Life$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "increased_life".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 4. N% Increased (Total )?Maximum Mana
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Maximum\s+Mana$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: if m.get(2).is_some() {
                        "increased_mana_more".to_string()
                    } else {
                        "increased_mana".to_string()
                    },
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 5. N% Increased Mana
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)%\s+Increased\s+Mana$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "increased_mana".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 6. +N to Strength
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+Strength$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "to_strength".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 7. +N Strength (no "to")
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+Strength$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "to_strength".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 8. +N to Dexterity
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+Dexterity$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "to_dexterity".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 9. +N Dexterity (no "to")
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+Dexterity$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "to_dexterity".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 10. +N to Intelligence
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+Intelligence$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "to_intelligence".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 11. +N to Energy
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+Energy$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "to_energy".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 12. +N to Vitality
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+Vitality$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "to_vitality".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 13. +N to Armor
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+Armor$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "to_armor".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 14. +N to All Attributes
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+All\s+Attributes$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "all_attributes".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 15. N% Increased All Attributes
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)%\s+Increased\s+All\s+Attributes$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "increased_all_attributes".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 16. N% Increased (Total )?(Strength|Dexterity|Intelligence|Energy|Vitality|Armor)
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?(Strength|Dexterity|Intelligence|Energy|Vitality|Armor)$",
            )
            .unwrap(),
            build: |m| {
                let attr = m[3].to_lowercase();
                let key = if m.get(2).is_some() {
                    format!("increased_{}_more", attr)
                } else {
                    format!("increased_{}", attr)
                };
                Some(ParsedMod {
                    key,
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 17. +N to Defense
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)\s+to\s+Defense$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "defense".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 18. N% Increased (Total )?Movement Speed
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Movement\s+Speed$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: if m.get(2).is_some() {
                        "movement_speed_more".to_string()
                    } else {
                        "movement_speed".to_string()
                    },
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 19. N% Increased (Total )?Attack Speed
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Attack\s+Speed$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: if m.get(2).is_some() {
                        "increased_attack_speed_more".to_string()
                    } else {
                        "increased_attack_speed".to_string()
                    },
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 20. N% Increased (Total )?Faster Cast Rate
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Faster\s+Cast\s+Rate$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: if m.get(2).is_some() {
                        "faster_cast_rate_more".to_string()
                    } else {
                        "faster_cast_rate".to_string()
                    },
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 21. N% (to )?Spell Haste
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)%\s+(?:to\s+)?Spell\s+Haste$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "skill_haste".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 22. N% Increased (Total )?Critical Strike Damage
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Critical\s+Strike\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: if m.get(2).is_some() {
                        "crit_damage_more".to_string()
                    } else {
                        "crit_damage".to_string()
                    },
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 23. N% Critical Damage (alt syntax)
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)%\s+Critical\s+Damage$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "crit_damage".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 24. N% to Critical Strike Chance
        ParseRule {
            test: Regex::new(r"(?i)^([+\-\d.]+)%\s+to\s+Critical\s+Strike\s+Chance$").unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "crit_chance".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 25. N% Chance to Critically Hit with Spells
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+Critically\s+Hit\s+with\s+Spells$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "spell_crit_chance".to_string(),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 26. Increased Spell Critical Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Spell\s+Critical\s+Damage$",
            "spell_crit_damage"
        ),
        // 27. (to )? All Resistances %
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+(?:to\s+)?All\s+Resistances$",
            "all_resistances"
        ),
        // 28. flat to (Total )? All Resistances
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+(Total\s+)?All\s+Resistances$",
            "all_resistances",
            "all_resistances_more"
        ),
        // 29. % to (Total )? All Resistances
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+(Total\s+)?All\s+Resistances$",
            "all_resistances",
            "all_resistances_more"
        ),
        // 30. Maximum All Resistances
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+Maximum\s+All\s+Resistances$",
            "max_all_resistances"
        ),
        // 31. <element> Resistance
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+to\s+(arcane|cold|fire|lightning|poison)\s+Resistance$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: format!("{}_resistance", m[2].to_ascii_lowercase()),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 32. Maximum <element> Resistance
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+to\s+Maximum\s+(arcane|cold|fire|lightning|poison)\s+Resistance$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: format!("max_{}_resistance", m[2].to_ascii_lowercase()),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 33. <element> Absorb
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+to\s+(arcane|cold|fire|lightning|poison)\s+Absorb$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: format!("{}_absorption", m[2].to_ascii_lowercase()),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 34. Increased (Total )? <element> Skill Damage
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?(arcane|cold|fire|lightning|poison)\s+Skill\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                let element = m[3].to_ascii_lowercase();
                Some(ParsedMod {
                    key: if m.get(2).is_some() {
                        format!("{}_skill_damage_more", element)
                    } else {
                        format!("{}_skill_damage", element)
                    },
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 35. flat <element> Skill Damage
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)\s+to\s+(arcane|cold|fire|lightning|poison)\s+Skill\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: format!("flat_{}_skill_damage", m[2].to_ascii_lowercase()),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 36. Increased (Total )? Magic Skill Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Magic\s+Skill\s+Damage$",
            "magic_skill_damage",
            "magic_skill_damage_more"
        ),
        // 37. flat Magic Skill Damage → flat_skill_damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Magic\s+Skill\s+Damage$",
            "flat_skill_damage"
        ),
        // 38. Increased Spell Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Spell\s+Damage$",
            "spell_damage"
        ),
        // 39. Increased (Total )? Area of Effect (optional radius variants)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Area\s+of\s+Effect(?:\s+(?:skill\s+)?radius(?:\s+of\s+all\s+skills)?)?$",
            "area_of_effect",
            "area_of_effect_more"
        ),
        // 40. Increased Spell Duration
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Spell\s+Duration$",
            "spell_duration_pct"
        ),
        // 41. Increased Hit Recovery
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Hit\s+Recovery$",
            "faster_hit_recovery"
        ),
        // 42. Increased Bleed(ing) Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Bleed(?:ing)?\s+Damage$",
            "increased_bleeding_damage"
        ),
        // 43. Increased Bleed(ing) Frequency
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Bleed(?:ing)?\s+Frequency$",
            "increased_bleeding_frequency"
        ),
        // 44. Increased Poison(ed) Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Poison(?:ed)?\s+Damage$",
            "increased_poisoned_damage"
        ),
        // 45. Increased Burning Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Burning\s+Damage$",
            "increased_burning_damage"
        ),
        // 46. Increased Stasis Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Stasis\s+Damage$",
            "increased_stasis_damage"
        ),
        // 47. Increased Ailment( Tick)? Frequency
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Ailment(?:\s+Tick)?\s+Frequency$",
            "increased_ailment_frequency"
        ),
        // 48. Chance to inflict Bleeding on hit
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+inflict\s+Bleeding\s+on\s+hit$",
            "chance_inflict_bleeding"
        ),
        // 49. Chance to inflict Poison(ed) on hit
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+inflict\s+Poison(?:ed)?\s+on\s+hit$",
            "chance_inflict_poisoned"
        ),
        // 50. Chance to inflict Burning on hit
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+inflict\s+Burning\s+on\s+hit$",
            "chance_inflict_burning"
        ),
        // 51. Chance to inflict Stasis on hit
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+inflict\s+Stasis\s+on\s+hit$",
            "chance_inflict_stasis"
        ),
        // 52. Max Bleed(ing) Stacks
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Bleed(?:ing)?\s+Stacks$",
            "max_bleed_stacks"
        ),
        // 53. Max Poison(ed) Stacks
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Poison(?:ed)?\s+Stacks$",
            "max_poisoned_stacks"
        ),
        // 54. Max Burning Stacks
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Burning\s+Stacks$",
            "max_burning_stacks"
        ),
        // 55. Max Stasis Stacks
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Stasis\s+Stacks$",
            "max_stasis_stacks"
        ),
        // 56. Max Rage Stacks
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Rage\s+Stacks$",
            "max_rage_stacks"
        ),
        // 57. Max Colossus Stacks
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Colossus\s+Stacks$",
            "max_colossus_stacks"
        ),
        // 58. Increased (Total )? Life Steal
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Life\s+Steal$",
            "life_steal",
            "life_steal_more"
        ),
        // 59. Increased Mana Steal
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Mana\s+Steal$",
            "mana_steal"
        ),
        // 60. Increased Rate of Life Steal
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Rate\s+of\s+Life\s+Steal$",
            "life_steal_rate"
        ),
        // 61. Increases Rate of Mana Steal (TS uses "Increases")
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increases\s+Rate\s+of\s+Mana\s+Steal$",
            "mana_steal_rate"
        ),
        // 62. Damage Mitigation
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Damage\s+Mitigation$",
            "damage_mitigation"
        ),
        // 63. of Damage Taken Mitigated (alt phrasing)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Damage\s+Taken\s+Mitigated$",
            "damage_mitigation"
        ),
        // 64. of Incoming Damage is mitigated
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Incoming\s+Damage\s+is\s+mitigated$",
            "damage_mitigation"
        ),
        // 65. Physical Damage Reduction
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+Physical\s+Damage\s+Reduction$",
            "physical_damage_reduction"
        ),
        // 66. of Damage Taken returned to the Attacker
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Damage\s+Taken\s+returned\s+to\s+the\s+Attacker$",
            "damage_return"
        ),
        // 67. All Damage Taken Reduced by N%
        mod_rule!(
            r"(?i)^All\s+Damage\s+Taken\s+Reduced\s+by\s+([+\-\d.]+)%$",
            "all_damage_taken_reduced_pct"
        ),
        // 68. to Damage Returned (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Damage\s+Returned$",
            "damage_return"
        ),
        // 69. Life Replenished per second (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Life\s+Replenished\s+per\s+second$",
            "life_replenish"
        ),
        // 70. % Max Life Replenished Per second (capitalised Per)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Maximum\s+Life\s+Replenished\s+(?:Per|per)\s+[Ss]econd$",
            "life_replenish_pct"
        ),
        // 71. of Maximum Life replenished per second
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Maximum\s+Life\s+replenished\s+per\s+second$",
            "life_replenish_pct"
        ),
        // 72. (Total )?(to )? Mana Replenish
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+(Total\s+)?(?:to\s+)?Mana\s+Replenish$",
            "mana_replenish",
            "mana_replenish_more"
        ),
        // 73. to All Skills
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+All\s+Skills$",
            "all_skills"
        ),
        // 74. to <element> Skills
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)\s+to\s+(arcane|cold|fire|lightning|poison)\s+Skills$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: format!("{}_skills", m[2].to_ascii_lowercase()),
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 75. to Physical Skills
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Physical\s+Skills$",
            "physical_skills"
        ),
        // 76. to Explosion Skills
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Explosion\s+Skills$",
            "explosion_skills"
        ),
        // 77. to Summon Skills
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Summon\s+Skills$",
            "summon_skills"
        ),
        // 78. to Light Radius
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Light\s+Radius$",
            "light_radius"
        ),
        // 79. to Magic Find
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+Magic\s+Find$",
            "magic_find"
        ),
        // 80. (Increased )?Experience Gain
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+(?:Increased\s+)?Experience\s+Gain$",
            "experience_gain"
        ),
        // 81. Decreased Crowd Control Diminish
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Decreased\s+Crowd\s+Control\s+Diminish$",
            "cc_diminish_decrease"
        ),
        // 82. to Attack Rating (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Attack\s+Rating$",
            "attack_rating"
        ),
        // 83. Increased Attack Rating
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Attack\s+Rating$",
            "attack_rating_pct"
        ),
        // 84. to Physical Damage (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Physical\s+Damage$",
            "additive_physical_damage"
        ),
        // 85. Chance for a deadly blow
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+a\s+deadly\s+blow$",
            "deadly_blow"
        ),
        // 86. Multicast chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+cast\s+an\s+additional\s+time\s+when\s+casting$",
            "multicast_chance"
        ),
        // 87. Damage while Unarmed
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Damage\s+while\s+Unarmed$",
            "damage_unarmed"
        ),
        // 88. Explosion Damage (optional "area of effect" phrasing)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Explosion\s+(?:area\s+of\s+effect\s+)?[Dd]amage$",
            "explosion_damage"
        ),
        // 89. Increased (Total )? Enhanced Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Enhanced\s+Damage$",
            "enhanced_damage",
            "enhanced_damage_more"
        ),
        // 90. to (Melee/Ranged) Enhanced Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+(?:Melee\s+|Ranged\s+)?Enhanced\s+Damage$",
            "enhanced_damage"
        ),
        // 91. to Faster Cast Rate (optional wand context)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+Faster\s+Cast\s+Rate(?:\s+while\s+wielding\s+a\s+wand)?$",
            "faster_cast_rate"
        ),
        // 92. Increased (Total )? Faster Cast Rate (optional wand context)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Faster\s+Cast\s+Rate(?:\s+while\s+wielding\s+a\s+wand)?$",
            "faster_cast_rate",
            "faster_cast_rate_more"
        ),
        // 93. to Spell Mana Leech → mana_steal
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+Spell\s+Mana\s+Leech$",
            "mana_steal"
        ),
        // 94. Elemental Break Inflicted on hit
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Elemental\s+Break\s+Inflicted\s+on\s+hit$",
            "elemental_break_on_strike"
        ),
        // 95. Elemental Break Inflicted on spell hit
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Elemental\s+Break\s+Inflicted\s+on\s+spell\s+hit$",
            "elemental_break_on_spell"
        ),
        // 96. (to )? Elemental Break
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+(?:to\s+)?Elemental\s+Break$",
            "elemental_break"
        ),
        // 97. Armor Break (optional "Inflicted on hit")
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Armor\s+Break(?:\s+Inflicted\s+on\s+hit)?$",
            "armor_break_on_strike"
        ),
        // 98. flat to (Maximum|Minimum) Damage (optional shield context)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+(?:Maximum|Minimum)\s+Damage(?:\s+when\s+wielding\s+a\s+shield)?$",
            "attack_damage"
        ),
        // 99. Increased (Total )? Physical Damage → enhanced_damage(_more)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Physical\s+Damage$",
            "enhanced_damage",
            "enhanced_damage_more"
        ),
        // 100. Increased (Total )? Defense
        // NOTE: TS bug? Both branches map to `enhanced_defense`. Preserving parity.
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Defense$",
            "enhanced_defense",
            "enhanced_defense"
        ),
        // 101. Increased (Total )? Ranged Projectile Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Ranged\s+Projectile\s+Damage$",
            "ranged_projectile_damage",
            "ranged_projectile_damage_more"
        ),
        // 102. Increased Projectile Damage → ranged_projectile_damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Projectile\s+Damage$",
            "ranged_projectile_damage"
        ),
        // 103. Increased (Total )? Area of Effect Spell Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Area\s+of\s+Effect\s+Spell\s+Damage$",
            "spell_aoe_damage",
            "spell_aoe_damage_more"
        ),
        // 104. (Increased )? Spell Area of Effect Radius
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+(?:Increased\s+)?Spell\s+Area\s+of\s+Effect\s+Radius$",
            "spell_aoe_radius"
        ),
        // 105. Increased (Total )? Area of Effect Spell Damage (alt) → spell_aoe_damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(?:Total\s+)?Area\s+of\s+Effect\s+Spell\s+Damage$",
            "spell_aoe_damage"
        ),
        // 106. Increased (Total )? Spell Projectile Damage
        // TS quirk: the "_more" key is `two_handed_spell_projectile_damage` (not `..._more`).
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Spell\s+Projectile\s+Damage$",
            "spell_projectile_damage",
            "two_handed_spell_projectile_damage"
        ),
        // 107. (Increased )? Spell Projectile Size
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+(?:Increased\s+)?Spell\s+Projectile\s+Size$",
            "spell_projectile_size"
        ),
        // 108. Additional Spell Projectile (flat count)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Additional\s+Spell\s+Projectile$",
            "additional_spell_projectile"
        ),
        // 109. Extra Spell Projectiles %
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Extra\s+Spell\s+Projectiles$",
            "extra_spell_projectiles_pct"
        ),
        // 110. Increased Damaging Aura Effectiveness
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Damaging\s+Aura\s+Effectiveness$",
            "damaging_aura_effectiveness"
        ),
        // 111. Increased Damaging Aura Radius (capture group 1 is OPTIONAL — default 1)
        ParseRule {
            test: Regex::new(
                r"(?i)^(?:([+\-\d.]+)%\s+)?Increased\s+Damaging\s+Aura\s+Radius$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedMod {
                    key: "damaging_aura_radius".to_string(),
                    value: match m.get(1) {
                        Some(g) => num(g.as_str()),
                        None => 1.0,
                    },
                    self_condition: None,
                })
            },
        },
        // 112. Increased (Damaging )? Aura Radius
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Damaging\s+)?Aura\s+Radius$",
            "damaging_aura_radius",
            "damaging_aura_radius"
        ),
        // 113. to Aura Skills
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Aura\s+Skills$",
            "aura_skills"
        ),
        // 114. to Shield Skills
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Shield\s+Skills$",
            "shield_skills"
        ),
        // 115. Increased (Total )? Shield Skill(s) Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(?:Total\s+)?(?:Damage\s+by\s+)?Shield\s+Skill(?:\s+|s\s+)Damage$",
            "shield_skill_damage"
        ),
        // 116. Increased Damage by Shield Skills
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Damage\s+by\s+Shield\s+Skills$",
            "shield_skill_damage"
        ),
        // 117. Increased radius of Shield Skills
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+radius\s+of\s+Shield\s+Skills$",
            "shield_skill_radius"
        ),
        // 118. Increased (Total )? Sentry Damage (optional "but you can no longer..." suffix)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Sentry\s+Damage(?:\s+but\s+you\s+can\s+no\s+longer\s+deal\s+damage\s+your\s+self)?$",
            "sentry_damage",
            "sentry_damage_more"
        ),
        // 119. Increased Sentry Attack Speed
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Sentry\s+Attack\s+Speed$",
            "sentry_attack_speed"
        ),
        // 120. Increased Sentry Duration
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Sentry\s+Duration$",
            "sentry_duration"
        ),
        // 121. Chance for Sentries to fire an additional projectile
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+Sentries\s+to\s+fire\s+an\s+additional\s+projectile$",
            "sentry_extra_projectile_chance"
        ),
        // 122. Increased Summon Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Summon\s+Damage$",
            "summon_damage"
        ),
        // 123. Increased Summon Attack Speed
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Summon\s+Attack\s+Speed$",
            "summon_attack_speed"
        ),
        // 124. Increased Summon Life
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Summon\s+Life$",
            "summon_life"
        ),
        // 125. to Summon Maximum Life (alt phrasing) → summon_life
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+Summon\s+Maximum\s+Life$",
            "summon_life"
        ),
        // 126. Increased Summon Melee Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Summon\s+Melee\s+Damage$",
            "summon_melee_damage"
        ),
        // 127. Increased (Total )? Summon Projectile Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Summon\s+Projectile\s+Damage$",
            "summon_projectile_damage",
            "summon_projectile_damage_more"
        ),
        // 128. Increased Summon Projectile Size
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Summon\s+Projectile\s+Size$",
            "summon_projectile_size"
        ),
        // 129. Increased Summon Attack Radius
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Summon\s+Attack\s+Radius$",
            "summon_attack_radius"
        ),
        // 130. Increased Summon Splash Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Summon\s+Splash\s+Damage(?:\s+around\s+the\s+target)?$",
            "summon_splash_damage"
        ),
        // 131. Max Summon Amount
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Summon\s+Amount$",
            "summon_max_amount"
        ),
        // 132. Chance for summon projectiles to chain on hit
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+summon\s+projectiles?\s+to\s+chain\s+on\s+hit$",
            "summon_chain_chance"
        ),
        // 133. Chance for summon projectile to fork on hit
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+summon\s+projectile\s+to\s+fork\s+on\s+hit$",
            "summon_fork_chance"
        ),
        // 134. Chance on summon hit to knock monsters up
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+on\s+summon\s+hit\s+to\s+knock\s+monsters\s+up\s+dealing\s+increased\s+damage$",
            "summon_knock_up_chance"
        ),
        // 135. Knock Up Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Knock\s+Up\s+Damage$",
            "summon_knock_up_damage"
        ),
        // 136. Void Blast Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Void\s+Blast\s+Damage$",
            "void_blast_damage"
        ),
        // 137. to Guardian Damage (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Guardian\s+Damage$",
            "guardian_damage"
        ),
        // 138. Increased Guardian Attack Speed
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Guardian\s+Attack\s+Speed$",
            "guardian_attack_speed"
        ),
        // 139. Guardian Duration
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Guardian\s+Duration$",
            "guardian_duration"
        ),
        // 140. Chance to spawn extra guardian
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+when\s+summoning\s+guardian\s+to\s+spawn\s+an\s+extra\s+guardian$",
            "extra_guardian_chance"
        ),
        // 141. Maximum Summoned Guardians
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Summoned\s+Guardians$",
            "max_summoned_guardians"
        ),
        // 142. Sand Beam Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Sand\s+Beam\s+Damage$",
            "sand_beam_damage"
        ),
        // 143. Increased Orbiting Skill Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Orbiting\s+Skill\s+Damage$",
            "orbital_skill_damage"
        ),
        // 144. (Increased )? Total Orbital Spell Damage → orbital_skill_damage_more
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+(?:Increased\s+)?Total\s+Orbital\s+Spell\s+Damage$",
            "orbital_skill_damage_more"
        ),
        // 145. Orbital Spell Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Orbital\s+Spell\s+Damage$",
            "orbital_skill_damage"
        ),
        // 146. Increased Orbiting Skill Speed
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Orbiting\s+Skill\s+Speed$",
            "orbital_skill_speed"
        ),
        // 147. Increased Orbiting Skill Duration
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Orbiting\s+Skill\s+Duration$",
            "orbital_skill_duration"
        ),
        // 148. Orbital Spell Duration
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Orbital\s+Spell\s+Duration$",
            "orbital_skill_duration"
        ),
        // 149. Increased Orbiting Skill Size
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Orbiting\s+Skill\s+Size$",
            "orbital_skill_size"
        ),
        // 150. Orbital Spell Size
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Orbital\s+Spell\s+Size$",
            "orbital_skill_size"
        ),
        // 151. Chance to suppress incoming elemental damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+suppress\s+incoming\s+elemental\s+damage$",
            "elemental_suppression_chance"
        ),
        // 152. Increased elemental suppression effectiveness
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+elemental\s+suppression\s+effectiveness$",
            "elemental_suppression_effectiveness"
        ),
        // 153. Chance to Evade incoming damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+Evade\s+incoming\s+damage$",
            "evade_chance"
        ),
        // 154. Chance to Evade projectiles
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+Evade\s+projectiles$",
            "evade_projectile_chance"
        ),
        // 155. Chance to evade elemental damage → evade_chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+evade\s+elemental\s+damage$",
            "evade_chance"
        ),
        // 156. Chance to Dodge Physical Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+Dodge\s+Physical\s+Damage$",
            "dodge_physical_damage_chance"
        ),
        // 157. Increased (Total )? Ailment Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Ailment\s+Damage$",
            "ailment_damage_all",
            "ailment_damage_all_more"
        ),
        // 158. of Skills Damage added to the Ailments damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Skills\s+Damage\s+added\s+to\s+the\s+Ailments\s+damage$",
            "skill_damage_to_ailments"
        ),
        // 159. Increased Poison(ed) Frequency
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Poison(?:ed)?\s+Frequency$",
            "increased_poisoned_frequency"
        ),
        // 160. Increased Knockback Force
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Knockback\s+Force$",
            "knockback_force"
        ),
        // 161. Increased Knockback Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Knockback\s+Damage$",
            "knockback_damage"
        ),
        // 162. Damage knocking monsters into terrain
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Damage\s+when\s+knocking\s+monsters\s+into\s+terrain$",
            "knockback_terrain_damage"
        ),
        // 163. Chance on attack to fire homing missile
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+when\s+attacking\s+to\s+fire\s+a\s+homing\s+missile$",
            "homing_missile_attack_chance"
        ),
        // 164. Increased Homing Missile Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Homing\s+Missile\s+Damage$",
            "homing_missile_damage"
        ),
        // 165. additional Homing Missile (flat count)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+additional\s+Homing\s+Missile$",
            "homing_missile_count"
        ),
        // 166. Increased Homing Missile Explosion aoe radius
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Homing\s+Missile\s+Explosion\s+area\s+of\s+effect\s+radius$",
            "homing_missile_explosion_radius"
        ),
        // 167. Chance for homing missiles to unleash shockwave
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+homing\s+missiles\s+to\s+unleash\s+a\s+shockwave\s+of\s+explosions$",
            "homing_missile_shockwave_chance"
        ),
        // 168. Socketable Slot — explicit reject (TS returns null)
        null_rule!(r"(?i)^([+\-\d.]+)\s+Socketable\s+Slot$"),
        // 169. Increased Explosion (area of effect) radius → explosion_aoe
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Explosion\s+(?:area\s+of\s+effect\s+)?radius$",
            "explosion_aoe"
        ),
        // 170. Increased Damage when Dual Wielding
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Damage\s+when\s+Dual\s+Wielding$",
            "damage_dual_wield"
        ),
        // 171. Increased Total Damage when Dual Wielding
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Total\s+Damage\s+when\s+Dual\s+Wielding$",
            "damage_dual_wield_more"
        ),
        // 172. Increased Melee Damage (optional shield context)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Melee\s+Damage(?:\s+when\s+using\s+a\s+Shield)?$",
            "damage_with_shield"
        ),
        // 173. Melee Damage to far monsters
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Melee\s+Damage\s+to\s+Monsters\s+far\s+away\s+from\s+you$",
            "damage_far"
        ),
        // 174. Melee Damage at long range (with closeness tradeoff)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Melee\s+Damage\s+dealt\s+to\s+monsters\s+at\s+long\s+range\s+but\s+deal\s+less\s+damage\s+to\s+monsters\s+close\s+to\s+you$",
            "damage_far"
        ),
        // 175. Ranged Projectile Damage to close monsters (tradeoff)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Ranged\s+Projectile\s+Damage\s+to\s+monsters\s+close\s+to\s+you\s+but\s+deal\s+less\s+damage\s+to\s+monsters\s+far\s+away$",
            "damage_close"
        ),
        // 176. Damage Reduction with Staff/Cane
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Damage\s+Reduction\s+when\s+wielding\s+a\s+Staff\s+or\s+a\s+Cane$",
            "two_handed_damage_reduction"
        ),
        // 177. Increased Damage with Axe
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Damage\s+when\s+wielding\s+an\s+Axe$",
            "damage_with_axe"
        ),
        // 178. Increased Total Attack Rating with Axe
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Total\s+Attack\s+Rating\s+when\s+wielding\s+an\s+Axe$",
            "attack_rating_with_axe_pct"
        ),
        // 179. flat Physical Damage when dual wielding Axes
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Physical\s+Damage\s+when\s+dual\s+wielding\s+Axes$",
            "damage_to_terrain_flat_with_axes"
        ),
        // 180. Increased Attack Radius when dual wielding Axes
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Attack\s+Radius\s+when\s+dual\s+wielding\s+Axes$",
            "attack_radius_dual_axes"
        ),
        // 181. Increased Attack Radius
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Attack\s+Radius$",
            "attack_radius"
        ),
        // 182. Increased (Melee Attack Damage|Melee Damage) with Two Handed Melee Weapon
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(?:Melee\s+Attack\s+Damage|Melee\s+Damage)\s+when\s+using\s+a\s+Two\s+Handed\s+Melee\s+Weapon$",
            "damage_with_two_handed"
        ),
        // 183. Increased Damage|Ailment Damage with Two Handed Weapon
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+(?:Damage\s+when\s+using\s+a\s+Two\s+Handed\s+Weapon|Ailment\s+Damage\s+when\s+using\s+a\s+Two\s+Handed\s+Weapon)$",
            "damage_with_two_handed"
        ),
        // 184. Spell Projectile Damage with Staff/Cane
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Spell\s+Projectile\s+Damage\s+when\s+wielding\s+a\s+Staff\s+or\s+a\s+Cane$",
            "two_handed_spell_projectile_damage"
        ),
        // 185. Magic Skill Damage with Wand
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Magic\s+Skill\s+Damage\s+while\s+wielding\s+a\s+Wand$",
            "magic_skill_damage_with_wand"
        ),
        // 186. Chance to block Physical Damage with Staff/Cane
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+block\s+Physical\s+Damage\s+when\s+wielding\s+a\s+Staff\s+or\s+a\s+Cane$",
            "block_chance_physical_two_handed"
        ),
        // 187. Increased Melee Attack Range when using a Shield
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Melee\s+Attack\s+Range\s+when\s+using\s+a\s+Shield$",
            "melee_range"
        ),
        // 188. Damage Mitigation when using a Shield
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Damage\s+Mitigation\s+when\s+using\s+a\s+Shield$",
            "damage_mitigation"
        ),
        // 189. Increased Total Crit Damage when using a Shield → crit_damage_more
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Total\s+Critical\s+Strike\s+Damage\s+when\s+using\s+a\s+Shield$",
            "crit_damage_more"
        ),
        // 190. Vitality (flat) with shield
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Vitality\s+when\s+wielding\s+a\s+shield$",
            "vitality_with_shield_flat"
        ),
        // 191. Increased Vitality with shield
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Vitality\s+when\s+wielding\s+a\s+shield$",
            "vitality_with_shield"
        ),
        // 192. Increased Min Damage with shield
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Minimum\s+Damage\s+when\s+wielding\s+a\s+shield$",
            "min_damage_with_shield"
        ),
        // 193. Increased Max Damage with shield
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Maximum\s+Damage\s+when\s+wielding\s+a\s+shield$",
            "max_damage_with_shield"
        ),
        // 194. Damage Returned (flat) with Shield → damage_return
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Damage\s+Returned\s+when\s+wielding\s+a\s+Shield$",
            "damage_return"
        ),
        // 195. Projectile Damage with Gun
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Projectile\s+Damage\s+when\s+using\s+a\s+Gun$",
            "damage_with_gun"
        ),
        // 196. Ranged Projectile Damage with Bow
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Ranged\s+Projectile\s+Damage\s+when\s+using\s+a\s+Bow$",
            "damage_with_bow"
        ),
        // 197. Projectile Damage with Throwing Weapon
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Projectile\s+Damage\s+when\s+using\s+a\s+Throwing\s+Weapon$",
            "damage_with_throwing"
        ),
        // 198. % to All Resistances (alt — no Total variant, plain %)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+All\s+Resistances$",
            "all_resistances"
        ),
        // 199. Increased Sentry Duration (duplicate of 120 — TS has it twice)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Sentry\s+Duration$",
            "sentry_duration"
        ),
        // 200. Attack Speed at Full Life
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Attack\s+Speed\s+at\s+Full\s+Life$",
            "attack_speed_full_life"
        ),
        // 201. (to )? Increased Total Attack Rating → attack_rating_pct
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+(?:to\s+)?Increased\s+Total\s+Attack\s+Rating$",
            "attack_rating_pct"
        ),
        // 202. Increased Total Damage Return
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Total\s+Damage\s+Return$",
            "damage_return_more"
        ),
        // 203. Damage Returned against Bosses
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Damage\s+Returned\s+against\s+Bosses$",
            "damage_returned_against_bosses"
        ),
        // 204. Echo chance against bosses
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+returned\s+damage\s+against\s+a\s+boss\s+to\s+echo\s+an\s+additional\s+time$",
            "returned_damage_echo_chance_boss"
        ),
        // 205. Echo chance generic (with optional "till failior" typo from TS)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+returned\s+damage\s+to\s+echo\s+an\s+additional\s+time(?:\s+till\s+failior)?$",
            "returned_damage_echo_chance"
        ),
        // 206. Return damage as AoE chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+return\s+the\s+damage\s+as\s+area\s+of\s+effect\s+damage$",
            "returned_damage_aoe_chance"
        ),
        // 207. Returned damage to crit chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+returned\s+damage\s+to\s+critically\s+hit$",
            "returned_damage_crit_chance"
        ),
        // 208. Returned damage converted to Burning
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Damage\s+Returned\s+is\s+converted\s+into\s+Burning$",
            "returned_damage_to_burning"
        ),
        // 209. Returned damage as Lightning
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Returned\s+Damage\s+is\s+dealt\s+as\s+Lightning\s+Damage$",
            "returned_damage_to_lightning"
        ),
        // 210. Chance for monsters to rest in peace
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+monsters\s+to\s+rest\s+in\s+peace$",
            "rest_in_peace_chance"
        ),
        // 211. Max Magic Damage Reduction
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+Maximum\s+Magic\s+Damage\s+Reduction$",
            "max_magic_damage_reduction"
        ),
        // 212. Max Physical Damage Reduction
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+Maximum\s+Physical\s+Damage\s+Reduction$",
            "max_physical_damage_reduction"
        ),
        // 213. Ranged damage per rage stack
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Ranged\s+Projectile\s+Damage\s+per\s+stack\s+of\s+rage$",
            "ranged_damage_per_rage_stack"
        ),
        // 214. Damage per Stack of Rage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Damage\s+Increased\s+per\s+Stack\s+of\s+Rage$",
            "damage_per_rage_stack"
        ),
        // 215. (Ranged) Physical Damage per 500 mana — Ranged variant detected from m[0]
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Increased\s+(?:Ranged\s+)?Physical\s+Damage\s+per\s+500\s+mana$",
            )
            .unwrap(),
            build: |m| {
                let is_ranged = m[0].to_ascii_lowercase().contains("ranged");
                Some(ParsedMod {
                    key: if is_ranged {
                        "ranged_physical_per_500_mana".to_string()
                    } else {
                        "additive_physical_per_500_mana".to_string()
                    },
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 216. Magic Skill Damage per 750 mana
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Magic\s+Skills?\s+Damage\s+per\s+750\s+points\s+in\s+Mana$",
            "magic_skill_damage_per_750_mana"
        ),
        // 217. Charging Damage per Strength
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Charging\s+Damage\s+per\s+point\s+in\s+Strength$",
            "charging_damage_per_strength"
        ),
        // 218. Max Life per 5 Strength (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Life\s+per\s+5\s+points\s+in\s+Strength$",
            "life_replenish_flat_strength"
        ),
        // 219. Damage Replenished as Life when struck
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Damage\s+Replenished\s+as\s+Life\s+when\s+struck$",
            "damage_to_life_replenish_chance"
        ),
        // 220. Max Life replenished when evading
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Maximum\s+Life\s+replenished\s+when\s+evading$",
            "life_replenish_when_evading"
        ),
        // 221. Max Life replenished when struck
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Maximum\s+Life\s+replenished\s+when\s+struck$",
            "damage_to_life_replenish_chance"
        ),
        // 222. Max Life replenished when suppressing
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Maximum\s+Life\s+replenished\s+when\s+suppressing$",
            "life_replenish_when_suppressing"
        ),
        // 223. Replenish life and mana on ranged hit
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+replenish\s+\d+\s+life\s+and\s+\d+\s+mana\s+on\s+hit\s+with\s+ranged\s+attacks$",
            "life_replenish_mana_on_ranged_hit"
        ),
        // 224. Total Life Replenish (optional below-40 suffix)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Total\s+Life\s+Replenish(?:\s+when\s+current\s+life\s+is\s+below\s+40%\s+of\s+Maximum\s+Life)?$",
            "life_replenish_more"
        ),
        // 225. Life Regen from Flasks
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Life\s+Regeneration\s+from\s+Flasks$",
            "life_regen_flask"
        ),
        // 226. Reduced damage while flask regen
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Reduced\s+damage\s+taken\s+while\s+flask\s+regeneration$",
            "flask_damage_reduction"
        ),
        // 227. Increased (Total)? Life Steal — Total detected from m[0] (alt phrasing)
        ParseRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+Increased\s+(?:Total\s+)?Life\s+Steal$",
            )
            .unwrap(),
            build: |m| {
                let is_total = m[0].to_ascii_lowercase().contains("total");
                Some(ParsedMod {
                    key: if is_total {
                        "life_steal_more".to_string()
                    } else {
                        "life_steal".to_string()
                    },
                    value: num(&m[1]),
                    self_condition: None,
                })
            },
        },
        // 228. of Life Stolen Suppressed
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Life\s+Stolen\s+Suppressed$",
            "life_steal_suppressed"
        ),
        // 229. Max Mana regenerated per second
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Maximum\s+Mana\s+regenerated\s+per\s+second$",
            "mana_regen_per_second"
        ),
        // 230. Damage Mitigation when struck
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Damage\s+Mitigation\s+for\s+a\s+short\s+duration\s+when\s+struck$",
            "damage_mitigation_when_struck"
        ),
        // 231. Damage by AoE skills → area_of_effect
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+damage\s+dealt\s+by\s+Area\s+of\s+Effect\s+skills$",
            "area_of_effect"
        ),
        // 232. Crushing Blow Chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Crushing\s+Blow\s+Chance$",
            "crushing_blow_chance"
        ),
        // 233. Crushing Blow Effectiveness
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Crushing\s+Blow\s+Effectiveness$",
            "crushing_blow_effectiveness"
        ),
        // 234. Deadly Blow Effectiveness
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+effectiveness\s+of\s+Deadly\s+Blow$",
            "deadly_blow_effectiveness"
        ),
        // 235. Deadly Blow AoE chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+deal\s+area\s+of\s+effect\s+damage\s+with\s+deadly\s+blow$",
            "deadly_blow_aoe_chance"
        ),
        // 236. Deadly Blow AoE size
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Deadly\s+Blow\s+Area\s+of\s+Effect\s+Damage$",
            "deadly_blow_aoe_size"
        ),
        // 237. Chance for Projectiles to Fork
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+Projectiles\s+to\s+Fork(?:\s+on\s+Hit)?$",
            "fork_chance"
        ),
        // 238. Extra Forking Projectile (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Extra\s+Forking\s+Projectile$",
            "additional_forking_projectiles"
        ),
        // 239. Extra Projectile (optional ranged context)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Extra\s+Projectile(?:\s+Fired\s+with\s+Ranged\s+Attacks)?$",
            "extra_ranged_projectiles"
        ),
        // 240. Additional projectile fired ranged attack
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Additional\s+projectile\s+fired\s+when\s+performing\s+a\s+ranged\s+attack$",
            "additional_projectile_fixed"
        ),
        // 241. Chance to fire extra projectile on ranged attack
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+fire\s+an\s+additional\s+projectile\s+when\s+performing\s+a\s+ranged\s+attack$",
            "extra_ranged_projectile_chance"
        ),
        // 242. Chance for additional ranged attack
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+on\s+ranged\s+attack\s+to\s+perform\s+it\s+an\s+additional\s+time$",
            "ranged_extra_attack_chance"
        ),
        // 243. Chance to unleash extra attack or projectile
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+unleash\s+an\s+additional\s+attack\s+or\s+projectile\s+on\s+attack$",
            "extra_attack_or_projectile_chance"
        ),
        // 244. Colossus damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Colossus\s+damage$",
            "colossus_damage"
        ),
        // 245. Life Replenish per Colossus Stack
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Life\s+Replenish\s+for\s+each\s+Colossus\s+stack$",
            "life_replenish_per_colossus_stack"
        ),
        // 246. Death Explosion Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Death\s+Explosion\s+damage$",
            "death_explosion_damage"
        ),
        // 247. Soul Ignition explode chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+monsters\s+slain\s+by\s+damage\s+return\s+to\s+explode\s+dealing\s+area\s+of\s+effect\s+damage$",
            "soul_ignition_explode_chance"
        ),
        // 248. Overflow Effectiveness
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Overflow\s+Effectiveness$",
            "overflow_effectiveness"
        ),
        // 249. Agitation Movement Speed
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Agitation\s+Movement\s+Speed$",
            "agitation_movement_speed"
        ),
        // 250. Evasion when struck chance (variant: "when struck")
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+gain\s+\d+%\s+Evasion\s+for\s+a\s+short\s+duration\s+when\s+struck$",
            "evasion_when_struck_chance"
        ),
        // 251. Evasion when struck chance (variant: "after being hit")
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+gain\s+\d+%\s+Evasion\s+for\s+a\s+short\s+duration\s+after\s+being\s+hit$",
            "evasion_when_struck_chance"
        ),
        // 252. Evasion Duration (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Evasion\s+Duration$",
            "evasion_duration"
        ),
        // 253. Gas Cloud chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+leave\s+a\s+cloud\s+of\s+poisonous\s+gas\s+when\s+struck$",
            "gas_cloud_when_struck_chance"
        ),
        // 254. Gas Cloud Poisoned Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Gas\s+Cloud\s+Poisoned\s+Damage$",
            "gas_cloud_poisoned_damage"
        ),
        // 255. Max Life as Explosion Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Maximum\s+Life\s+as\s+Explosion\s+Damage$",
            "summon_max_life_as_explosion"
        ),
        // 256. Weapon Throw Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Weapon\s+Throw\s+Damage$",
            "weapon_throw_damage"
        ),
        // 257. Temporal Echo Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Temporal\s+Echo\s+Damage$",
            "temporal_echo_damage"
        ),
        // 258. Branch Damage (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Branch\s+Damage$",
            "branch_damage"
        ),
        // 259. Stampede Damage per physical
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Stampede\s+Damage\s+based\s+on\s+your\s+physical\s+damage$",
            "stampede_damage_per_physical"
        ),
        // 260. Splash damage around target
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+splash\s+damage\s+to\s+monsters\s+around\s+the\s+target$",
            "splash_damage_around_target"
        ),
        // 261. Piercing spikes when struck → damage_return_more
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+unleash\s+piercing\s+spikes\s+outwards\s+when\s+struck$",
            "damage_return_more"
        ),
        // 262. Total Damage Dealt (and Damage Taken)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Total\s+Damage\s+Dealt(?:\s+and\s+Damage\s+Taken)?$",
            "total_damage_dealt_and_taken"
        ),
        // 263. Damage Dealt and Taken Amp
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Damage\s+and\s+Increased\s+Damage\s+Taken$",
            "damage_dealt_and_taken_amp"
        ),
        // 264. CC Immunity Decrease More
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Decreased\s+Monster\s+Crowd\s+Control\s+Immunity$",
            "cc_immunity_decrease_more"
        ),
        // 265. Damage to CC-Immune monsters
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Damage\s+dealt\s+to\s+monsters\s+with\s+Crowd\s+Control\s+Immunity$",
            "damage_to_cc_immune"
        ),
        // 266. Monster DoT Immunity Shattered
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Monster\s+Damage\s+Over\s+Time\s+Immunity\s+Shattered$",
            "monster_dot_immunity_shattered"
        ),
        // 267. Elemental Weakness
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Elemental\s+Weakness$",
            "elemental_weakness"
        ),
        // 268. Defense Ignored
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Target\s+Defense\s+Ignored$",
            "defense_ignored"
        ),
        // 269. Stun Duration (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Stun\s+Duration$",
            "stun_duration"
        ),
        // 270. Mana costs paid in life
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Mana\s+Costs\s+are\s+taken\s+from\s+life\s+instead$",
            "mana_cost_paid_in_life"
        ),
        // 271. Damage drained from mana
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Damage\s+Taken\s+is\s+drained\s+from\s+mana\s+instead$",
            "damage_drained_from_mana"
        ),
        // 272. Bleed AoE chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+deal\s+\d+%\s+area\s+of\s+effect\s+damage\s+on\s+bleed\s+tick$",
            "bleed_aoe_chance"
        ),
        // 273. Bleed AoE Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Bleed\s+AoE\s+Damage$",
            "bleed_aoe_damage"
        ),
        // 274. Spell Duration Seconds (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s*Seconds?\s+to\s+Spell\s+Duration$",
            "spell_duration_seconds"
        ),
        // 275. Spell Area of Effect Radius (alt phrasing)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Spell\s+Area\s+of\s+Effect\s+Radius$",
            "spell_aoe_radius"
        ),
        // 276. Spell Projectile Size (alt)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Spell\s+Projectile\s+Size$",
            "spell_projectile_size"
        ),
        // 277. Time Surge chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+for\s+Spell\s+Critical\s+hits\s+to\s+grant\s+Time\s+Surge\s+for\s+\d+\s+seconds$",
            "time_surge_chance"
        ),
        // 278. Mirror of Odin chance (TS typo "reaking" preserved)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+on\s+cast\s+to\s+summon\s+a\s+Mirror\s+of\s+Odin\s+reaking\s+havoc\s+at\s+nearby\s+monsters$",
            "mirror_of_odin_chance"
        ),
        // 279. Lightning per element (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Lightning\s+Damage\s+scaling\s+from\s+all\s+elemental\s+sources$",
            "lightning_per_element"
        ),
        // 280. Cooldown recovery after kill chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+after\s+kill\s+to\s+recover\s+all\s+skill\s+cooldowns$",
            "cooldown_recovery_after_kill_chance"
        ),
        // 281. Cooldown Recovered (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Cooldown\s+Recovered$",
            "cooldown_recovered_flat"
        ),
        // 282. Extra Damage from summon life
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Extra\s+Damage\s+based\s+on\s+summons\s+maximum\s+life$",
            "extra_damage_from_summon_life"
        ),
        // 283. Resistances converted to Life — explicit reject (TS returns null)
        null_rule!(r"(?i)^([+\-\d.]+)%\s+of\s+Resistances\s+converted\s+to\s+Life$"),
        // 284. Wizardry cast rate per stack
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Faster\s+Cast\s+Rate\s+per\s+Stack\s+of\s+Wizardry$",
            "wizardry_cast_rate"
        ),
        // 285. Mage Guard chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+gain\s+a\s+stack\s+of\s+Mage\s+Guard\s+when\s+you\s+cast\s+a\s+spell\s+up\s+to\s+\d+\s+stacks$",
            "mage_guard_chance"
        ),
        // 286. Mage Guard damage reduction per stack
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Damage\s+Reduction\s+per\s+stack\s+of\s+Mage\s+Guard$",
            "mage_guard_damage_reduction"
        ),
        // 287. Desert Ripple Damage → sand_ripple_damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Desert\s+Ripple\s+Damage$",
            "sand_ripple_damage"
        ),
        // 288. AoE Pull Chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+on\s+hit\s+for\s+Area\s+of\s+Effect\s+skills\s+to\s+pull\s+monsters\s+in$",
            "aoe_pull_chance"
        ),
        // 289. Additional Explosion Chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+cause\s+monsters\s+damaged\s+by\s+an\s+explosion\s+to\s+unleash\s+an\s+additional\s+explosion$",
            "additional_explosion_chance"
        ),
        // 290. Ramping Pulse chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+on\s+explosion\s+or\s+area\s+of\s+effect\s+skill\s+to\s+gain\s+a\s+stack\s+of\s+Ramping\s+Pulse\s+increasing\s+the\s+radius\s+of\s+area\s+of\s+effect\s+and\s+explosion\s+skills$",
            "ramping_pulse_chance"
        ),
        // 291. Maximum Stacks (flat) → ramping_pulse_max_stacks
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Maximum\s+Stacks$",
            "ramping_pulse_max_stacks"
        ),
        // 292. Dual wield 2H Melee (fixed value 1)
        fixed_rule!(
            r"(?i)^You\s+can\s+now\s+dual\s+wield\s+Two\s+Handed\s+Melee\s+Weapons$",
            "dual_wield_2h_melee",
            1.0
        ),
        // 293. Increased Manacost
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Manacost$",
            "increased_manacost"
        ),
        // 294. Ranged Projectile Damage conditional (crit < 40)
        cond_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Ranged\s+Projectile\s+Damage\s+when\s+Critical\s+Strike\s+Chance\s+is\s+below\s+40%$",
            "ranged_projectile_damage",
            SelfConditionKey::CritChanceBelow40
        ),
        // 295. Physical Damage conditional (life < 40)
        cond_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Physical\s+Damage\s+while\s+below\s+40%\s+Maximum\s+Life$",
            "enhanced_damage",
            SelfConditionKey::LifeBelow40
        ),
        // 296. Force Field Protection (fixed 1)
        fixed_rule!(
            r"(?i)^You\s+can\s+no\s+longer\s+dodge\s+monster\s+attacks\s+but\s+also\s+cannot\s+be\s+stunned\s+or\s+frozen$",
            "force_field_protection",
            1.0
        ),
        // 297. Max All Resistances Cap
        mod_rule!(
            r"(?i)^Your\s+Maximum\s+All\s+Resistances\s+are\s+capped\s+to\s+([+\-\d.]+)%$",
            "max_all_resistances_cap"
        ),
        // 298. Light Radius converted to attributes
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+your\s+Light\s+Radius\s+added\s+as\s+Increased\s+All\s+Attributes$",
            "light_radius_to_attributes"
        ),
        // 299. Total Melee Enhanced Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Total\s+Melee\s+Enhanced\s+Damage$",
            "enhanced_damage_melee_more"
        ),
        // 300. Total Ranged Enhanced Damage
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Total\s+Ranged\s+Enhanced\s+Damage$",
            "enhanced_damage_ranged_more"
        ),
        // 301. Skill weapon restrictions removed (fixed 1)
        fixed_rule!(
            r"(?i)^Your\s+skill\s+weapon\s+type\s+restrictions\s+are\s+removed$",
            "skill_restrictions_removed",
            1.0
        ),
        // 302. Bone Fragment chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+gain\s+an\s+orbiting\s+Bone\s+Fragment\s+when\s+struck$",
            "bone_fragment_chance"
        ),
        // 303. Bone Fragment inheritance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Return\s+Damage\s+inherited\s+by\s+Bone\s+Fragment$",
            "bone_fragment_inherit"
        ),
        // 304. Vampirism instant life steal
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Life\s+Steal\s+is\s+now\s+instant\s+but\s+you\s+cannot\s+replenish\s+life\s+from\s+any\s+other\s+sources$",
            "vampirism_instant_life_steal"
        ),
        // 305. Damage ignored (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+of\s+Incoming\s+Damage\s+is\s+ignored$",
            "damage_ignored_flat"
        ),
        // 306. Damage Taken Reduced (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Damage\s+Taken\s+Reduced$",
            "damage_taken_reduced"
        ),
        // 307. Extra Jump (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+Extra\s+Jump\s+that\s+can\s+be\s+performed\s+mid\s+air$",
            "extra_jump_count"
        ),
        // 308. Increased Jump Power
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Jump\s+Power$",
            "jumping_power"
        ),
        // 309. Damage Mitigation when phasing
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+to\s+Damage\s+Mitigation\s+when\s+phasing\s+through\s+monsters$",
            "damage_mitigation"
        ),
        // 310. Path to any Black Hole — explicit reject (TS returns null)
        null_rule!(r"(?i)^(?:\+0\s+)?Path\s+to\s+any\s+Black\s+Hole$"),
        // 311. Max Combat Mitigation Stacks (flat)
        mod_rule!(
            r"(?i)^([+\-\d.]+)\s+to\s+Maximum\s+Combat\s+Mitigation\s+Stacks$",
            "max_combat_mitigation_stacks"
        ),
        // 312. Damage recouped as mana
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Damage\s+Taken\s+Recovered\s+as\s+Mana$",
            "damage_recouped_as_mana"
        ),
        // 313. Evade projectile chance when dual wielding
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+to\s+Evade\s+projectiles\s+when\s+dual\s+wielding$",
            "evade_projectile_chance"
        ),
        // 314. Increased Melee Attack Range
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Melee\s+Attack\s+Range$",
            "melee_range"
        ),
        // 315. Increased Melee Attack Range with Shield (dup of 187)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Melee\s+Attack\s+Range\s+when\s+using\s+a\s+Shield$",
            "melee_range"
        ),
        // 316. Your Mana Costs from life (alt phrasing)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Your\s+Mana\s+Costs\s+are\s+taken\s+from\s+life\s+instead$",
            "mana_cost_paid_in_life"
        ),
        // 317. Ailment Damage only ailments (alt)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Ailment\s+Damage\s+but\s+you\s+can\s+only\s+deal\s+damage\s+with\s+ailments$",
            "ailment_damage_all"
        ),
        // 318. Skills Damage added to Ailments (dup of 158)
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Skills\s+Damage\s+added\s+to\s+the\s+Ailments\s+damage$",
            "skill_damage_to_ailments"
        ),
        // 319. Reduced Damage Healed Over Time
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+of\s+Reduced\s+Damage\s+Healed\s+Over\s+Time$",
            "damage_to_life_replenish_chance"
        ),
        // 320. Chaos meteor chance → additional_explosion_chance
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Chance\s+on\s+hit\s+with\s+Area\s+of\s+Effect\s+Spells\s+to\s+call\s+down\s+a\s+chaos\s+meteor\s+dealing\s+\d+%\s+of\s+the\s+damage\.?\s+The\s+proc\s+chance\s+is\s+lowered\s+to\s+\d+%\s+with\s+non\s+single\s+hitting\s+skills$",
            "additional_explosion_chance"
        ),
        // 321. Summons explode at low life (fixed 1)
        fixed_rule!(
            r"(?i)^Summons\s+explode\s+at\s+\d+%\s+life\s+dealing\s+area\s+of\s+effect\s+fire\s+damage\s+based\s+on\s+their\s+life$",
            "summon_explode_on_low_life",
            1.0
        ),
        // 322. Summons explode instantly (fixed 1)
        fixed_rule!(
            r"(?i)^Summons\s+now\s+explode\s+instantly\s+after\s+coming\s+in\s+contact\s+with\s+a\s+monster$",
            "summon_instant_explode",
            1.0
        ),
        // 323. Summon chain void blast (fixed 1)
        fixed_rule!(
            r"(?i)^Summon\s+projectile\s+chain\s+hits\s+unleash\s+a\s+Void\s+Blast\s+dealing\s+damage\s+around\s+the\s+target$",
            "summon_chain_void_blast",
            1.0
        ),
        // 324. Life replenish every 2 seconds (fixed 0! flag-like in TS)
        fixed_rule!(
            r"(?i)^Life\s+replenish\s+now\s+happens\s+every\s+2\s+seconds\s+with\s+increased\s+power$",
            "life_replenish_more",
            0.0
        ),
        // 325. Increased Life Replenish → life_replenish_more
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Life\s+Replenish$",
            "life_replenish_more"
        ),
        // 326. Chance for Sand Ripple (fixed 0)
        fixed_rule!(
            r"(?i)^Chance\s+on\s+hit\s+to\s+unleash\s+a\s+Sand\s+Ripple\s+dealing\s+damage\s+on\s+a\s+radius\s+around\s+the\s+target$",
            "sand_ripple_chance",
            0.0
        ),
        // 327. Sand Beam guardians (fixed 0)
        fixed_rule!(
            r"(?i)^After\s+\d+\s+attacks\s+guardians\s+unleash\s+a\s+Sand\s+Beam$",
            "sand_beam_damage",
            0.0
        ),
        // 328. Over heat cast rate (fixed 0) — TS handles \r? in pattern
        fixed_rule!(
            r"(?i)^Gain\s+\d+%\s+increased\s+total\s+cast\r?\s+rate\s+but\s+over\s+heat\s+after\s+\d+\s+casts\s+causing\s+decreased\s+cast\s+rate\s+but\s+increased\s+total\s+damage$",
            "wizardry_cast_rate",
            0.0
        ),
        // 329. Total Damage from over heat → enhanced_damage_more
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Total\s+Damage\s+and\s+Decreased\s+Cast\s+Rate\s+from\s+over\s+heat$",
            "enhanced_damage_more"
        ),
        // 330. Attack speed & damage & resistances → increased_attack_speed
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Increased\s+Attack\s+Speed\s+&\s+Damage\s+and\s+Increased\s+Damage\s+Reduction\s+&\s+All\s+Resistances$",
            "increased_attack_speed"
        ),
        // 331. Full life bonuses → attack_speed_full_life
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+When\s+at\s+full\s+Life\s+gain\s+increased\s+total\s+Attack\s+Speed\s+and\s+Damage\s+Dealt\s+but\s+also\s+decreased\s+Damage\s+Reduction\s+and\s+All\s+Resistances$",
            "attack_speed_full_life"
        ),
        // 332. Total Summon Projectile Damage → summon_projectile_damage_more
        mod_rule!(
            r"(?i)^([+\-\d.]+)%\s+Total\s+Summon\s+Projectile\s+Damage$",
            "summon_projectile_damage_more"
        ),
    ]
});

pub(crate) static CONVERSION_RULES: Lazy<Vec<ConversionRule>> = Lazy::new(|| {
    vec![
        // 1. N% of Increased Attack Speed added as Magic Skill Damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+(?:your\s+)?Increased\s+Attack\s+Speed\s+is\s+added\s+as\s+Magic\s+Skill\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "increased_attack_speed".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "magic_skill_damage".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 2. N% of <element> Resistance converted to Increased <element> Skill Damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+(?:your\s+)?(arcane|cold|fire|lightning|poison)\s+Resistance\s+is\s+converted\s+to\s+Increased\s+(?:arcane|cold|fire|lightning|poison)\s+Skill\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                let element = m[2].to_ascii_lowercase();
                Some(ParsedConversion {
                    from_key: format!("{}_resistance", element),
                    from_kind: ConvertKind::Stat,
                    to_key: format!("{}_skill_damage", element),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 3. N% of <attribute> converted to / added as <stat-text>
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+(strength|dexterity|intelligence|energy|vitality|armor)\s+(?:converted\s+to|(?:is\s+)?added\s+as)\s+(.+)$",
            )
            .unwrap(),
            build: |m| {
                let target = m[3].trim().to_ascii_lowercase();
                let target_key = CONVERSION_TARGET_STATS.get(target.as_str()).copied()?;
                Some(ParsedConversion {
                    from_key: m[2].to_ascii_lowercase(),
                    from_kind: ConvertKind::Attribute,
                    to_key: target_key.to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 4. Defense → life
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+(?:your\s+)?Defense\s+is\s+converted\s+to\s+life$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "defense".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "life".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 5. Resistances → Life
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Resistances\s+converted\s+to\s+Life$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "all_resistances".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "life".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 6. All Resistances over the cap converted to life
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+All\s+Resistances\s+over\s+the\s+cap\s+converted\s+to\s+life$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "all_resistances".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "life".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 7. Attack Damage → Increased Life
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Attack\s+Damage\s+converted\s+to\s+Increased\s+Life$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "attack_damage".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "increased_life".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 8. Negative All Resistances → Increased Maximum Life
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+(?:your\s+)?Negative\s+All\s+Resistances\s+are\s+added\s+as\s+Increased\s+Maximum\s+Life$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "all_resistances".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "increased_life".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 9. Negative All Resistances → enhanced_damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Negative\s+All\s+Resistances\s+added\s+as\s+increased\s+damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "all_resistances".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "enhanced_damage".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 10. Maximum Life → Maximum Mana
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Maximum\s+Life\s+added\s+as\s+Maximum\s+Mana$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "life".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "mana".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 11. Maximum Mana → Maximum Life
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Maximum\s+Mana\s+added\s+as\s+Maximum\s+life$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "mana".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "life".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 12. Increased Maximum Mana → Magic Skill Damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Increased\s+Maximum\s+Mana\s+added\s+as\s+Magic\s+Skill\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "increased_mana".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "magic_skill_damage".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 13. Increased Movement Speed → Attack Damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+(?:your\s+)?Increased\s+Movement\s+Speed\s+converted\s+to\s+Attack\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "movement_speed".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "attack_damage".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 14. Energy → Ranged Physical Damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Energy\s+is\s+added\s+as\s+Ranged\s+Physical\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "energy".to_string(),
                    from_kind: ConvertKind::Attribute,
                    to_key: "ranged_physical_per_500_mana".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 15. Area of Effect Radius → AoE Damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Area\s+of\s+Effect\s+Radius\s+converted\s+to\s+Area\s+of\s+Effect\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "area_of_effect".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "spell_aoe_damage".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 16. Explosion AoE → Explosion Damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Explosion\s+Area\s+of\s+Effect\s+radius\s+converted\s+to\s+Explosion\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "explosion_aoe".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "explosion_damage".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 17. Dexterity → Ranged Projectile Damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Dexterity\s+Converted\s+to\s+Ranged\s+Projectile\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "dexterity".to_string(),
                    from_kind: ConvertKind::Attribute,
                    to_key: "ranged_projectile_damage".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 18. Strength → Unarmed weapon damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Strength\s+converted\s+to\s+weapon\s+damage\s+when\s+Unarmed,\s+Strength\s+no\s+longer\s+provides\s+attack\s+damage\.?$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "strength".to_string(),
                    from_kind: ConvertKind::Attribute,
                    to_key: "str_to_unarmed_damage".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 19. Physical Damage → Arrow Damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+physical\s+damage\s+as\s+Arrow\s+Damage$",
            )
            .unwrap(),
            build: |m| {
                Some(ParsedConversion {
                    from_key: "additive_physical_damage".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: "physical_to_arrow_damage".to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 20. Enhanced Damage → weapon-specific damage (Bow/Throwing/Gun/Axe)
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+to\s+Enhanced\s+Damage\s+when\s+using\s+(Bow|Throwing\s+Weapon|Gun|Axe)$",
            )
            .unwrap(),
            build: |m| {
                let weapon = m[2].to_ascii_lowercase();
                let target_key = if weapon == "bow" {
                    "damage_with_bow"
                } else if weapon == "gun" {
                    "damage_with_gun"
                } else if weapon == "axe" {
                    "damage_with_axe"
                } else {
                    "damage_with_throwing"
                };
                Some(ParsedConversion {
                    from_key: "enhanced_damage".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: target_key.to_string(),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
        // 21. Physical Damage → <element> damage
        ConversionRule {
            test: Regex::new(
                r"(?i)^([+\-\d.]+)%\s+of\s+Physical\s+Damage\s+converted\s+to\s+(arcane|cold|fire|lightning|poison)$",
            )
            .unwrap(),
            build: |m| {
                let element = m[2].to_ascii_lowercase();
                Some(ParsedConversion {
                    from_key: "additive_physical_damage".to_string(),
                    from_kind: ConvertKind::Stat,
                    to_key: format!("physical_to_{}", element),
                    to_kind: ConvertKind::Stat,
                    pct: num(&m[1]),
                })
            },
        },
    ]
});

pub(crate) static DISABLE_RULES: Lazy<Vec<DisableRule>> = Lazy::new(|| {
    vec![DisableRule {
        test: Regex::new(
            r"(?i)^You\s+cannot\s+regenerate\s+life\s+from\s+life\s+replenish\s+anymore$",
        )
        .unwrap(),
        target: DisableTarget::LifeReplenish,
    }]
});

// ---------- caches ----------

static MOD_CACHE: Lazy<Mutex<HashMap<String, Option<ParsedMod>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static META_CACHE: Lazy<Mutex<HashMap<String, Option<ParsedMeta>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// ---------- dispatchers ----------

pub fn parse_tree_node_mod(line: &str) -> Option<ParsedMod> {
    let trimmed = line.trim();
    {
        let cache = MOD_CACHE.lock().unwrap();
        if let Some(cached) = cache.get(trimmed) {
            return cached.clone();
        }
    }

    let (base, self_condition) = strip_self_condition(trimmed);
    let mut candidates: Vec<String> = vec![base.clone()];
    let stripped = strip_weapon_context(&base);
    if stripped != base {
        candidates.push(stripped);
    }

    for candidate in &candidates {
        for rule in RULES.iter() {
            let Some(caps) = rule.test.captures(candidate) else {
                continue;
            };
            match (rule.build)(&caps) {
                None => {
                    // Rule matched but explicitly rejected (TS `built === null`)
                    // — abort and cache as None.
                    MOD_CACHE.lock().unwrap().insert(trimmed.to_string(), None);
                    return None;
                }
                Some(built) if built.value.is_finite() => {
                    let out = ParsedMod {
                        self_condition: self_condition.or(built.self_condition),
                        ..built
                    };
                    MOD_CACHE
                        .lock()
                        .unwrap()
                        .insert(trimmed.to_string(), Some(out.clone()));
                    return Some(out);
                }
                Some(_) => {
                    // Non-finite value — skip and try next rule.
                    continue;
                }
            }
        }
    }
    MOD_CACHE.lock().unwrap().insert(trimmed.to_string(), None);
    None
}

pub fn parse_tree_node_meta(line: &str) -> Option<ParsedMeta> {
    let trimmed = line.trim();
    {
        let cache = META_CACHE.lock().unwrap();
        if let Some(cached) = cache.get(trimmed) {
            return cached.clone();
        }
    }

    for rule in CONVERSION_RULES.iter() {
        if let Some(caps) = rule.test.captures(trimmed) {
            if let Some(out) = (rule.build)(&caps) {
                if out.pct.is_finite() {
                    let meta = ParsedMeta::Convert(out);
                    META_CACHE
                        .lock()
                        .unwrap()
                        .insert(trimmed.to_string(), Some(meta.clone()));
                    return Some(meta);
                }
            }
        }
    }
    for rule in DISABLE_RULES.iter() {
        if rule.test.is_match(trimmed) {
            let meta = ParsedMeta::Disable(ParsedDisable {
                target: rule.target,
            });
            META_CACHE
                .lock()
                .unwrap()
                .insert(trimmed.to_string(), Some(meta.clone()));
            return Some(meta);
        }
    }
    META_CACHE.lock().unwrap().insert(trimmed.to_string(), None);
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- num ----

    #[test]
    fn num_parses_signed_and_unsigned() {
        assert_eq!(num("5"), 5.0);
        assert_eq!(num("+12"), 12.0);
        assert_eq!(num("-3"), -3.0);
        assert_eq!(num("0"), 0.0);
        assert_eq!(num("1.5"), 1.5);
        assert_eq!(num("+0.25"), 0.25);
    }

    #[test]
    fn num_invalid_returns_nan() {
        assert!(num("abc").is_nan());
        assert!(num("").is_nan());
        assert!(num("--5").is_nan());
    }

    // ---- strip_weapon_context ----

    #[test]
    fn strip_weapon_context_removes_suffix() {
        let line = "+10 to Strength when wielding a sword";
        assert_eq!(strip_weapon_context(line), "+10 to Strength");
        let two = "+50% Critical Strike Damage while using a two handed melee weapon";
        assert_eq!(strip_weapon_context(two), "+50% Critical Strike Damage");
        let bow = "+15 to Dexterity while wielding a bow";
        assert_eq!(strip_weapon_context(bow), "+15 to Dexterity");
    }

    #[test]
    fn strip_weapon_context_unchanged_when_no_suffix() {
        let line = "+10 to Strength";
        assert_eq!(strip_weapon_context(line), line);
        // Suffix in middle of string, not at end → no strip.
        let mid = "while using a sword you get nothing";
        assert_eq!(strip_weapon_context(mid), mid);
    }

    // ---- strip_self_condition ----

    #[test]
    fn strip_self_condition_crit_chance() {
        let (base, cond) = strip_self_condition(
            "+30% Critical Strike Damage when critical strike chance is below 40%",
        );
        assert_eq!(base, "+30% Critical Strike Damage");
        assert_eq!(cond, Some(SelfConditionKey::CritChanceBelow40));
    }

    #[test]
    fn strip_self_condition_life_below_40() {
        let (b1, c1) = strip_self_condition("+20% Movement Speed while below 40% maximum life");
        assert_eq!(b1, "+20% Movement Speed");
        assert_eq!(c1, Some(SelfConditionKey::LifeBelow40));

        let (b2, c2) = strip_self_condition(
            "+10 to Strength when current life is below 40% of maximum life",
        );
        assert_eq!(b2, "+10 to Strength");
        assert_eq!(c2, Some(SelfConditionKey::LifeBelow40));
    }

    #[test]
    fn strip_self_condition_no_match_returns_unchanged() {
        let (base, cond) = strip_self_condition("+5 to Strength");
        assert_eq!(base, "+5 to Strength");
        assert_eq!(cond, None);
    }

    // ---- SelfConditionKey ----

    #[test]
    fn self_condition_key_string_and_label() {
        assert_eq!(SelfConditionKey::CritChanceBelow40.as_str(), "crit_chance_below_40");
        assert_eq!(SelfConditionKey::LifeBelow40.as_str(), "life_below_40");
        assert_eq!(
            SelfConditionKey::CritChanceBelow40.label(),
            "Critical Strike Chance is below 40% (auto)"
        );
        assert_eq!(SELF_CONDITION_KEYS.len(), 2);
    }

    // ---- dispatchers ----

    fn assert_mod(line: &str, key: &str, value: f64) {
        let actual = parse_tree_node_mod(line);
        assert_eq!(
            actual,
            Some(ParsedMod {
                key: key.to_string(),
                value,
                self_condition: None,
            }),
            "input: {line}"
        );
    }

    fn assert_mod_with_cond(line: &str, key: &str, value: f64, cond: SelfConditionKey) {
        let actual = parse_tree_node_mod(line);
        assert_eq!(
            actual,
            Some(ParsedMod {
                key: key.to_string(),
                value,
                self_condition: Some(cond),
            }),
            "input: {line}"
        );
    }

    #[test]
    fn rule_life_and_mana() {
        assert_mod("+10 to Maximum Life", "life", 10.0);
        assert_mod("+250 to Maximum Mana", "mana", 250.0);
        assert_mod("5% Increased Maximum Life", "increased_life", 5.0);
        assert_mod("8% Increased Maximum Mana", "increased_mana", 8.0);
        assert_mod("5% Increased Total Maximum Mana", "increased_mana_more", 5.0);
        assert_mod("12% Increased Mana", "increased_mana", 12.0);
    }

    #[test]
    fn rule_attributes_flat() {
        assert_mod("+5 to Strength", "to_strength", 5.0);
        assert_mod("+5 Strength", "to_strength", 5.0);
        assert_mod("+7 to Dexterity", "to_dexterity", 7.0);
        assert_mod("+7 Dexterity", "to_dexterity", 7.0);
        assert_mod("+10 to Intelligence", "to_intelligence", 10.0);
        assert_mod("+3 to Energy", "to_energy", 3.0);
        assert_mod("+4 to Vitality", "to_vitality", 4.0);
        assert_mod("+2 to Armor", "to_armor", 2.0);
        assert_mod("+8 to All Attributes", "all_attributes", 8.0);
    }

    #[test]
    fn rule_attributes_increased() {
        assert_mod("5% Increased All Attributes", "increased_all_attributes", 5.0);
        assert_mod("10% Increased Strength", "increased_strength", 10.0);
        assert_mod("10% Increased Total Strength", "increased_strength_more", 10.0);
        assert_mod("5% Increased Dexterity", "increased_dexterity", 5.0);
        assert_mod("5% Increased Total Dexterity", "increased_dexterity_more", 5.0);
        assert_mod("3% Increased Intelligence", "increased_intelligence", 3.0);
        assert_mod("4% Increased Energy", "increased_energy", 4.0);
        assert_mod("6% Increased Vitality", "increased_vitality", 6.0);
        assert_mod("2% Increased Armor", "increased_armor", 2.0);
    }

    #[test]
    fn rule_defense_and_speed() {
        assert_mod("+50 to Defense", "defense", 50.0);
        assert_mod("10% Increased Movement Speed", "movement_speed", 10.0);
        assert_mod("10% Increased Total Movement Speed", "movement_speed_more", 10.0);
        assert_mod("15% Increased Attack Speed", "increased_attack_speed", 15.0);
        assert_mod(
            "15% Increased Total Attack Speed",
            "increased_attack_speed_more",
            15.0,
        );
        assert_mod("8% Increased Faster Cast Rate", "faster_cast_rate", 8.0);
        assert_mod(
            "8% Increased Total Faster Cast Rate",
            "faster_cast_rate_more",
            8.0,
        );
        assert_mod("5% Spell Haste", "skill_haste", 5.0);
        assert_mod("5% to Spell Haste", "skill_haste", 5.0);
    }

    #[test]
    fn rule_crit() {
        assert_mod("30% Increased Critical Strike Damage", "crit_damage", 30.0);
        assert_mod(
            "30% Increased Total Critical Strike Damage",
            "crit_damage_more",
            30.0,
        );
        assert_mod("25% Critical Damage", "crit_damage", 25.0);
        assert_mod("3% to Critical Strike Chance", "crit_chance", 3.0);
        assert_mod(
            "5% Chance to Critically Hit with Spells",
            "spell_crit_chance",
            5.0,
        );
    }

    #[test]
    fn rule_signed_negative_values() {
        assert_mod("-10 to Maximum Life", "life", -10.0);
        assert_mod("-5 to Strength", "to_strength", -5.0);
        assert_mod("-3% Increased Mana", "increased_mana", -3.0);
    }

    #[test]
    fn rule_with_self_condition() {
        assert_mod_with_cond(
            "30% Increased Critical Strike Damage when critical strike chance is below 40%",
            "crit_damage",
            30.0,
            SelfConditionKey::CritChanceBelow40,
        );
        assert_mod_with_cond(
            "20% Increased Movement Speed while below 40% maximum life",
            "movement_speed",
            20.0,
            SelfConditionKey::LifeBelow40,
        );
    }

    #[test]
    fn rule_unmatched_returns_none() {
        assert_eq!(parse_tree_node_mod("This is not a known mod line"), None);
        assert_eq!(parse_tree_node_mod(""), None);
        // Wisdom is not in the attribute list — should miss.
        assert_eq!(parse_tree_node_mod("+10 to Wisdom"), None);
    }

    #[test]
    fn dispatcher_caches_negative_results() {
        // Second call should hit the cache. We can't directly observe the cache
        // here, but we can confirm the result is stable across repeats.
        let line = "this will never match anything";
        assert_eq!(parse_tree_node_mod(line), None);
        assert_eq!(parse_tree_node_mod(line), None);
        assert_eq!(parse_tree_node_meta(line), None);
        assert_eq!(parse_tree_node_meta(line), None);
    }

    // ---- ELEMENTS / CONVERSION_TARGET_STATS smoke ----

    #[test]
    fn elements_const_matches_ts() {
        assert_eq!(ELEMENTS, &["arcane", "cold", "fire", "lightning", "poison"]);
    }

    #[test]
    fn conversion_target_stats_has_expected_keys() {
        assert_eq!(
            CONVERSION_TARGET_STATS.get("magic skill damage").copied(),
            Some("magic_skill_damage")
        );
        assert_eq!(
            CONVERSION_TARGET_STATS.get("ranged physical damage").copied(),
            Some("ranged_physical_per_500_mana")
        );
        assert_eq!(CONVERSION_TARGET_STATS.get("unknown stat"), None);
    }

    // ---- element-parameterized rules ----

    #[test]
    fn rule_element_resistances() {
        assert_mod("+30% to Fire Resistance", "fire_resistance", 30.0);
        assert_mod("+25% to Cold Resistance", "cold_resistance", 25.0);
        assert_mod("+40% to Lightning Resistance", "lightning_resistance", 40.0);
        assert_mod("+15% to Poison Resistance", "poison_resistance", 15.0);
        assert_mod("+20% to Arcane Resistance", "arcane_resistance", 20.0);
        assert_mod("+5% to Maximum Fire Resistance", "max_fire_resistance", 5.0);
        assert_mod("+3% to Cold Absorb", "cold_absorption", 3.0);
    }

    #[test]
    fn rule_element_skill_damage() {
        assert_mod("30% Increased Fire Skill Damage", "fire_skill_damage", 30.0);
        assert_mod(
            "30% Increased Total Fire Skill Damage",
            "fire_skill_damage_more",
            30.0,
        );
        assert_mod("25% Increased Lightning Skill Damage", "lightning_skill_damage", 25.0);
        assert_mod("+5 to Fire Skill Damage", "flat_fire_skill_damage", 5.0);
        assert_mod("+3 to Cold Skill Damage", "flat_cold_skill_damage", 3.0);
    }

    #[test]
    fn rule_to_element_skills_flat() {
        assert_mod("+2 to Fire Skills", "fire_skills", 2.0);
        assert_mod("+3 to Cold Skills", "cold_skills", 3.0);
        assert_mod("+1 to Arcane Skills", "arcane_skills", 1.0);
    }

    #[test]
    fn rule_all_resistances_variants() {
        assert_mod("+15% All Resistances", "all_resistances", 15.0);
        assert_mod("+15% to All Resistances", "all_resistances", 15.0);
        assert_mod("+20 to All Resistances", "all_resistances", 20.0);
        assert_mod("+20 to Total All Resistances", "all_resistances_more", 20.0);
        assert_mod("+20% to Total All Resistances", "all_resistances_more", 20.0);
        assert_mod("+5% to Maximum All Resistances", "max_all_resistances", 5.0);
    }

    // ---- null/fixed/cond rules ----

    #[test]
    fn null_rule_explicitly_rejects_socketable_slot() {
        // TS returns null → dispatcher aborts and caches None.
        assert_eq!(parse_tree_node_mod("1 Socketable Slot"), None);
    }

    #[test]
    fn null_rule_path_to_black_hole_and_resistances_to_life() {
        assert_eq!(parse_tree_node_mod("Path to any Black Hole"), None);
        assert_eq!(parse_tree_node_mod("+0 Path to any Black Hole"), None);
        // Resistances → Life appears in BOTH RULES (null) and CONVERSION_RULES (meta).
        // parse_tree_node_mod aborts due to null rule. parse_tree_node_meta succeeds.
        assert_eq!(parse_tree_node_mod("50% of Resistances converted to Life"), None);
        let meta = parse_tree_node_meta("50% of Resistances converted to Life");
        assert!(matches!(meta, Some(ParsedMeta::Convert(_))));
    }

    #[test]
    fn fixed_rule_flag_like_mods() {
        assert_mod(
            "You can now dual wield Two Handed Melee Weapons",
            "dual_wield_2h_melee",
            1.0,
        );
        assert_mod(
            "You can no longer dodge monster attacks but also cannot be stunned or frozen",
            "force_field_protection",
            1.0,
        );
        assert_mod(
            "Your skill weapon type restrictions are removed",
            "skill_restrictions_removed",
            1.0,
        );
    }

    #[test]
    fn cond_rule_baked_in_self_condition() {
        // The cond_rule! macro sets self_condition in the build closure itself,
        // which the dispatcher preserves alongside the stripped outer condition.
        assert_mod_with_cond(
            "30% Increased Ranged Projectile Damage when Critical Strike Chance is below 40%",
            "ranged_projectile_damage",
            30.0,
            SelfConditionKey::CritChanceBelow40,
        );
        assert_mod_with_cond(
            "25% Increased Physical Damage while below 40% Maximum Life",
            "enhanced_damage",
            25.0,
            SelfConditionKey::LifeBelow40,
        );
    }

    // ---- meta dispatcher (CONVERSION_RULES + DISABLE_RULES) ----

    fn assert_convert(
        line: &str,
        from_key: &str,
        from_kind: ConvertKind,
        to_key: &str,
        to_kind: ConvertKind,
        pct: f64,
    ) {
        match parse_tree_node_meta(line) {
            Some(ParsedMeta::Convert(c)) => {
                assert_eq!(c.from_key, from_key, "from_key mismatch on: {line}");
                assert_eq!(c.from_kind, from_kind, "from_kind mismatch on: {line}");
                assert_eq!(c.to_key, to_key, "to_key mismatch on: {line}");
                assert_eq!(c.to_kind, to_kind, "to_kind mismatch on: {line}");
                assert_eq!(c.pct, pct, "pct mismatch on: {line}");
            }
            other => panic!("expected Convert, got {other:?} for: {line}"),
        }
    }

    #[test]
    fn meta_attribute_to_stat_conversion() {
        assert_convert(
            "10% of Strength converted to maximum life",
            "strength",
            ConvertKind::Attribute,
            "life",
            ConvertKind::Stat,
            10.0,
        );
        assert_convert(
            "5% of Dexterity is added as attack damage",
            "dexterity",
            ConvertKind::Attribute,
            "attack_damage",
            ConvertKind::Stat,
            5.0,
        );
    }

    #[test]
    fn meta_element_conversion() {
        assert_convert(
            "20% of your Fire Resistance is converted to Increased Fire Skill Damage",
            "fire_resistance",
            ConvertKind::Stat,
            "fire_skill_damage",
            ConvertKind::Stat,
            20.0,
        );
        assert_convert(
            "30% of Physical Damage converted to fire",
            "additive_physical_damage",
            ConvertKind::Stat,
            "physical_to_fire",
            ConvertKind::Stat,
            30.0,
        );
    }

    #[test]
    fn meta_weapon_specific_enhanced_damage() {
        assert_convert(
            "50% to Enhanced Damage when using Bow",
            "enhanced_damage",
            ConvertKind::Stat,
            "damage_with_bow",
            ConvertKind::Stat,
            50.0,
        );
        assert_convert(
            "40% to Enhanced Damage when using Axe",
            "enhanced_damage",
            ConvertKind::Stat,
            "damage_with_axe",
            ConvertKind::Stat,
            40.0,
        );
    }

    #[test]
    fn meta_unsupported_attribute_target_returns_none() {
        // Attribute-conversion rule with target outside CONVERSION_TARGET_STATS
        // returns None from build → dispatcher skips that rule.
        assert_eq!(
            parse_tree_node_meta("10% of Strength converted to Made Up Stat"),
            None
        );
    }

    #[test]
    fn meta_disable_life_replenish() {
        match parse_tree_node_meta("You cannot regenerate life from life replenish anymore") {
            Some(ParsedMeta::Disable(d)) => {
                assert_eq!(d.target, DisableTarget::LifeReplenish);
            }
            other => panic!("expected Disable, got {other:?}"),
        }
    }

    #[test]
    fn meta_unmatched_returns_none() {
        assert_eq!(parse_tree_node_meta("Random text that matches no meta rule"), None);
        assert_eq!(parse_tree_node_meta(""), None);
    }
}
