use std::collections::HashMap;

pub mod damage;
pub mod weapon;

pub use damage::{SkillInput, compute_skill_damage};
pub use weapon::compute_weapon_damage;

pub type Ranged = (f64, f64);
pub type StatMap = HashMap<String, Ranged>;
pub type AttrMap = HashMap<String, Ranged>;
pub type ConditionMap = HashMap<String, bool>;
pub type ResistMap = HashMap<String, f64>;
pub type ItemSkillBonuses = HashMap<String, (f64, f64)>;
pub type SkillRanks = HashMap<String, f64>;

pub const ELEMENTS: [&str; 5] = ["fire", "cold", "lightning", "poison", "arcane"];

pub const EXTRA_DAMAGE_CONDITIONS: &[(&str, &str, &str)] = &[
    ("extra_damage_stunned",        "stunned",        "Stunned"),
    ("extra_damage_bleeding",       "bleeding",       "Bleeding"),
    ("extra_damage_frozen",         "frozen",         "Frozen"),
    ("extra_damage_poisoned",       "poisoned",       "Poisoned"),
    ("extra_damage_burning",        "burning",        "Burning"),
    ("extra_damage_stasis",         "stasis",         "Stasis"),
    ("extra_damage_shadow_burning", "shadow_burning", "Shadow Burning"),
    ("extra_damage_frost_bitten",   "frost_bitten",   "Frost Bitten"),
];

#[derive(Debug, Clone)]
pub struct DamageFormula {
    pub base: f64,
    pub per_level: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct DamageRow {
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone)]
pub enum BonusSource {
    AttributePoint { source: String, value: f64 },
    SkillLevel { source: String, value: f64 },
}

#[derive(Debug, Clone)]
pub struct Skill {
    pub name: String,
    pub tags: Vec<String>,
    pub damage_type: Option<String>,
    pub damage_formula: Option<DamageFormula>,
    pub damage_per_rank: Option<Vec<DamageRow>>,
    pub bonus_sources: Vec<BonusSource>,
}

#[derive(Debug, Clone, Default)]
pub struct Weapon {
    pub name: String,
    pub damage_min: f64,
    pub damage_max: f64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ExtraSource {
    pub label: &'static str,
    pub pct: f64,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDamageBreakdown {
    pub effective_rank_min: f64,
    pub effective_rank_max: f64,
    pub base_min: f64,
    pub base_max: f64,
    pub flat_min: f64,
    pub flat_max: f64,
    pub synergy_min_pct: f64,
    pub synergy_max_pct: f64,
    pub skill_damage_min_pct: f64,
    pub skill_damage_max_pct: f64,
    pub extra_damage_pct: f64,
    pub extra_damage_sources: Vec<ExtraSource>,
    pub crit_chance: f64,
    pub crit_damage_pct: f64,
    pub crit_multiplier_avg: f64,
    pub multicast_chance_pct: f64,
    pub multicast_multiplier: f64,
    pub projectile_count: u32,
    pub elemental_break_pct: f64,
    pub elemental_break_multiplier: f64,
    pub enemy_resistance_pct: f64,
    pub resistance_ignored_pct: f64,
    pub effective_resistance_pct: f64,
    pub resistance_multiplier: f64,
    pub hit_min: i64,
    pub hit_max: i64,
    pub crit_min: i64,
    pub crit_max: i64,
    pub final_min: i64,
    pub final_max: i64,
    pub avg_min: i64,
    pub avg_max: i64,
}

#[derive(Debug, Clone, Default)]
pub struct WeaponDamageBreakdown {
    pub has_weapon: bool,
    pub weapon_name: Option<String>,
    pub weapon_damage_min: f64,
    pub weapon_damage_max: f64,
    pub enhanced_damage_min_pct: f64,
    pub enhanced_damage_max_pct: f64,
    pub additive_physical_min: f64,
    pub additive_physical_max: f64,
    pub attack_damage_min_pct: f64,
    pub attack_damage_max_pct: f64,
    pub extra_damage_pct: f64,
    pub extra_damage_sources: Vec<ExtraSource>,
    pub crit_chance: f64,
    pub crit_damage_pct: f64,
    pub crit_multiplier_avg: f64,
    pub attacks_per_second_min: f64,
    pub attacks_per_second_max: f64,
    pub hit_min: i64,
    pub hit_max: i64,
    pub crit_min: i64,
    pub crit_max: i64,
    pub avg_min: i64,
    pub avg_max: i64,
    pub dps_min: i64,
    pub dps_max: i64,
}

#[inline]
pub fn rg(map: &HashMap<String, Ranged>, k: &str) -> Ranged {
    *map.get(k).unwrap_or(&(0.0, 0.0))
}

#[inline]
pub fn r_min(v: Ranged) -> f64 {
    v.0
}

#[inline]
pub fn r_max(v: Ranged) -> f64 {
    v.1
}

pub(crate) fn collect_extra_damage(
    stats: &StatMap,
    enemy_conditions: &ConditionMap,
) -> (f64, Vec<ExtraSource>) {
    let mut sources: Vec<ExtraSource> = Vec::new();
    let mut total = 0.0;
    let mut any_ailment = false;
    for (stat_key, cond, label) in EXTRA_DAMAGE_CONDITIONS {
        if !*enemy_conditions.get(*cond).unwrap_or(&false) {
            continue;
        }
        any_ailment = true;
        let v = rg(stats, stat_key);
        let avg = (r_min(v) + r_max(v)) * 0.5;
        if avg == 0.0 {
            continue;
        }
        sources.push(ExtraSource { label, pct: avg });
        total += avg;
    }
    if any_ailment {
        let v = rg(stats, "extra_damage_ailments");
        let avg = (r_min(v) + r_max(v)) * 0.5;
        if avg != 0.0 {
            sources.push(ExtraSource {
                label: "Afflicted with Ailments",
                pct: avg,
            });
            total += avg;
        }
    }
    (total, sources)
}

pub(crate) struct CritFactors {
    pub chance: f64,
    pub damage_pct: f64,
    pub on_crit_mult: f64,
    pub avg_mult: f64,
}

pub(crate) fn crit_factors(stats: &StatMap, is_spell: bool) -> CritFactors {
    let chance = r_max(rg(
        stats,
        if is_spell { "spell_crit_chance" } else { "crit_chance" },
    ));
    let damage_pct = r_max(rg(
        stats,
        if is_spell { "spell_crit_damage" } else { "crit_damage" },
    ));
    let damage_more = if is_spell {
        0.0
    } else {
        r_max(rg(stats, "crit_damage_more"))
    };
    let on_crit_mult = (1.0 + damage_pct / 100.0) * (1.0 + damage_more / 100.0);
    let clamped = chance.clamp(0.0, 95.0) / 100.0;
    let avg_mult = 1.0 - clamped + clamped * on_crit_mult;
    CritFactors {
        chance,
        damage_pct,
        on_crit_mult,
        avg_mult,
    }
}
