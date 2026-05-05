import { useMemo } from 'react'
import { augments, gameConfig } from '../data'
import PickerModal from './PickerModal'
import {
  TooltipFooter,
  TooltipHeader,
  TooltipSection,
  TooltipSectionHeader,
} from './Tooltip'
import type { AngelicAugment } from '../types'

const SORTED_AUGMENTS: AngelicAugment[] = [...augments].sort((a, b) =>
  a.name.localeCompare(b.name),
)

interface Props {
  currentId: string | null
  onClose: () => void
  onSelect: (id: string | null) => void
}

export default function AugmentPickerModal({
  currentId,
  onClose,
  onSelect,
}: Props) {
  // Searchable picker for angelic augments. Each row shows the augment name + trigger note; the hover tooltip previews the level-1 stat block, proc/cost metadata and any "ranged-only" caveat so you can pick informed without committing first. Used from ItemConfigurator's AugmentSection.
  const items = SORTED_AUGMENTS

  const noneRow = useMemo(
    () => ({ label: '— remove augment —', isCurrent: currentId == null }),
    [currentId],
  )

  return (
    <PickerModal<AngelicAugment>
      eyebrow={<>Angelic Augment</>}
      title="Pick Augment"
      searchPlaceholder="Search by name, trigger, or stat…"
      items={items}
      getId={(a) => a.id}
      searchText={(a) =>
        `${a.name} ${a.triggerNote} ${a.description} ${a.primaryStats.join(
          ' ',
        )}`
      }
      currentId={currentId}
      tooltipTone="angelic"
      noneRow={currentId ? noneRow : undefined}
      statusText={
        currentId
          ? `Currently equipped: ${
              items.find((a) => a.id === currentId)?.name ?? currentId
            }`
          : 'No augment equipped'
      }
      onClose={onClose}
      onSelect={onSelect}
      renderRow={(a) => (
        <div
          className="grid items-center gap-3"
          style={{ gridTemplateColumns: '32px 1fr auto' }}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-yellow-200/40 text-[14px] text-yellow-200"
            style={{
              background:
                'radial-gradient(circle, rgba(254,240,138,0.18), rgba(13,11,7,0.9) 70%)',
            }}
          >
            ☼
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-yellow-200">
              {a.name}
            </span>
            <span className="block truncate font-mono text-[10px] text-muted">
              {a.triggerNote}
            </span>
          </span>
          <span className="shrink-0 text-right font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
            {a.rangedOnly ? 'Ranged Only' : a.trigger.replace(/_/g, ' ')}
          </span>
        </div>
      )}
      renderTooltip={(a) => {
        const tier = a.levels[0]
        return (
          <>
            <TooltipHeader
              tone="angelic"
              title={a.name}
              subtitle={a.triggerNote}
            />
            {a.description && (
              <TooltipSection>
                <p className="text-[12px] text-text/90 leading-snug">
                  {a.description}
                </p>
              </TooltipSection>
            )}
            {tier && Object.keys(tier.stats).length > 0 && (
              <TooltipSection>
                <TooltipSectionHeader tone="orange">
                  Level 1 Stats
                </TooltipSectionHeader>
                <ul className="space-y-0.5 text-[12px]">
                  {Object.entries(tier.stats).map(([key, val]) => {
                    const def = gameConfig.stats.find((s) => s.key === key)
                    const label = def?.name ?? key
                    const sign = (val as number) >= 0 ? '+' : ''
                    const suffix = def?.format === 'percent' ? '%' : ''
                    return (
                      <li key={key} className="flex justify-between">
                        <span className="text-text/80">{label}</span>
                        <span className="text-yellow-200 font-mono tabular-nums">
                          {sign}
                          {val as number}
                          {suffix}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </TooltipSection>
            )}
            {tier &&
              (tier.procChance != null ||
                tier.procDurationSec != null ||
                tier.cost != null) && (
                <TooltipSection>
                  <TooltipSectionHeader tone="muted">
                    Proc / Cost
                  </TooltipSectionHeader>
                  <ul className="space-y-0.5 text-[11px]">
                    {tier.procChance != null && (
                      <li className="flex justify-between">
                        <span className="text-muted">Proc chance</span>
                        <span className="font-mono">{tier.procChance}%</span>
                      </li>
                    )}
                    {tier.procDurationSec != null && (
                      <li className="flex justify-between">
                        <span className="text-muted">Duration</span>
                        <span className="font-mono">
                          {tier.procDurationSec}s
                        </span>
                      </li>
                    )}
                    {tier.cost != null && (
                      <li className="flex justify-between">
                        <span className="text-muted">Cost</span>
                        <span className="font-mono">{tier.cost} keys</span>
                      </li>
                    )}
                  </ul>
                </TooltipSection>
              )}
            {a.rangedOnly && (
              <TooltipSection>
                <p className="text-[10px] text-orange-300 italic">
                  Effect only applies with a ranged weapon equipped.
                </p>
              </TooltipSection>
            )}
            <TooltipFooter>
              {a.levels.length} level{a.levels.length === 1 ? '' : 's'}
            </TooltipFooter>
          </>
        )
      }}
    />
  )
}
