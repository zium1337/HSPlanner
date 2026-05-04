import { useMemo } from "react";
import Logo from "./Logo";
import { gameConfig, getClass, getSkillsByClass } from "../data";
import { isImageUrl } from "../utils/icon";
import { attrPointsFor, skillPointsFor, useBuild } from "../store/build";
import {
  aggregateItemSkillBonuses,
  combineAdditiveAndMore,
  computeBuildStats,
  computeSkillDamage,
  effectiveCap,
  formatValue,
  isZero,
  manaCostAtRank,
  normalizeSkillName,
  rangedMax,
  rangedMin,
  statDef,
} from "../utils/stats";
import type { RangedValue } from "../types";

const ATTRIBUTE_ORDER: string[] = [
  "strength",
  "dexterity",
  "intelligence",
  "energy",
  "vitality",
  "armor",
];

const OFFENSE_KEYS = [
  "enhanced_damage",
  "attack_damage",
  "increased_attack_speed",
  "faster_cast_rate",
  "crit_chance",
  "crit_damage",
  "life_steal",
  "mana_steal",
];

const DEFENSE_KEYS = [
  "life",
  "mana",
  "life_replenish",
  "mana_replenish",
  "block_chance",
  "physical_damage_reduction",
  "magic_damage_reduction",
];

interface ResistanceStyle {
  key: string;
  label: string;
  className: string;
}

const RESISTANCES: ResistanceStyle[] = [
  { key: "fire_resistance", label: "Fire", className: "text-stat-red" },
  { key: "cold_resistance", label: "Cold", className: "text-stat-blue" },
  {
    key: "lightning_resistance",
    label: "Lightning",
    className: "text-stat-orange",
  },
  { key: "poison_resistance", label: "Poison", className: "text-stat-purple" },
];

const ATTR_COLOR: Record<string, string> = {
  strength: "text-stat-orange",
  dexterity: "text-stat-green",
  intelligence: "text-stat-purple",
  energy: "text-stat-blue",
  vitality: "text-stat-red",
  armor: "text-muted",
};

const GOLD_OFFENSE = new Set(["enhanced_damage", "crit_chance", "crit_damage"]);
const GOLD_DEFENSE = new Set(["life"]);
const BLUE_DEFENSE = new Set(["mana", "mana_replenish"]);

export default function LeftStatsPanel() {
  // Persistent left sidebar that summarises the build at a glance: header, attribute totals, derived offense/defense/resistance stats, the main-skill damage breakdown, the active aura/buff selectors, the proc toggles, and the combined-DPS estimate. Used as the always-visible status panel in the app shell.
  const classId = useBuild((s) => s.classId);
  const level = useBuild((s) => s.level);
  const allocated = useBuild((s) => s.allocated);
  const inventory = useBuild((s) => s.inventory);
  const treeAllocated = useBuild((s) => s.allocatedTreeNodes);
  const skillRanks = useBuild((s) => s.skillRanks);
  const mainSkillId = useBuild((s) => s.mainSkillId);
  const setMainSkill = useBuild((s) => s.setMainSkill);
  const activeAuraId = useBuild((s) => s.activeAuraId);
  const setActiveAura = useBuild((s) => s.setActiveAura);
  const procToggles = useBuild((s) => s.procToggles);
  const setProcToggle = useBuild((s) => s.setProcToggle);
  const killsPerSec = useBuild((s) => s.killsPerSec);
  const setKillsPerSec = useBuild((s) => s.setKillsPerSec);

  const activeBuffs = useBuild((s) => s.activeBuffs);
  const enemyConditions = useBuild((s) => s.enemyConditions);
  const enemyResistances = useBuild((s) => s.enemyResistances);
  const customStats = useBuild((s) => s.customStats);
  const treeSocketed = useBuild((s) => s.treeSocketed);
  const { attributes, stats } = useMemo(
    () =>
      computeBuildStats(
        classId,
        level,
        allocated,
        inventory,
        skillRanks,
        activeAuraId,
        activeBuffs,
        customStats,
        treeAllocated,
        treeSocketed,
      ),
    [
      classId,
      level,
      allocated,
      inventory,
      skillRanks,
      activeAuraId,
      activeBuffs,
      customStats,
      treeAllocated,
      treeSocketed,
    ],
  );

  const cls = classId ? getClass(classId) : undefined;
  const attrSpent = Object.values(allocated).reduce((s, v) => s + v, 0);
  const attrTotal = attrPointsFor(level);
  const skillSpent = Object.values(skillRanks).reduce((s, v) => s + v, 0);
  const skillTotal = skillPointsFor(level);

  const allClassSkills = useMemo(() => getSkillsByClass(classId), [classId]);
  const classSkills = useMemo(
    () => allClassSkills.filter((s) => s.kind === "active"),
    [allClassSkills],
  );
  const classAuras = useMemo(
    () => allClassSkills.filter((s) => s.kind === "aura"),
    [allClassSkills],
  );
  const activeSkill =
    mainSkillId != null ? classSkills.find((s) => s.id === mainSkillId) : null;
  const activeRank = activeSkill ? (skillRanks[activeSkill.id] ?? 0) : 0;

  const itemSkillBonuses = useMemo(
    () => aggregateItemSkillBonuses(inventory),
    [inventory],
  );
  const allSkillsMin = rangedMin(stats.all_skills ?? 0);
  const allSkillsMax = rangedMax(stats.all_skills ?? 0);
  const elementSkillsMin = activeSkill?.damageType
    ? rangedMin(stats[`${activeSkill.damageType}_skills`] ?? 0)
    : 0;
  const elementSkillsMax = activeSkill?.damageType
    ? rangedMax(stats[`${activeSkill.damageType}_skills`] ?? 0)
    : 0;
  const itemBonus: [number, number] = activeSkill
    ? (itemSkillBonuses[normalizeSkillName(activeSkill.name)] ?? [0, 0])
    : [0, 0];
  const rankBonusMin = allSkillsMin + elementSkillsMin + itemBonus[0];
  const rankBonusMax = allSkillsMax + elementSkillsMax + itemBonus[1];
  const effRankMin = activeRank + rankBonusMin;
  const effRankMax = activeRank + rankBonusMax;

  const baseManaMin = activeSkill
    ? manaCostAtRank(activeSkill, Math.max(effRankMin, 1))
    : undefined;
  const baseManaMax = activeSkill
    ? manaCostAtRank(activeSkill, Math.max(effRankMax, 1))
    : undefined;
  const fcrCombined = combineAdditiveAndMore(
    stats.faster_cast_rate,
    stats.faster_cast_rate_more,
  );
  const fcrMin = rangedMin(fcrCombined);
  const fcrMax = rangedMax(fcrCombined);
  const mcrMin = rangedMin(stats.mana_cost_reduction ?? 0);
  const mcrMax = rangedMax(stats.mana_cost_reduction ?? 0);
  const effCastMin = activeSkill?.baseCastRate
    ? activeSkill.baseCastRate * (1 + fcrMin / 100)
    : undefined;
  const effCastMax = activeSkill?.baseCastRate
    ? activeSkill.baseCastRate * (1 + fcrMax / 100)
    : undefined;
  const effManaMin =
    baseManaMin !== undefined ? baseManaMin * (1 - mcrMax / 100) : undefined;
  const effManaMax =
    baseManaMax !== undefined ? baseManaMax * (1 - mcrMin / 100) : undefined;
  const manaPerSecMin =
    effManaMin !== undefined && effCastMin !== undefined
      ? effManaMin * effCastMin
      : undefined;
  const manaPerSecMax =
    effManaMax !== undefined && effCastMax !== undefined
      ? effManaMax * effCastMax
      : undefined;
  const manaRegenCombined = combineAdditiveAndMore(
    stats.mana_replenish,
    stats.mana_replenish_more,
  );
  const manaRegenMin = rangedMin(manaRegenCombined);
  const manaRegenMax = rangedMax(manaRegenCombined);
  const sustainable =
    manaPerSecMax !== undefined && manaPerSecMax <= manaRegenMin;
  const unsustainable =
    manaPerSecMin !== undefined && manaPerSecMin > manaRegenMax;
  const netMin =
    manaPerSecMax !== undefined ? manaRegenMin - manaPerSecMax : undefined;
  const netMax =
    manaPerSecMin !== undefined ? manaRegenMax - manaPerSecMin : undefined;
  const uptimeMin =
    manaPerSecMax !== undefined
      ? manaPerSecMax <= 0
        ? 100
        : Math.min(100, (manaRegenMin / manaPerSecMax) * 100)
      : undefined;
  const uptimeMax =
    manaPerSecMin !== undefined
      ? manaPerSecMin <= 0
        ? 100
        : Math.min(100, (manaRegenMax / manaPerSecMin) * 100)
      : undefined;

  const skillRanksByName = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of allClassSkills) {
      out[normalizeSkillName(s.name)] = skillRanks[s.id] ?? 0;
    }
    return out;
  }, [allClassSkills, skillRanks]);

  const damage =
    activeSkill && activeRank > 0
      ? computeSkillDamage(
          activeSkill,
          activeRank,
          attributes,
          stats,
          skillRanksByName,
          itemSkillBonuses,
          enemyConditions,
          enemyResistances,
        )
      : null;
  const hitDpsMin =
    damage && effCastMin !== undefined
      ? damage.finalMin * effCastMin
      : undefined;
  const hitDpsMax =
    damage && effCastMax !== undefined
      ? damage.finalMax * effCastMax
      : undefined;
  const avgHitDpsMin =
    damage && effCastMin !== undefined
      ? damage.avgMin * effCastMin
      : undefined;
  const avgHitDpsMax =
    damage && effCastMax !== undefined
      ? damage.avgMax * effCastMax
      : undefined;

  const procSkills = useMemo(
    () => allClassSkills.filter((s) => s.proc && (skillRanks[s.id] ?? 0) > 0),
    [allClassSkills, skillRanks],
  );

  const procDps = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const procSkill of procSkills) {
      if (!procToggles[procSkill.id] || !procSkill.proc) continue;
      const targetName = normalizeSkillName(procSkill.proc.target);
      const target = allClassSkills.find(
        (s) => normalizeSkillName(s.name) === targetName,
      );
      if (!target) continue;
      const targetRank = skillRanks[target.id] ?? 0;
      if (targetRank === 0) continue;
      const targetDmg = computeSkillDamage(
        target,
        targetRank,
        attributes,
        stats,
        skillRanksByName,
        itemSkillBonuses,
        enemyConditions,
        enemyResistances,
      );
      if (!targetDmg) continue;
      const rate = procSkill.proc.trigger === "on_kill" ? killsPerSec : 1;
      const factor = rate * (procSkill.proc.chance / 100);
      min += factor * targetDmg.avgMin;
      max += factor * targetDmg.avgMax;
    }
    return { min, max };
  }, [
    procSkills,
    procToggles,
    allClassSkills,
    skillRanks,
    attributes,
    stats,
    skillRanksByName,
    itemSkillBonuses,
    enemyConditions,
    enemyResistances,
    killsPerSec,
  ]);
  const { min: procDpsMin, max: procDpsMax } = procDps;

  const combinedDpsMin =
    avgHitDpsMin !== undefined ? avgHitDpsMin + procDpsMin : undefined;
  const combinedDpsMax =
    avgHitDpsMax !== undefined ? avgHitDpsMax + procDpsMax : undefined;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-panel text-[12px]">
      <div className="border-b border-border px-3.5 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <Logo size={28} title="HSPlanner" />
          <div className="flex flex-col">
            <div className="brand-display text-[13px] leading-none">
              HSPlanner
            </div>
            <div className="mt-1.5 text-[10px] text-faint uppercase tracking-[0.12em]">
              {cls?.name ?? "No class"}
            </div>
          </div>
        </div>
      </div>

      {classAuras.length > 0 && (
        <Section title="Active Aura">
          <select
            value={activeAuraId ?? ""}
            onChange={(e) => setActiveAura(e.target.value || null)}
            className="w-full rounded border border-border bg-panel-2 px-2 py-1 text-xs"
          >
            <option value="">— none —</option>
            {classAuras.map((s) => {
              const rank = skillRanks[s.id] ?? 0;
              return (
                <option key={s.id} value={s.id} disabled={rank === 0}>
                  {s.icon && !isImageUrl(s.icon) ? `${s.icon} ` : ""}
                  {s.name} {rank > 0 ? `(rank ${rank})` : "(not learned)"}
                </option>
              );
            })}
          </select>
        </Section>
      )}

      {procSkills.length > 0 && (
        <Section title="Procs">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-text/80">Kills / sec</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={killsPerSec}
              onChange={(e) => setKillsPerSec(Number(e.target.value))}
              className="w-16 rounded border border-border bg-panel-2 px-1.5 py-0.5 text-right text-xs tabular-nums"
            />
          </div>
          {procSkills.map((p) => {
            const targetName = normalizeSkillName(p.proc!.target);
            const target = allClassSkills.find(
              (s) => normalizeSkillName(s.name) === targetName,
            );
            const targetRank = target ? (skillRanks[target.id] ?? 0) : 0;
            const ready = !!target && targetRank > 0;
            return (
              <label
                key={p.id}
                className="flex items-center justify-between gap-2 py-0.5"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <input
                    type="checkbox"
                    checked={!!procToggles[p.id]}
                    onChange={(e) => setProcToggle(p.id, e.target.checked)}
                    disabled={!ready}
                    className="accent-accent"
                  />
                  <span className={ready ? "text-text/85" : "text-muted"}>
                    {p.icon} {p.name}
                  </span>
                </span>
                <span className="text-[10px] text-muted">
                  {p.proc!.chance}% on {p.proc!.trigger.replace("on_", "")}
                  {!ready && " · target unlearned"}
                </span>
              </label>
            );
          })}
        </Section>
      )}

      <Section title="Main Skill">
        {classSkills.length === 0 ? (
          <div className="text-muted italic">No skills for this class</div>
        ) : (
          <>
            <select
              value={mainSkillId ?? ""}
              onChange={(e) => setMainSkill(e.target.value || null)}
              className="mb-1 w-full rounded border border-border bg-panel-2 px-2 py-1 text-xs"
            >
              <option value="">— select —</option>
              {classSkills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon && !isImageUrl(s.icon) ? `${s.icon} ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
            {activeSkill && (
              <>
                <Row
                  label="Rank"
                  value={
                    <>
                      <span className="text-text">
                        {effRankMin === effRankMax
                          ? effRankMin
                          : `${effRankMin}-${effRankMax}`}
                      </span>
                      {(rankBonusMin !== 0 || rankBonusMax !== 0) && (
                        <span className="text-accent">
                          {" "}
                          ({activeRank}
                          {rankBonusMin === rankBonusMax
                            ? rankBonusMin >= 0
                              ? `+${rankBonusMin}`
                              : rankBonusMin
                            : ` +${rankBonusMin}-${rankBonusMax}`}
                          )
                        </span>
                      )}
                      <span className="text-muted">/{activeSkill.maxRank}</span>
                    </>
                  }
                />
                <Row
                  label="Mana / cast"
                  value={
                    effManaMin === undefined || effManaMax === undefined ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="text-sky-300">
                        {formatNumRange(effManaMin, effManaMax)}
                      </span>
                    )
                  }
                />
                <Row
                  label="Cast rate"
                  value={
                    effCastMin !== undefined && effCastMax !== undefined ? (
                      <span className="text-text">
                        {formatNumRange(effCastMin, effCastMax)}/s
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )
                  }
                />
                <Row
                  label="Mana / sec"
                  value={
                    manaPerSecMin !== undefined &&
                    manaPerSecMax !== undefined ? (
                      <span
                        className={
                          sustainable
                            ? "text-green-400"
                            : unsustainable
                              ? "text-red-400"
                              : "text-yellow-300"
                        }
                      >
                        {formatNumRange(manaPerSecMin, manaPerSecMax)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )
                  }
                />
                <Row
                  label="Mana regen"
                  value={
                    <span className="text-sky-300">
                      {formatNumRange(manaRegenMin, manaRegenMax)}
                    </span>
                  }
                />
                {netMin !== undefined && netMax !== undefined && (
                  <Row
                    label="Net mana / sec"
                    value={
                      <span
                        className={
                          netMin >= 0
                            ? "text-green-400"
                            : netMax < 0
                              ? "text-red-400"
                              : "text-yellow-300"
                        }
                      >
                        {netMin >= 0 ? "+" : ""}
                        {formatNumRange(netMin, netMax)}
                      </span>
                    }
                  />
                )}
                {uptimeMin !== undefined && uptimeMax !== undefined && (
                  <Row
                    label="Uptime"
                    value={
                      <span
                        className={
                          uptimeMin >= 100
                            ? "text-green-400"
                            : uptimeMax < 75
                              ? "text-red-400"
                              : "text-yellow-300"
                        }
                      >
                        {formatNumRange(
                          Math.round(uptimeMin),
                          Math.round(uptimeMax),
                        )}
                        %
                      </span>
                    }
                  />
                )}
                <div className="my-1 border-t border-border" />
                <Row
                  label="Hit damage"
                  value={
                    damage ? (
                      <span className="text-text">
                        {formatNumRange(damage.finalMin, damage.finalMax)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )
                  }
                />
                <Row
                  label="Hit DPS"
                  value={
                    hitDpsMin !== undefined && hitDpsMax !== undefined ? (
                      <span className="text-accent">
                        {formatNumRange(
                          Math.round(hitDpsMin),
                          Math.round(hitDpsMax),
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )
                  }
                />
                <Row
                  label="Combined DPS"
                  value={
                    combinedDpsMin !== undefined &&
                    combinedDpsMax !== undefined ? (
                      <span className="text-green-400 font-semibold">
                        {formatNumRange(
                          Math.round(combinedDpsMin),
                          Math.round(combinedDpsMax),
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )
                  }
                />
              </>
            )}
          </>
        )}
      </Section>

      <Section title="Points">
        <Row
          label="Attr used"
          value={
            <>
              <span className="text-text">{attrSpent}</span>
              <span className="text-muted">/{attrTotal}</span>
            </>
          }
        />
        <Row
          label="Skill used"
          value={
            <>
              <span className="text-text">{skillSpent}</span>
              <span className="text-muted">/{skillTotal}</span>
            </>
          }
        />
        <Row
          label="Tree nodes"
          value={<span className="text-text">{treeAllocated.size}</span>}
        />
      </Section>

      <Section title="Attributes">
        {ATTRIBUTE_ORDER.map((key) => {
          const attr = gameConfig.attributes.find((a) => a.key === key);
          if (!attr) return null;
          const v = attributes[attr.key];
          const color = ATTR_COLOR[key] ?? "text-text";
          return (
            <div
              key={key}
              className="flex items-baseline justify-between gap-2 py-0.5"
            >
              <span className={`${color} flex-1 min-w-0 leading-tight`}>
                {attr.name}
              </span>
              <span
                className={`font-mono tabular-nums shrink-0 whitespace-nowrap text-right ${color}`}
              >
                {formatValue(v ?? 0, key)}
              </span>
            </div>
          );
        })}
      </Section>

      <Section title="Offense">
        {OFFENSE_KEYS.map((key) => (
          <StatLine
            key={key}
            statKey={key}
            value={stats[key] ?? 0}
            highlight={GOLD_OFFENSE.has(key) ? "gold" : undefined}
          />
        ))}
      </Section>

      <Section title="Defense">
        {DEFENSE_KEYS.map((key) => (
          <StatLine
            key={key}
            statKey={key}
            value={stats[key] ?? 0}
            highlight={
              GOLD_DEFENSE.has(key)
                ? "gold"
                : BLUE_DEFENSE.has(key)
                  ? "blue"
                  : undefined
            }
          />
        ))}
      </Section>

      <Section title="Resistances">
        {RESISTANCES.map((r) => {
          const v = stats[r.key] ?? 0;
          const cap = effectiveCap(r.key, stats);
          const zero = isZero(v);
          const numeric = typeof v === "number" ? v : 0;
          const capped = cap !== undefined && numeric > cap;
          return (
            <div
              key={r.key}
              className="flex items-baseline justify-between gap-2 py-0.5"
            >
              <span className={`${r.className} flex-1 min-w-0 leading-tight`}>
                {r.label}
              </span>
              <span
                className={`font-mono tabular-nums shrink-0 whitespace-nowrap text-right ${zero ? "text-faint" : r.className}`}
              >
                {zero ? (
                  "—"
                ) : capped ? (
                  <>
                    {cap}%{" "}
                    <span className="text-faint text-[10px]">({numeric}%)</span>
                  </>
                ) : (
                  formatValue(v, r.key)
                )}
              </span>
            </div>
          );
        })}
      </Section>
    </aside>
  );
}

function StatLine({
  statKey,
  value,
  highlight,
}: {
  statKey: string;
  value: RangedValue;
  highlight?: "gold" | "blue";
}) {
  // Renders a single label/value row inside the LeftStatsPanel sections, dimming both sides when the value is zero and applying optional gold/blue highlights for headline stats. Used by the offense/defense/resistance lists.
  const zero = isZero(value);
  const def = statDef(statKey);
  const label = def?.name ?? statKey;
  const labelClass = zero
    ? "text-faint"
    : highlight === "blue"
      ? "text-stat-blue"
      : "text-muted";
  const valueClass = zero
    ? "text-faint"
    : highlight === "gold"
      ? "text-accent-hot"
      : highlight === "blue"
        ? "text-stat-blue"
        : "text-text";
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className={`${labelClass} flex-1 min-w-0 leading-tight`}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums shrink-0 whitespace-nowrap text-right ${valueClass}`}
      >
        {zero ? "—" : formatValue(value, statKey)}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // Renders a titled section block inside the LeftStatsPanel with the standard uppercase heading and divider. Used to group related stat rows visually.
  return (
    <div className="border-b border-border/70 px-4 py-3">
      <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted/90 font-medium">
        {title}
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  // Renders a generic label/value row used by sections that show ad-hoc strings or React nodes (rather than RangedValues). Used by the LeftStatsPanel sub-sections that display custom-formatted values like attribute totals.
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-muted flex-1 min-w-0 leading-tight">{label}</span>
      <span className="font-mono tabular-nums shrink-0 whitespace-nowrap text-right">
        {value}
      </span>
    </div>
  );
}

function formatNumRange(min: number, max: number): string {
  // Formats a [min, max] number range for display, collapsing identical bounds and stripping trailing zeros from fractional values. Used by the headline DPS / damage rows.
  const fmt = (v: number) =>
    // Renders a single number with up to two decimals and no trailing zeros, used inside formatNumRange for both endpoints.
    Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
  if (Math.abs(min - max) < 0.005) return fmt(min);
  return `${fmt(min)}–${fmt(max)}`;
}
