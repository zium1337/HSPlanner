import { useMemo } from 'react'
import { affixes } from '../data'
import { statName } from '../utils/stats'
import PickerModal from './PickerModal'
import {
  TooltipFooter,
  TooltipHeader,
  TooltipSection,
  TooltipSectionHeader,
} from './Tooltip'
import type { Affix } from '../types'

interface Props {
  // Picker mode
  randomGroupId?: string | null
  // Status — used to show "Adding to: {item name}"
  itemName: string
  // Existing
  affixCount: number
  maxAffixes?: number
  onClose: () => void
  onSelect: (affix: Affix) => void
}

export default function AffixPickerModal({
  randomGroupId,
  itemName,
  affixCount,
  maxAffixes,
  onClose,
  onSelect,
}: Props) {
  // Searchable picker for affixes — filters across the full affix table by name, description and stat key. When opened on an item with a `random_unholy` group it scopes to that group instead. Used from ItemConfigurator's AffixesSection.
  const items = useMemo(() => {
    if (randomGroupId) {
      return affixes.filter((a) => a.groupId === randomGroupId)
    }
    return affixes
  }, [randomGroupId])

  const isUnholy = randomGroupId === 'random_unholy'
  const titleText = isUnholy ? 'Pick Unholy Affix' : 'Pick Affix'

  return (
    <PickerModal<Affix>
      eyebrow={
        <>
          {isUnholy ? 'Unholy Group' : 'Affixes'}
          <span className="text-accent-hot">
            {' '}
            · {affixCount}
            {maxAffixes !== undefined ? ` / ${maxAffixes}` : ''}
          </span>
        </>
      }
      title={titleText}
      searchPlaceholder="Search by name, description, or stat…"
      items={items}
      getId={(a) => a.id}
      searchText={(a) =>
        `${a.name} ${a.description} ${a.statKey ?? ''} ${
          a.statKey ? statName(a.statKey) : ''
        }`
      }
      tooltipTone={isUnholy ? 'unholy' : 'rare'}
      statusText={`Adding to ${itemName}`}
      onClose={onClose}
      onSelect={(id) => {
        if (!id) return
        const a = items.find((x) => x.id === id)
        if (a) onSelect(a)
      }}
      renderRow={(a) => (
        <div
          className="grid items-center gap-3"
          style={{ gridTemplateColumns: '46px 1fr auto' }}
        >
          <span
            className={`w-max rounded-[2px] border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] ${tierBadgeClass(
              a.tier,
            )}`}
            style={{
              background: 'linear-gradient(180deg, #3a2e18, #2a2418)',
            }}
          >
            T{a.tier}
          </span>
          <span className="min-w-0">
            <span
              className={`block truncate text-[13px] font-medium ${
                isUnholy ? 'text-pink-300' : 'text-accent-hot'
              }`}
            >
              {a.name}
            </span>
            <span className="block truncate font-mono text-[10px] text-muted">
              {a.description}
            </span>
          </span>
          {a.statKey && (
            <span className="shrink-0 truncate text-right font-mono text-[10px] text-faint">
              {statName(a.statKey)}
            </span>
          )}
        </div>
      )}
      renderTooltip={(a) => (
        <>
          <TooltipHeader
            tone={isUnholy ? 'unholy' : 'rare'}
            title={a.name}
            subtitle={`Tier ${a.tier}${a.kind ? ` · ${a.kind}` : ''}${
              a.groupId ? ` · ${a.groupId}` : ''
            }`}
          />
          <TooltipSection>
            <TooltipSectionHeader tone={isUnholy ? 'pink' : 'gold'}>
              Effect
            </TooltipSectionHeader>
            <p className="text-[12px] text-text/90">{a.description}</p>
          </TooltipSection>
          {a.statKey && (
            <TooltipSection>
              <TooltipSectionHeader tone="muted">Stat</TooltipSectionHeader>
              <div className="text-[12px] text-text/85">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Stat</span>
                  <span className="font-mono">{statName(a.statKey)}</span>
                </div>
                {a.valueMin !== null && a.valueMax !== null && (
                  <div className="mt-0.5 flex justify-between gap-3">
                    <span className="text-muted">Range</span>
                    <span className="font-mono">
                      {a.sign}
                      {a.valueMin}
                      {a.format === 'percent' ? '%' : ''} —{' '}
                      {a.sign}
                      {a.valueMax}
                      {a.format === 'percent' ? '%' : ''}
                    </span>
                  </div>
                )}
              </div>
            </TooltipSection>
          )}
          <TooltipFooter>
            T{a.tier}
            {a.kind ? ` · ${a.kind}` : ''}
          </TooltipFooter>
        </>
      )}
    />
  )
}

function tierBadgeClass(tier: number): string {
  if (tier >= 4) return 'text-stat-orange border-stat-orange'
  if (tier === 3) return 'text-[#fff0c4] border-accent-hot'
  if (tier === 2) return 'text-accent-hot border-accent-deep'
  return 'text-accent-deep border-accent-deep'
}
