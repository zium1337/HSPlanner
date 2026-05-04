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

export interface ParsedMod {
  key: string
  value: number
}

interface ParseRule {
  test: RegExp
  build: (m: RegExpMatchArray) => ParsedMod | null
}

const ELEMENTS = ['arcane', 'cold', 'fire', 'lightning', 'poison'] as const
type Element = (typeof ELEMENTS)[number]

const ELEMENT_RE = ELEMENTS.join('|')

function num(s: string): number {
  const cleaned = s.replace(/^\+/, '')
  return Number(cleaned)
}

const RULES: ParseRule[] = [
  // === flat life / mana ===
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Life$/i,
    build: (m) => ({ key: 'life', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)\s+to\s+Maximum\s+Mana$/i,
    build: (m) => ({ key: 'mana', value: num(m[1]!) }),
  },

  // === % life / mana ===
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

  // === flat attributes ===
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
    test: /^([+\-\d.]+)\s+to\s+Defense$/i,
    build: (m) => ({ key: 'defense', value: num(m[1]!) }),
  },

  // === movement / attack / cast ===
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

  // === crit ===
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

  // === resistances ===
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

  // === skill damage (elements) ===
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

  // === spell damage / area / duration ===
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

  // === recovery / hit ===
  {
    test: /^([+\-\d.]+)%\s+Increased\s+Hit\s+Recovery$/i,
    build: (m) => ({ key: 'faster_hit_recovery', value: num(m[1]!) }),
  },

  // === ailments ===
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

  // === leech ===
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

  // === mitigation / reduction / return ===
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
    test: /^([+\-\d.]+)\s+to\s+Damage\s+Returned$/i,
    build: (m) => ({ key: 'damage_return', value: num(m[1]!) }),
  },

  // === replenish ===
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

  // === skills ===
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

  // === misc ===
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

  // === flat physical damage ===
  {
    test: /^([+\-\d.]+)\s+to\s+Physical\s+Damage$/i,
    build: (m) => ({ key: 'additive_physical_damage', value: num(m[1]!) }),
  },

  // === extras commonly seen on tree ===
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
    test: /^([+\-\d.]+)%\s+Elemental\s+Break(?:\s+Inflicted\s+on\s+hit)?$/i,
    build: (m) => ({ key: 'elemental_break_on_strike', value: num(m[1]!) }),
  },
  {
    test: /^([+\-\d.]+)%\s+to\s+Elemental\s+Break$/i,
    build: (m) => ({ key: 'elemental_break_on_strike', value: num(m[1]!) }),
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

const PARSE_CACHE = new Map<string, ParsedMod | null>()

export function parseTreeNodeMod(line: string): ParsedMod | null {
  const trimmed = line.trim()
  const cached = PARSE_CACHE.get(trimmed)
  if (cached !== undefined) return cached
  for (const rule of RULES) {
    const m = trimmed.match(rule.test)
    if (m) {
      const built = rule.build(m)
      if (built && Number.isFinite(built.value)) {
        PARSE_CACHE.set(trimmed, built)
        return built
      }
    }
  }
  PARSE_CACHE.set(trimmed, null)
  return null
}

export interface NodeModBreakdown {
  parsed: { line: string; mod: ParsedMod }[]
  unsupported: string[]
}

export function classifyNodeLines(lines: string[]): NodeModBreakdown {
  const parsed: NodeModBreakdown['parsed'] = []
  const unsupported: string[] = []
  for (const line of lines) {
    const mod = parseTreeNodeMod(line)
    if (mod) parsed.push({ line, mod })
    else unsupported.push(line)
  }
  return { parsed, unsupported }
}

export function aggregateTreeStats(
  allocated: Set<number>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of allocated) {
    const info = TREE_NODE_INFO[String(id)]
    if (!info?.l) continue
    for (const line of info.l) {
      const mod = parseTreeNodeMod(line)
      if (!mod) continue
      out[mod.key] = (out[mod.key] ?? 0) + mod.value
    }
  }
  return out
}
