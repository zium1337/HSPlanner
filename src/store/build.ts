import { create } from 'zustand'
import { setBridgeErrorListener } from '../lib/calc/bridge'
import { createCharacterSlice } from './build/characterSlice'
import { createCombatSlice } from './build/combatSlice'
import { createEtherSlice } from './build/etherSlice'
import { createInventorySlice } from './build/inventorySlice'
import { createMercSlice } from './build/mercSlice'
import { createSavedBuildsSlice } from './build/savedBuildsSlice'
import { createSkillsSlice } from './build/skillsSlice'
import { createTreeSlice } from './build/treeSlice'
import type { BuildStore } from './build/types'

export {
  MAX_STARS,
  maxSocketsFor,
  BONUS_SOCKET_MOD_ID,
} from './itemRules'

export {
  RAINBOW_MULTIPLIER,
  skillPointsFor,
  subskillPointsFor,
  subskillKey,
  attrPointsFor,
  finalAttributes,
} from './build/helpers'

export const useBuild = create<BuildStore>((...a) => ({
  ...createCharacterSlice(...a),
  ...createInventorySlice(...a),
  ...createSkillsSlice(...a),
  ...createTreeSlice(...a),
  ...createEtherSlice(...a),
  ...createMercSlice(...a),
  ...createCombatSlice(...a),
  ...createSavedBuildsSlice(...a),
}))

setBridgeErrorListener((err) => {
  useBuild.setState({
    storageError: `Calculation failed: ${err.message}`,
  })
})
