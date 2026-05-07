import treeNodeInfo from '../data/tree-nodes.json'

export interface TreeNodeInfo {
  t: string
  n: string
  l: string[]
  g?: string[]
}

export const TREE_NODE_INFO = treeNodeInfo as Record<string, TreeNodeInfo>

export const TREE_WARP_IDS = new Set<number>(
  Object.entries(TREE_NODE_INFO)
    .filter(([, info]) => info.n === 'warp')
    .map(([id]) => Number(id)),
)

export const TREE_JEWELRY_IDS = new Set<number>(
  Object.entries(TREE_NODE_INFO)
    .filter(([, info]) => info.n === 'jewelry')
    .map(([id]) => Number(id)),
)

export type SelfConditionKey = 'crit_chance_below_40' | 'life_below_40'

export interface ParsedMod {
  key: string
  value: number
  selfCondition?: SelfConditionKey
}

interface ParseRule {
  test: RegExp
  build: (m: RegExpMatchArray) => ParsedMod | null
}

interface SelfConditionRule {
  test: RegExp
  condition: SelfConditionKey
}

const SELF_CONDITION_SUFFIXES: SelfConditionRule[] = [
  {
    test: /\s+when\s+critical\s+strike\s+chance\s+is\s+below\s+40%$/i,
    condition: 'crit_chance_below_40',
  },
  {
    test: /\s+(?:when|while)\s+(?:current\s+life\s+is\s+)?below\s+40%(?:\s+of)?\s+maximum\s+life$/i,
    condition: 'life_below_40',
  },
]

export const SELF_CONDITION_LABELS: Record<SelfConditionKey, string> = {
  crit_chance_below_40: 'Critical Strike Chance is below 40% (auto)',
  life_below_40: 'Current Life is below 40% of Maximum',
}

export const SELF_CONDITION_KEYS: SelfConditionKey[] = [
  'crit_chance_below_40',
  'life_below_40',
]

function stripSelfCondition(line: string): {
  base: string
  selfCondition: SelfConditionKey | undefined
} {
  // Detects a trailing self-condition phrase (e.g. "when Critical Strike Chance is below 40%") on a tree-node mod line, returns the line with that suffix removed and the matched condition key. Used by parseTreeNodeMod so the existing RULES regexes can keep matching the unconditional core text while the parser still records the gating condition.
  for (const rule of SELF_CONDITION_SUFFIXES) {
    if (rule.test.test(line)) {
      return {
        base: line.replace(rule.test, '').trimEnd(),
        selfCondition: rule.condition,
      }
    }
  }
  return { base: line, selfCondition: undefined }
}

export const ELEMENTS = ['arcane', 'cold', 'fire', 'lightning', 'poison'] as const
type Element = (typeof ELEMENTS)[number]

const ELEMENT_RE = ELEMENTS.join('|')

function num(s: string): number {
  // Strips a leading "+" sign and parses the remainder as a Number, used so the affix-text rules can hand the captured value group straight to Number() without worrying about the sign character.
  const cleaned = s.replace(/^\+/, '')
  return Number(cleaned)
}

const RULES: ParseRule[] = [
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Life$/i,
    build: (m) => ({ key: 'life', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Mana$/i,
    build: (m) => ({ key: 'mana', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Maximum\s+Life$/i,
    build: (m) => ({ key: 'increased_life', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Maximum\s+Mana$/i,
    build: (m) => ({
      key: m[2] ? 'increased_mana_more' : 'increased_mana',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Mana$/i,
    build: (m) => ({ key: 'increased_mana', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Strength$/i,
    build: (m) => ({ key: 'to_strength', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+Strength$/i,
    build: (m) => ({ key: 'to_strength', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Dexterity$/i,
    build: (m) => ({ key: 'to_dexterity', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+Dexterity$/i,
    build: (m) => ({ key: 'to_dexterity', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Intelligence$/i,
    build: (m) => ({ key: 'to_intelligence', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Energy$/i,
    build: (m) => ({ key: 'to_energy', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Vitality$/i,
    build: (m) => ({ key: 'to_vitality', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Armor$/i,
    build: (m) => ({ key: 'to_armor', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+All\s+Attributes$/i,
    build: (m) => ({ key: 'all_attributes', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+All\s+Attributes$/i,
    build: (m) => ({ key: 'increased_all_attributes', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?(Strength|Dexterity|Intelligence|Energy|Vitality|Armor)$/i,
    build: (m) => {
      const attr = m[3]!.toLowerCase()
      return {
        key: m[2] ? `increased_${attr}_more` : `increased_${attr}`,
        value: num(m[1]!),
      }
    },
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Defense$/i,
    build: (m) => ({ key: 'defense', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Movement\s+Speed$/i,
    build: (m) => ({
      key: m[2] ? 'movement_speed_more' : 'movement_speed',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Attack\s+Speed$/i,
    build: (m) => ({
      key: m[2] ? 'increased_attack_speed_more' : 'increased_attack_speed',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Faster\s+Cast\s+Rate$/i,
    build: (m) => ({
      key: m[2] ? 'faster_cast_rate_more' : 'faster_cast_rate',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+(?:to\s+)?Spell\s+Haste$/i,
    build: (m) => ({ key: 'skill_haste', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Critical\s+Strike\s+Damage$/i,
    build: (m) => ({
      key: m[2] ? 'crit_damage_more' : 'crit_damage',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+Critical\s+Damage$/i,
    build: (m) => ({ key: 'crit_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+to\s+Critical\s+Strike\s+Chance$/i,
    build: (m) => ({ key: 'crit_chance', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Chance\s+to\s+Critically\s+Hit\s+with\s+Spells$/i,
    build: (m) => ({ key: 'spell_crit_chance', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Spell\s+Critical\s+Damage$/i,
    build: (m) => ({ key: 'spell_crit_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+(?:to\s+)?All\s+Resistances$/i,
    build: (m) => ({ key: 'all_resistances', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+(Total\s+)?All\s+Resistances$/i,
    build: (m) => ({
      key: m[2] ? 'all_resistances_more' : 'all_resistances',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+to\s+(Total\s+)?All\s+Resistances$/i,
    build: (m) => ({
      key: m[2] ? 'all_resistances_more' : 'all_resistances',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+to\s+Maximum\s+All\s+Resistances$/i,
    build: (m) => ({ key: 'max_all_resistances', value: num(m[1]!) }),
  },
  {
    test: new RegExp(
      `^([+\\-\\d.]+)%\\s+to\\s+(${ELEMENT_RE})\\s+Resistance$`,
      'i',
    ),
    build: (m) => ({
      key: `${m[2]!.toLowerCase() as Element}_resistance`,
      value: num(m[1]!),
    }),
  },
  {
    test: new RegExp(
      `^([+\\-\\d.]+)%\\s+to\\s+Maximum\\s+(${ELEMENT_RE})\\s+Resistance$`,
      'i',
    ),
    build: (m) => ({
      key: `max_${m[2]!.toLowerCase() as Element}_resistance`,
      value: num(m[1]!),
    }),
  },
  {
    test: new RegExp(
      `^([+\\-\\d.]+)%\\s+to\\s+(${ELEMENT_RE})\\s+Absorb$`,
      'i',
    ),
    build: (m) => ({
      key: `${m[2]!.toLowerCase() as Element}_absorption`,
      value: num(m[1]!),
    }),
  },
  {
    test: new RegExp(
      `^([+\\-\\d.]+)%\\s+Increased\\s+(Total\\s+)?(${ELEMENT_RE})\\s+Skill\\s+Damage$`,
      'i',
    ),
    build: (m) => {
      const element = m[3]!.toLowerCase() as Element
      return {
        key: m[2]
          ? `${element}_skill_damage_more`
          : `${element}_skill_damage`,
        value: num(m[1]!),
      }
    },
  },
  {
    test: new RegExp(
      `^([+\\-\\d.]+)\\s+to\\s+(${ELEMENT_RE})\\s+Skill\\s+Damage$`,
      'i',
    ),
    build: (m) => ({
      key: `flat_${m[2]!.toLowerCase() as Element}_skill_damage`,
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Magic\s+Skill\s+Damage$/i,
    build: (m) => ({
      key: m[2] ? 'magic_skill_damage_more' : 'magic_skill_damage',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Magic\s+Skill\s+Damage$/i,
    build: (m) => ({ key: 'flat_skill_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Spell\s+Damage$/i,
    build: (m) => ({ key: 'spell_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Area\s+of\s+Effect(?:\s+(?:skill\s+)?radius(?:\s+of\s+all\s+skills)?)?$/i,
    build: (m) => ({
      key: m[2] ? 'area_of_effect_more' : 'area_of_effect',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Spell\s+Duration$/i,
    build: (m) => ({ key: 'spell_duration_pct', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Hit\s+Recovery$/i,
    build: (m) => ({ key: 'faster_hit_recovery', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Bleed(?:ing)?\s+Damage$/i,
    build: (m) => ({ key: 'increased_bleeding_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Bleed(?:ing)?\s+Frequency$/i,
    build: (m) => ({ key: 'increased_bleeding_frequency', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Poison(?:ed)?\s+Damage$/i,
    build: (m) => ({ key: 'increased_poisoned_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Burning\s+Damage$/i,
    build: (m) => ({ key: 'increased_burning_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Stasis\s+Damage$/i,
    build: (m) => ({ key: 'increased_stasis_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Ailment(?:\s+Tick)?\s+Frequency$/i,
    build: (m) => ({ key: 'increased_ailment_frequency', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Chance\s+to\s+inflict\s+Bleeding\s+on\s+hit$/i,
    build: (m) => ({ key: 'chance_inflict_bleeding', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Chance\s+to\s+inflict\s+Poison(?:ed)?\s+on\s+hit$/i,
    build: (m) => ({ key: 'chance_inflict_poisoned', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Chance\s+to\s+inflict\s+Burning\s+on\s+hit$/i,
    build: (m) => ({ key: 'chance_inflict_burning', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Chance\s+to\s+inflict\s+Stasis\s+on\s+hit$/i,
    build: (m) => ({ key: 'chance_inflict_stasis', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Bleed(?:ing)?\s+Stacks$/i,
    build: (m) => ({ key: 'max_bleed_stacks', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Poison(?:ed)?\s+Stacks$/i,
    build: (m) => ({ key: 'max_poisoned_stacks', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Burning\s+Stacks$/i,
    build: (m) => ({ key: 'max_burning_stacks', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Stasis\s+Stacks$/i,
    build: (m) => ({ key: 'max_stasis_stacks', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Rage\s+Stacks$/i,
    build: (m) => ({ key: 'max_rage_stacks', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Colossus\s+Stacks$/i,
    build: (m) => ({ key: 'max_colossus_stacks', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Life\s+Steal$/i,
    build: (m) => ({
      key: m[2] ? 'life_steal_more' : 'life_steal',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Mana\s+Steal$/i,
    build: (m) => ({ key: 'mana_steal', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Rate\s+of\s+Life\s+Steal$/i,
    build: (m) => ({ key: 'life_steal_rate', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increases\s+Rate\s+of\s+Mana\s+Steal$/i,
    build: (m) => ({ key: 'mana_steal_rate', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Damage\s+Mitigation$/i,
    build: (m) => ({ key: 'damage_mitigation', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+of\s+Damage\s+Taken\s+Mitigated$/i,
    build: (m) => ({ key: 'damage_mitigation', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+of\s+Incoming\s+Damage\s+is\s+mitigated$/i,
    build: (m) => ({ key: 'damage_mitigation', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+to\s+Physical\s+Damage\s+Reduction$/i,
    build: (m) => ({ key: 'physical_damage_reduction', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+of\s+Damage\s+Taken\s+returned\s+to\s+the\s+Attacker$/i,
    build: (m) => ({ key: 'damage_return', value: num(m[1]!) }),
  },
  {
    test: /^All\s+Damage\s+Taken\s+Reduced\s+by\s+([+\-\d.]+)%$/i,
    build: (m) => ({ key: 'all_damage_taken_reduced_pct', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Damage\s+Returned$/i,
    build: (m) => ({ key: 'damage_return', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+Life\s+Replenished\s+per\s+second$/i,
    build: (m) => ({ key: 'life_replenish', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Maximum\s+Life\s+Replenished\s+(?:Per|per)\s+[Ss]econd$/i,
    build: (m) => ({ key: 'life_replenish_pct', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+of\s+Maximum\s+Life\s+replenished\s+per\s+second$/i,
    build: (m) => ({ key: 'life_replenish_pct', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+(Total\s+)?(?:to\s+)?Mana\s+Replenish$/i,
    build: (m) => ({
      key: m[2] ? 'mana_replenish_more' : 'mana_replenish',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+All\s+Skills$/i,
    build: (m) => ({ key: 'all_skills', value: num(m[1]!) }),
  },
  {
    test: new RegExp(
      `^([+\\-\\d.]+)\\s+to\\s+(${ELEMENT_RE})\\s+Skills$`,
      'i',
    ),
    build: (m) => ({
      key: `${m[2]!.toLowerCase() as Element}_skills`,
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Physical\s+Skills$/i,
    build: (m) => ({ key: 'physical_skills', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Explosion\s+Skills$/i,
    build: (m) => ({ key: 'explosion_skills', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Summon\s+Skills$/i,
    build: (m) => ({ key: 'summon_skills', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Light\s+Radius$/i,
    build: (m) => ({ key: 'light_radius', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+to\s+Magic\s+Find$/i,
    build: (m) => ({ key: 'magic_find', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+(?:Increased\s+)?Experience\s+Gain$/i,
    build: (m) => ({ key: 'experience_gain', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Decreased\s+Crowd\s+Control\s+Diminish$/i,
    build: (m) => ({ key: 'cc_diminish_decrease', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Attack\s+Rating$/i,
    build: (m) => ({ key: 'attack_rating', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Attack\s+Rating$/i,
    build: (m) => ({ key: 'attack_rating_pct', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Physical\s+Damage$/i,
    build: (m) => ({ key: 'additive_physical_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Chance\s+for\s+a\s+deadly\s+blow$/i,
    build: (m) => ({ key: 'deadly_blow', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Chance\s+to\s+cast\s+an\s+additional\s+time\s+when\s+casting$/i,
    build: (m) => ({ key: 'multicast_chance', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Damage\s+while\s+Unarmed$/i,
    build: (m) => ({ key: 'damage_unarmed', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Explosion\s+(?:area\s+of\s+effect\s+)?[Dd]amage$/i,
    build: (m) => ({ key: 'explosion_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Enhanced\s+Damage$/i,
    build: (m) => ({
      key: m[2] ? 'enhanced_damage_more' : 'enhanced_damage',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+to\s+(?:Melee\s+|Ranged\s+)?Enhanced\s+Damage$/i,
    build: (m) => ({ key: 'enhanced_damage', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+to\s+Faster\s+Cast\s+Rate(?:\s+while\s+wielding\s+a\s+wand)?$/i,
    build: (m) => ({ key: 'faster_cast_rate', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Increased\s+(Total\s+)?Faster\s+Cast\s+Rate(?:\s+while\s+wielding\s+a\s+wand)?$/i,
    build: (m) => ({
      key: m[2] ? 'faster_cast_rate_more' : 'faster_cast_rate',
      value: num(m[1]!),
    }),
  },
  {
    test: /^([+\-\d.]+)%\s+to\s+Spell\s+Mana\s+Leech$/i,
    build: (m) => ({ key: 'mana_steal', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Elemental\s+Break\s+Inflicted\s+on\s+hit$/i,
    build: (m) => ({ key: 'elemental_break_on_strike', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Elemental\s+Break\s+Inflicted\s+on\s+spell\s+hit$/i,
    build: (m) => ({ key: 'elemental_break_on_spell', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+(?:to\s+)?Elemental\s+Break$/i,
    build: (m) => ({ key: 'elemental_break', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+Armor\s+Break(?:\s+Inflicted\s+on\s+hit)?$/i,
    build: (m) => ({ key: 'armor_break_on_strike', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+(?:Maximum|Minimum)\s+Damage(?:\s+when\s+wielding\s+a\s+shield)?$/i,
    build: (m) => ({ key: 'attack_damage', value: num(m[1]!) }),
  },
]

export interface ParsedConversion {
  kind: 'convert'
  fromKey: string
  fromKind: 'stat' | 'attribute'
  toKey: string
  toKind: 'stat' | 'attribute'
  pct: number
}

export type DisableTarget = 'life_replenish'

export interface ParsedDisable {
  kind: 'disable'
  target: DisableTarget
}

export type ParsedMeta = ParsedConversion | ParsedDisable

interface ConversionRule {
  test: RegExp
  build: (m: RegExpMatchArray) => ParsedConversion | null
}

// Display-text → stat-key map for the "added as <X>" / "converted to <X>" target side of attribute-source conversion mods. Stat keys not listed here are intentionally skipped (e.g. "Ranged Projectile Damage" — currently no engine support).
const CONVERSION_TARGET_STATS: Record<string, string> = {
  'magic skill damage': 'magic_skill_damage',
  'damage return': 'damage_return',
  'increased maximum life': 'increased_life',
  'maximum life': 'life',
  'maximum mana': 'mana',
  'physical damage': 'additive_physical_damage',
  'attack damage': 'attack_damage',
}

interface DisableRule {
  test: RegExp
  target: DisableTarget
}

const CONVERSION_RULES: ConversionRule[] = [
  {
    // "+75% of your Increased Attack Speed is added as Magic Skill Damage"
    test: /^([+\-\d.]+)%\s+of\s+(?:your\s+)?Increased\s+Attack\s+Speed\s+is\s+added\s+as\s+Magic\s+Skill\s+Damage$/i,
    build: (m) => ({
      kind: 'convert',
      fromKey: 'increased_attack_speed',
      fromKind: 'stat',
      toKey: 'magic_skill_damage',
      toKind: 'stat',
      pct: num(m[1]!),
    }),
  },
  {
    // "Vanguard of <Element>" notables: "+40% of your <Element> Resistance is converted to Increased <Element> Skill Damage"
    test: new RegExp(
      `^([+\\-\\d.]+)%\\s+of\\s+(?:your\\s+)?(${ELEMENT_RE})\\s+Resistance\\s+is\\s+converted\\s+to\\s+Increased\\s+\\2\\s+Skill\\s+Damage$`,
      'i',
    ),
    build: (m) => {
      const element = m[2]!.toLowerCase() as Element
      return {
        kind: 'convert',
        fromKey: `${element}_resistance`,
        fromKind: 'stat',
        toKey: `${element}_skill_damage`,
        toKind: 'stat',
        pct: num(m[1]!),
      }
    },
  },
  {
    // Attribute → stat conversions: "+5% of Intelligence converted to Magic Skill Damage", "+3% of Armor added as Attack Damage", "+5% of Strength added as increased Maximum Life", etc. Returns null when the target text is not in CONVERSION_TARGET_STATS so the line falls through to "Not Yet Supported".
    test: /^([+\-\d.]+)%\s+of\s+(strength|dexterity|intelligence|energy|vitality|armor)\s+(?:converted\s+to|(?:is\s+)?added\s+as)\s+(.+)$/i,
    build: (m) => {
      const target = m[3]!.trim().toLowerCase()
      const targetKey = CONVERSION_TARGET_STATS[target]
      if (!targetKey) return null
      return {
        kind: 'convert',
        fromKey: m[2]!.toLowerCase(),
        fromKind: 'attribute',
        toKey: targetKey,
        toKind: 'stat',
        pct: num(m[1]!),
      }
    },
  },
]

const DISABLE_RULES: DisableRule[] = [
  {
    test: /^You\s+cannot\s+regenerate\s+life\s+from\s+life\s+replenish\s+anymore$/i,
    target: 'life_replenish',
  },
]

const META_CACHE = new Map<string, ParsedMeta | null>()

export function parseTreeNodeMeta(line: string): ParsedMeta | null {
  // Recognises the non-stat tree-node lines: cross-stat conversions ("+X% of A is added as B") and disable flags ("You cannot regenerate life from life replenish anymore"). Returns null when the line is not a meta-mod (in which case parseTreeNodeMod is responsible). Cached per input line. Used by classifyNodeLines (for the tooltip) and computeBuildStats (to apply the effect after main stat aggregation).
  const trimmed = line.trim()
  const cached = META_CACHE.get(trimmed)
  if (cached !== undefined) return cached
  for (const rule of CONVERSION_RULES) {
    const m = trimmed.match(rule.test)
    if (m) {
      const out = rule.build(m)
      if (out && Number.isFinite(out.pct)) {
        META_CACHE.set(trimmed, out)
        return out
      }
    }
  }
  for (const rule of DISABLE_RULES) {
    if (rule.test.test(trimmed)) {
      const out: ParsedDisable = { kind: 'disable', target: rule.target }
      META_CACHE.set(trimmed, out)
      return out
    }
  }
  META_CACHE.set(trimmed, null)
  return null
}

const PARSE_CACHE = new Map<string, ParsedMod | null>()

export function parseTreeNodeMod(line: string): ParsedMod | null {
  // Tries every regex rule in RULES against the supplied tree-node mod text and returns the first matching ParsedMod (a stat key + value), or null when nothing matches. Strips and remembers any trailing self-condition phrase (e.g. "when Critical Strike Chance is below 40%") so the result includes a `selfCondition` key the aggregator can gate on. Caches results per input line so repeated tree-aggregation passes do not reparse the same text. Used by computeBuildStats and aggregateTreeStats to translate human-readable tree node lines into stat contributions.
  const trimmed = line.trim()
  const cached = PARSE_CACHE.get(trimmed)
  if (cached !== undefined) return cached
  const { base, selfCondition } = stripSelfCondition(trimmed)
  for (const rule of RULES) {
    const m = base.match(rule.test)
    if (m) {
      const built = rule.build(m)
      if (built && Number.isFinite(built.value)) {
        const out: ParsedMod = selfCondition
          ? { ...built, selfCondition }
          : built
        PARSE_CACHE.set(trimmed, out)
        return out
      }
    }
  }
  PARSE_CACHE.set(trimmed, null)
  return null
}

export interface NodeModBreakdown {
  parsed: { line: string; mod: ParsedMod | ParsedMeta }[]
  unsupported: string[]
}

export function classifyNodeLines(lines: string[]): NodeModBreakdown {
  // Splits a tree node's raw text lines into a parsed group (with their resolved ParsedMod or meta) and an unsupported group (lines neither the stat parser nor the meta parser matched). Used by the TreeView tooltip so the UI can show parsed mods inline and surface any text the parser couldn't recognise.
  const parsed: NodeModBreakdown['parsed'] = []
  const unsupported: string[] = []
  for (const line of lines) {
    const mod = parseTreeNodeMod(line)
    if (mod) {
      parsed.push({ line, mod })
      continue
    }
    const meta = parseTreeNodeMeta(line)
    if (meta) {
      parsed.push({ line, mod: meta })
      continue
    }
    unsupported.push(line)
  }
  return { parsed, unsupported }
}

export function aggregateTreeStats(
  allocated: Set<number>,
  playerConditions?: Record<string, boolean>,
): Record<string, number> {
  // Sums the parsed stat contributions of every allocated tree node into a single `Record<statKey, number>` map, gating any line tagged with a `selfCondition` behind the matching `playerConditions` flag. Used by tree-stat previews and by tests as a lightweight alternative to the full computeBuildStats pipeline.
  const out: Record<string, number> = {}
  for (const id of allocated) {
    const info = TREE_NODE_INFO[String(id)]
    if (!info?.l) continue
    for (const line of info.l) {
      const mod = parseTreeNodeMod(line)
      if (!mod) continue
      if (mod.selfCondition && !playerConditions?.[mod.selfCondition]) continue
      out[mod.key] = (out[mod.key] ?? 0) + mod.value
    }
  }
  return out
}
