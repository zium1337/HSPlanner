#![allow(unexpected_cfgs)]

use std::collections::HashMap;

pub type Ranged = (f64, f64);
pub type StatMap = HashMap<String, Ranged>;
pub type AttrMap = HashMap<String, Ranged>;
pub type ConditionMap = HashMap<String, bool>;
pub type ResistMap = HashMap<String, f64>;
pub type ItemSkillBonuses = HashMap<String, (f64, f64)>;
pub type SkillRanks = HashMap<String, f64>;

const ELEMENTS: [&str; 5] = ["fire", "cold", "lightning", "poison", "arcane"];

const EXTRA_DAMAGE_CONDITIONS: &[(&str, &str, &str)] = &[
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
pub struct DamageFormula { pub base: f64, pub per_level: f64 }

#[derive(Debug, Clone, Copy)]
pub struct DamageRow { pub min: f64, pub max: f64 }

#[derive(Debug, Clone)]
pub enum BonusSource {
    AttributePoint { source: String, value: f64 },
    SkillLevel     { source: String, value: f64 },
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
pub struct Weapon { pub name: String, pub damage_min: f64, pub damage_max: f64 }

#[derive(Debug, Clone)]
pub struct ExtraSource { pub label: &'static str, pub pct: f64 }

#[derive(Debug, Clone, Default)]
pub struct SkillDamageBreakdown {
    pub effective_rank_min: f64, pub effective_rank_max: f64,
    pub base_min: f64, pub base_max: f64,
    pub flat_min: f64, pub flat_max: f64,
    pub synergy_min_pct: f64, pub synergy_max_pct: f64,
    pub skill_damage_min_pct: f64, pub skill_damage_max_pct: f64,
    pub extra_damage_pct: f64,
    pub extra_damage_sources: Vec<ExtraSource>,
    pub crit_chance: f64, pub crit_damage_pct: f64, pub crit_multiplier_avg: f64,
    pub multicast_chance_pct: f64, pub multicast_multiplier: f64,
    pub projectile_count: u32,
    pub elemental_break_pct: f64, pub elemental_break_multiplier: f64,
    pub enemy_resistance_pct: f64,
    pub resistance_ignored_pct: f64,
    pub effective_resistance_pct: f64,
    pub resistance_multiplier: f64,
    pub hit_min: i64,  pub hit_max: i64,
    pub crit_min: i64, pub crit_max: i64,
    pub final_min: i64, pub final_max: i64,
    pub avg_min: i64,  pub avg_max: i64,
}

#[derive(Debug, Clone, Default)]
pub struct WeaponDamageBreakdown {
    pub has_weapon: bool,
    pub weapon_name: Option<String>,
    pub weapon_damage_min: f64, pub weapon_damage_max: f64,
    pub enhanced_damage_min_pct: f64, pub enhanced_damage_max_pct: f64,
    pub additive_physical_min: f64, pub additive_physical_max: f64,
    pub attack_damage_min_pct: f64, pub attack_damage_max_pct: f64,
    pub extra_damage_pct: f64,
    pub extra_damage_sources: Vec<ExtraSource>,
    pub crit_chance: f64, pub crit_damage_pct: f64, pub crit_multiplier_avg: f64,
    pub attacks_per_second_min: f64, pub attacks_per_second_max: f64,
    pub hit_min: i64,  pub hit_max: i64,
    pub crit_min: i64, pub crit_max: i64,
    pub avg_min: i64,  pub avg_max: i64,
    pub dps_min: i64,  pub dps_max: i64,
}

#[inline] fn rg(map: &HashMap<String, Ranged>, k: &str) -> Ranged {
    *map.get(k).unwrap_or(&(0.0, 0.0))
}
#[inline] fn r_min(v: Ranged) -> f64 { v.0 }
#[inline] fn r_max(v: Ranged) -> f64 { v.1 }

struct ElementKeys {
    skills: &'static str,
    skill_damage: &'static str,
    skill_damage_more: &'static str,
    flat_skill_damage: &'static str,
    ignore_res: &'static str,
}

const ELEMENT_KEYS: &[(&str, ElementKeys)] = &[
    ("fire", ElementKeys {
        skills: "fire_skills",
        skill_damage: "fire_skill_damage",
        skill_damage_more: "fire_skill_damage_more",
        flat_skill_damage: "flat_fire_skill_damage",
        ignore_res: "ignore_fire_res",
    }),
    ("cold", ElementKeys {
        skills: "cold_skills",
        skill_damage: "cold_skill_damage",
        skill_damage_more: "cold_skill_damage_more",
        flat_skill_damage: "flat_cold_skill_damage",
        ignore_res: "ignore_cold_res",
    }),
    ("lightning", ElementKeys {
        skills: "lightning_skills",
        skill_damage: "lightning_skill_damage",
        skill_damage_more: "lightning_skill_damage_more",
        flat_skill_damage: "flat_lightning_skill_damage",
        ignore_res: "ignore_lightning_res",
    }),
    ("poison", ElementKeys {
        skills: "poison_skills",
        skill_damage: "poison_skill_damage",
        skill_damage_more: "poison_skill_damage_more",
        flat_skill_damage: "flat_poison_skill_damage",
        ignore_res: "ignore_poison_res",
    }),
    ("arcane", ElementKeys {
        skills: "arcane_skills",
        skill_damage: "arcane_skill_damage",
        skill_damage_more: "arcane_skill_damage_more",
        flat_skill_damage: "flat_arcane_skill_damage",
        ignore_res: "ignore_arcane_res",
    }),
    ("physical", ElementKeys {
        skills: "physical_skills",
        skill_damage: "physical_skill_damage",
        skill_damage_more: "physical_skill_damage_more",
        flat_skill_damage: "flat_physical_skill_damage",
        ignore_res: "ignore_physical_res",
    }),
    ("magic", ElementKeys {
        skills: "magic_skills",
        skill_damage: "magic_skill_damage",
        skill_damage_more: "magic_skill_damage_more",
        flat_skill_damage: "flat_magic_skill_damage",
        ignore_res: "ignore_magic_res",
    }),
    ("explosion", ElementKeys {
        skills: "explosion_skills",
        skill_damage: "explosion_skill_damage",
        skill_damage_more: "explosion_skill_damage_more",
        flat_skill_damage: "flat_explosion_skill_damage",
        ignore_res: "ignore_explosion_res",
    }),
];

fn element_keys(damage_type: &str) -> Option<&'static ElementKeys> {
    ELEMENT_KEYS.iter().find(|(k, _)| *k == damage_type).map(|(_, v)| v)
}

fn collect_extra_damage(
    stats: &StatMap,
    enemy_conditions: &ConditionMap,
) -> (f64, Vec<ExtraSource>) {
    let mut sources: Vec<ExtraSource> = Vec::new();
    let mut total = 0.0;
    let mut any_ailment = false;
    for (stat_key, cond, label) in EXTRA_DAMAGE_CONDITIONS {
        if !*enemy_conditions.get(*cond).unwrap_or(&false) { continue }
        any_ailment = true;
        let v = rg(stats, stat_key);
        let avg = (r_min(v) + r_max(v)) * 0.5;
        if avg == 0.0 { continue }
        sources.push(ExtraSource { label, pct: avg });
        total += avg;
    }
    if any_ailment {
        let v = rg(stats, "extra_damage_ailments");
        let avg = (r_min(v) + r_max(v)) * 0.5;
        if avg != 0.0 {
            sources.push(ExtraSource { label: "Afflicted with Ailments", pct: avg });
            total += avg;
        }
    }
    (total, sources)
}

struct CritFactors {
    chance: f64,
    damage_pct: f64,
    on_crit_mult: f64,
    avg_mult: f64,
}

fn crit_factors(stats: &StatMap, is_spell: bool) -> CritFactors {
    let chance = r_max(rg(stats, if is_spell { "spell_crit_chance" } else { "crit_chance" }));
    let damage_pct = r_max(rg(stats, if is_spell { "spell_crit_damage" } else { "crit_damage" }));
    let damage_more = if is_spell { 0.0 } else { r_max(rg(stats, "crit_damage_more")) };
    let on_crit_mult = (1.0 + damage_pct / 100.0) * (1.0 + damage_more / 100.0);
    let clamped = chance.clamp(0.0, 95.0) / 100.0;
    let avg_mult = 1.0 - clamped + clamped * on_crit_mult;
    CritFactors { chance, damage_pct, on_crit_mult, avg_mult }
}

pub struct SkillInput<'a> {
    pub skill: &'a Skill,
    pub allocated_rank: f64,
    pub attributes: &'a AttrMap,
    pub stats: &'a StatMap,
    pub skill_ranks_by_name: &'a SkillRanks,
    pub item_skill_bonuses: &'a ItemSkillBonuses,
    pub enemy_conditions: &'a ConditionMap,
    pub enemy_resistances: &'a ResistMap,
    pub skills_by_name: &'a HashMap<String, Skill>,
    pub projectile_count: u32,
}

pub fn compute_skill_damage(input: &SkillInput<'_>) -> Option<SkillDamageBreakdown> {
    let s = input.skill;
    if input.allocated_rank == 0.0 { return None }
    let has_formula = s.damage_formula.is_some();
    let has_table = s.damage_per_rank.as_ref().is_some_and(|t| !t.is_empty());
    if !has_formula && !has_table { return None }

    let keys = s.damage_type.as_deref().and_then(element_keys);

    let all_skills = rg(input.stats, "all_skills");
    let (elem_min, elem_max) = match keys {
        Some(k) => { let e = rg(input.stats, k.skills); (r_min(e), r_max(e)) }
        None => (0.0, 0.0),
    };

    let item = input.item_skill_bonuses
        .get(&s.name)
        .copied()
        .unwrap_or((0.0, 0.0));
    let eff_min = input.allocated_rank + r_min(all_skills) + elem_min + item.0;
    let eff_max = input.allocated_rank + r_max(all_skills) + elem_max + item.1;

    let (base_min, base_max) = if let Some(f) = &s.damage_formula {
        (f.base + f.per_level * eff_min, f.base + f.per_level * eff_max)
    } else {
        let t = s.damage_per_rank.as_ref().unwrap();
        let n = t.len() as i64;
        let i_min = ((eff_min as i64).max(1).min(n) - 1) as usize;
        let i_max = ((eff_max as i64).max(1).min(n) - 1) as usize;
        (t[i_min].min, t[i_max].max)
    };

    let mut flat_min = 0.0;
    let mut flat_max = 0.0;
    for k in ["flat_skill_damage", "flat_elemental_skill_damage"] {
        let v = rg(input.stats, k);
        flat_min += r_min(v); flat_max += r_max(v);
    }
    if let Some(k) = keys {
        let v = rg(input.stats, k.flat_skill_damage);
        flat_min += r_min(v); flat_max += r_max(v);
    }

    let mut synergy_min = 0.0;
    let mut synergy_max = 0.0;
    for bs in &s.bonus_sources {
        match bs {
            BonusSource::AttributePoint { source, value } => {
                let v = input.attributes.get(source).copied().unwrap_or((0.0, 0.0));
                synergy_min += r_min(v) * value;
                synergy_max += r_max(v) * value;
            }
            BonusSource::SkillLevel { source, value } => {
                let br = *input.skill_ranks_by_name.get(source).unwrap_or(&0.0);
                if br <= 0.0 { continue }
                if let Some(s2) = input.skills_by_name.get(source) {
                    let all = rg(input.stats, "all_skills");
                    let (el_min, el_max) = match s2.damage_type.as_deref().and_then(element_keys) {
                        Some(k) => { let e = rg(input.stats, k.skills); (r_min(e), r_max(e)) }
                        None => (0.0, 0.0),
                    };
                    let it = input.item_skill_bonuses.get(source).copied().unwrap_or((0.0, 0.0));
                    synergy_min += (br + r_min(all) + el_min + it.0) * value;
                    synergy_max += (br + r_max(all) + el_max + it.1) * value;
                } else {
                    synergy_min += br * value;
                    synergy_max += br * value;
                }
            }
        }
    }

    let magic = rg(input.stats, "magic_skill_damage");
    let elem = keys.map(|k| rg(input.stats, k.skill_damage)).unwrap_or((0.0, 0.0));
    let skill_dmg_min = r_min(magic) + r_min(elem);
    let skill_dmg_max = r_max(magic) + r_max(elem);

    let magic_more = rg(input.stats, "magic_skill_damage_more");
    let elem_more = keys.map(|k| rg(input.stats, k.skill_damage_more)).unwrap_or((0.0, 0.0));
    let skill_more_min = (1.0 + r_min(magic_more) / 100.0) * (1.0 + r_min(elem_more) / 100.0);
    let skill_more_max = (1.0 + r_max(magic_more) / 100.0) * (1.0 + r_max(elem_more) / 100.0);

    let (extra_pct, extra_sources) = collect_extra_damage(input.stats, input.enemy_conditions);
    let extra_mult = 1.0 + extra_pct / 100.0;

    let is_spell = s.tags.iter().any(|t| t == "Spell");
    let crit = crit_factors(input.stats, is_spell);

    let enemy_res_pct = s.damage_type.as_deref()
        .and_then(|dt| input.enemy_resistances.get(dt).copied())
        .unwrap_or(0.0);
    let raw_ignore = keys.map(|k| r_max(rg(input.stats, k.ignore_res))).unwrap_or(0.0);
    let ignore_res_pct = raw_ignore.clamp(0.0, 100.0);
    let eff_res_pct = enemy_res_pct * (1.0 - ignore_res_pct / 100.0);
    let resistance_mult = 1.0 - eff_res_pct / 100.0;

    let is_elemental = s.damage_type.as_deref().is_some_and(|dt| ELEMENTS.contains(&dt));
    let elemental_break_pct = if is_elemental {
        let base = r_max(rg(input.stats, "elemental_break"));
        let on   = if is_spell { r_max(rg(input.stats, "elemental_break_on_spell")) }
                   else        { r_max(rg(input.stats, "elemental_break_on_strike")) };
        (base + on).max(0.0)
    } else { 0.0 };
    let elemental_break_mult = 1.0 + elemental_break_pct / 100.0;

    let lightning_break_pct = if s.damage_type.as_deref() == Some("lightning")
        && *input.enemy_conditions.get("lightning_break").unwrap_or(&false) {
        r_max(rg(input.stats, "lightning_break")).max(0.0)
    } else { 0.0 };
    let lightning_break_mult = 1.0 + lightning_break_pct / 100.0;

    let hit_min = (base_min + flat_min)
        * (1.0 + synergy_min / 100.0)
        * (1.0 + skill_dmg_min / 100.0)
        * skill_more_min * extra_mult
        * elemental_break_mult * lightning_break_mult * resistance_mult;
    let hit_max = (base_max + flat_max)
        * (1.0 + synergy_max / 100.0)
        * (1.0 + skill_dmg_max / 100.0)
        * skill_more_max * extra_mult
        * elemental_break_mult * lightning_break_mult * resistance_mult;

    let crit_min_f = hit_min * crit.on_crit_mult;
    let crit_max_f = hit_max * crit.on_crit_mult;
    let multicast_chance = if is_spell { r_max(rg(input.stats, "multicast_chance")).max(0.0) } else { 0.0 };
    let multicast_mult = 1.0 + multicast_chance / 100.0;
    let projectiles = input.projectile_count.max(1);
    let avg_min_f = hit_min * crit.avg_mult * multicast_mult * projectiles as f64;
    let avg_max_f = hit_max * crit.avg_mult * multicast_mult * projectiles as f64;

    Some(SkillDamageBreakdown {
        effective_rank_min: eff_min, effective_rank_max: eff_max,
        base_min, base_max, flat_min, flat_max,
        synergy_min_pct: synergy_min, synergy_max_pct: synergy_max,
        skill_damage_min_pct: skill_dmg_min, skill_damage_max_pct: skill_dmg_max,
        extra_damage_pct: extra_pct, extra_damage_sources: extra_sources,
        crit_chance: crit.chance, crit_damage_pct: crit.damage_pct,
        crit_multiplier_avg: crit.avg_mult,
        multicast_chance_pct: multicast_chance, multicast_multiplier: multicast_mult,
        projectile_count: projectiles,
        elemental_break_pct, elemental_break_multiplier: elemental_break_mult,
        enemy_resistance_pct: enemy_res_pct,
        resistance_ignored_pct: ignore_res_pct,
        effective_resistance_pct: eff_res_pct,
        resistance_multiplier: resistance_mult,
        hit_min: hit_min.floor() as i64, hit_max: hit_max.floor() as i64,
        crit_min: crit_min_f.floor() as i64, crit_max: crit_max_f.floor() as i64,
        final_min: hit_min.floor() as i64, final_max: hit_max.floor() as i64,
        avg_min: avg_min_f.floor() as i64, avg_max: avg_max_f.floor() as i64,
    })
}

pub fn compute_weapon_damage(
    weapon: Option<&Weapon>,
    stats: &StatMap,
    enemy_conditions: &ConditionMap,
) -> WeaponDamageBreakdown {
    let has_weapon = weapon.is_some();
    let (w_min, w_max) = weapon.map(|w| (w.damage_min, w.damage_max)).unwrap_or((0.0, 0.0));

    let ed = rg(stats, "enhanced_damage");
    let ed_more = rg(stats, "enhanced_damage_more");
    let add_phys = rg(stats, "additive_physical_damage");
    let atk = rg(stats, "attack_damage");

    let (extra_pct, extra_sources) = collect_extra_damage(stats, enemy_conditions);
    let extra_mult = 1.0 + extra_pct / 100.0;

    let crit = crit_factors(stats, false);

    let base_min = w_min * (1.0 + r_min(ed) / 100.0) * (1.0 + r_min(ed_more) / 100.0) + r_min(add_phys);
    let base_max = w_max * (1.0 + r_max(ed) / 100.0) * (1.0 + r_max(ed_more) / 100.0) + r_max(add_phys);
    let hit_min = base_min * (1.0 + r_min(atk) / 100.0) * extra_mult;
    let hit_max = base_max * (1.0 + r_max(atk) / 100.0) * extra_mult;
    let crit_min = hit_min * crit.on_crit_mult;
    let crit_max = hit_max * crit.on_crit_mult;
    let avg_min = hit_min * crit.avg_mult;
    let avg_max = hit_max * crit.avg_mult;

    let ias = rg(stats, "increased_attack_speed");
    let ias_more = rg(stats, "increased_attack_speed_more");
    let base_aps = r_max(rg(stats, "attacks_per_second"));
    let aps_min = base_aps * (1.0 + r_min(ias) / 100.0) * (1.0 + r_min(ias_more) / 100.0);
    let aps_max = base_aps * (1.0 + r_max(ias) / 100.0) * (1.0 + r_max(ias_more) / 100.0);

    WeaponDamageBreakdown {
        has_weapon,
        weapon_name: weapon.map(|w| w.name.clone()),
        weapon_damage_min: w_min, weapon_damage_max: w_max,
        enhanced_damage_min_pct: r_min(ed), enhanced_damage_max_pct: r_max(ed),
        additive_physical_min: r_min(add_phys), additive_physical_max: r_max(add_phys),
        attack_damage_min_pct: r_min(atk), attack_damage_max_pct: r_max(atk),
        extra_damage_pct: extra_pct, extra_damage_sources: extra_sources,
        crit_chance: crit.chance, crit_damage_pct: crit.damage_pct,
        crit_multiplier_avg: crit.avg_mult,
        attacks_per_second_min: aps_min, attacks_per_second_max: aps_max,
        hit_min: hit_min.floor() as i64,  hit_max: hit_max.floor() as i64,
        crit_min: crit_min.floor() as i64, crit_max: crit_max.floor() as i64,
        avg_min: avg_min.floor() as i64,  avg_max: avg_max.floor() as i64,
        dps_min: (avg_min * aps_min).floor() as i64,
        dps_max: (avg_max * aps_max).floor() as i64,
    }
}

#[cfg(damage_standalone)]
fn main() {
    use std::hint::black_box;
    use std::time::Instant;

    let mut stats: StatMap = HashMap::new();
    stats.insert("crit_chance".into(),              (30.0, 30.0));
    stats.insert("crit_damage".into(),              (100.0, 100.0));
    stats.insert("magic_skill_damage".into(),       (20.0, 40.0));
    stats.insert("fire_skill_damage".into(),        (50.0, 50.0));
    stats.insert("enhanced_damage".into(),          (100.0, 200.0));
    stats.insert("additive_physical_damage".into(), (5.0, 10.0));
    stats.insert("increased_attack_speed".into(),   (25.0, 25.0));
    stats.insert("attacks_per_second".into(),       (1.4, 1.4));

    let attributes: AttrMap = HashMap::new();
    let mut enemy_conditions: ConditionMap = HashMap::new();
    enemy_conditions.insert("burning".into(), true);
    let mut enemy_resistances: ResistMap = HashMap::new();
    enemy_resistances.insert("fire".into(), 50.0);

    let skill = Skill {
        name: "fireball".into(),
        tags: vec!["Spell".into()],
        damage_type: Some("fire".into()),
        damage_formula: Some(DamageFormula { base: 10.0, per_level: 4.0 }),
        damage_per_rank: None,
        bonus_sources: vec![],
    };
    let weapon = Weapon { name: "Test Sword".into(), damage_min: 12.0, damage_max: 30.0 };

    let skill_ranks: SkillRanks = HashMap::new();
    let item_bonuses: ItemSkillBonuses = HashMap::new();
    let skills_by_name: HashMap<String, Skill> = HashMap::new();

    let input = SkillInput {
        skill: &skill,
        allocated_rank: 10.0,
        attributes: &attributes,
        stats: &stats,
        skill_ranks_by_name: &skill_ranks,
        item_skill_bonuses: &item_bonuses,
        enemy_conditions: &enemy_conditions,
        enemy_resistances: &enemy_resistances,
        skills_by_name: &skills_by_name,
        projectile_count: 1,
    };

    let sd = compute_skill_damage(&input).expect("skill damage");
    let wd = compute_weapon_damage(Some(&weapon), &stats, &enemy_conditions);

    println!("Skill  ({}): hit {}..{} | avg {}..{} | crit {}..{}",
        skill.name, sd.hit_min, sd.hit_max, sd.avg_min, sd.avg_max, sd.crit_min, sd.crit_max);
    println!("Weapon ({}): hit {}..{} | crit {}..{} | dps {}..{} | aps {:.2}..{:.2}",
        wd.weapon_name.as_deref().unwrap_or("-"),
        wd.hit_min, wd.hit_max, wd.crit_min, wd.crit_max,
        wd.dps_min, wd.dps_max, wd.attacks_per_second_min, wd.attacks_per_second_max);

    let iters: u64 = 1_000_000;
    let t = Instant::now();
    let mut sink: i64 = 0;
    for _ in 0..iters {
        let r = compute_skill_damage(black_box(&input)).unwrap();
        sink = sink.wrapping_add(black_box(r.hit_min));
        let w = compute_weapon_damage(Some(black_box(&weapon)), &stats, &enemy_conditions);
        sink = sink.wrapping_add(black_box(w.dps_max));
    }
    let elapsed = t.elapsed();
    let per_ns = elapsed.as_nanos() as f64 / iters as f64;
    println!("\nBench: {iters} × (skill + weapon) in {:.2?}  =>  {:.0} ns / pair  (sink {sink})",
        elapsed, per_ns);
}
