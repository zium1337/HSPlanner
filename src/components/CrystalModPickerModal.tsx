import { crystalMods, FORGE_KIND_LABEL } from '../data'
import type { ForgeKind } from '../data'
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
  forgeKind: ForgeKind
  itemName: string
  onClose: () => void
  onSelect: (mod: Affix) => void
}

export default function CrystalModPickerModal({
  forgeKind,
  itemName,
  onClose,
  onSelect,
}: Props) {
  // Searchable picker for satanic-crystal forge mods. The list is the same data the inline search-popover used; this modal adds rich hover-tooltips with the full description and stat info. Used from ItemConfigurator's ForgedModsSection.
  const sourceLabel = FORGE_KIND_LABEL[forgeKind]

  return (
    <PickerModal<Affix>
      eyebrow={
        <>
          Forged Mod
          <span className="text-stat-red"> · {sourceLabel}</span>
        </>
      }
      title="Pick Forge Mod"
      searchPlaceholder={`Search ${sourceLabel} mods…`}
      items={crystalMods}
      getId={(m) => m.id}
      searchText={(m) =>
        `${m.name} ${m.description} ${m.statKey ?? ''} ${
          m.statKey ? statName(m.statKey) : ''
        }`
      }
      tooltipTone="satanic"
      statusText={`Forging onto ${itemName}`}
      onClose={onClose}
      onSelect={(id) => {
        if (!id) return
        const m = crystalMods.find((x) => x.id === id)
        if (m) onSelect(m)
      }}
      renderRow={(m) => (
        <div
          className="grid items-center gap-3"
          style={{ gridTemplateColumns: '32px 1fr auto' }}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-red-500/40 text-[12px] text-red-300"
            style={{
              background: 'linear-gradient(180deg, #2a1212, #0d0707)',
            }}
          >
            ◈
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-red-300">
              {m.name}
            </span>
            <span className="block truncate font-mono text-[10px] text-muted">
              {m.description}
            </span>
          </span>
          {m.statKey && (
            <span className="shrink-0 truncate text-right font-mono text-[10px] text-faint">
              {statName(m.statKey)}
            </span>
          )}
        </div>
      )}
      renderTooltip={(m) => (
        <>
          <TooltipHeader
            tone="satanic"
            title={m.name}
            subtitle={`${sourceLabel} · Forged Mod`}
          />
          <TooltipSection>
            <TooltipSectionHeader tone="red">Effect</TooltipSectionHeader>
            <p className="text-[12px] text-text/90">{m.description}</p>
          </TooltipSection>
          {m.statKey && (
            <TooltipSection>
              <TooltipSectionHeader tone="muted">Stat</TooltipSectionHeader>
              <div className="text-[12px] text-text/85">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Stat</span>
                  <span className="font-mono">{statName(m.statKey)}</span>
                </div>
                {m.valueMin !== null && m.valueMax !== null && (
                  <div className="mt-0.5 flex justify-between gap-3">
                    <span className="text-muted">Range</span>
                    <span className="font-mono">
                      {m.sign}
                      {m.valueMin}
                      {m.format === 'percent' ? '%' : ''} — {m.sign}
                      {m.valueMax}
                      {m.format === 'percent' ? '%' : ''}
                    </span>
                  </div>
                )}
              </div>
            </TooltipSection>
          )}
          <TooltipFooter>{sourceLabel} · Forged</TooltipFooter>
        </>
      )}
    />
  )
}
