import { describe, expect, it } from 'vitest'
import { loadSeasonPatchSet } from '../load'
import { applyListPatch } from '../resolve'
import itemGrantedSkillsJson from '../../item-granted-skills.json'

type Rec = Record<string, unknown>

const itemModules = import.meta.glob<{ default: Rec[] }>('../../items/*.json', {
  eager: true,
})
const baseItems: Rec[] = Object.values(itemModules).flatMap((m) => m.default)

const { patches, errors } = loadSeasonPatchSet('s10')

function patchedItem(id: string): Rec {
  const out = applyListPatch(baseItems, patches.items, 'items')
  const found = out.data.find((i) => (i as Rec).id === id)
  if (!found) throw new Error(`item ${id} missing after patch`)
  return found as Rec
}

describe('S10 item changes', () => {
  it('loads the s10 patch set without validation errors', () => {
    expect(errors).toEqual([])
  })

  it("Ukko's Revenge nerfs lightning skill damage and stasis lightning", () => {
    const impl = patchedItem('weapons_heroic_ukkos_revenge').implicit as Rec
    expect(impl.lightning_skill_damage).toEqual([25, 40])
    expect(impl.extra_lightning_dmg_stasis).toEqual([20, 30])
  })

  it('Chaoswalkers nerfs extra damage per ailment', () => {
    const impl = patchedItem('boots_heroic_chaoswalkers').implicit as Rec
    expect(impl.extra_damage_ailments).toEqual([8, 15])
  })

  it('Glacier Talons nerfs the Blizzard on-kill proc rate to 4%', () => {
    const fx = patchedItem('claw_heroic_glacier_talons').uniqueEffects as string[]
    expect(fx[0]).toBe('4% Chance after each Kill to cast Blizzard Level 80')
  })

  it("Fallen God's Bloodlust nerfs attack-speed-to-FCR conversion 10% -> 7%", () => {
    const out = applyListPatch(
      itemGrantedSkillsJson as Rec[],
      patches.itemGrantedSkills,
      'item-granted-skills',
      'name',
    )
    const skill = out.data.find(
      (s) => (s as Rec).name === "Fallen God's Bloodlust",
    ) as Rec
    const perRank = (skill.passiveConverts as Rec).perRank as Rec[]
    expect(perRank[0].pct).toBe(7)
  })
})
