import { useCallback, useEffect, useMemo, useState } from 'react'
import { getClass } from '../data'
import { useBuild } from '../store/build'
import {
  applyHero,
  defaultSaveDir,
  isTauri,
  listSaveDir,
  pickSaveFile,
  pickSaveFolder,
  readSaveFile,
  type ApplyHeroPayload,
  type SaveFileSummary,
} from '../utils/gameSave'

interface FormState {
  name: string
  level: string
  heroLevel: string
  hardcore: boolean
  wormholeLevel: string
  chaosTowersCleared: string
  classId: string
  applyClass: boolean
  applyName: boolean
  applyLevel: boolean
  applyHeroLevel: boolean
  applyHardcore: boolean
  applyWormhole: boolean
  applyChaos: boolean
}

function defaultFormFromSummary(
  summary: SaveFileSummary | null,
  buildLevel: number,
  buildClassGameId: number | null,
): FormState {
  const hero = summary?.hero
  return {
    name: hero?.name ?? '',
    level: String(hero?.level ?? buildLevel),
    heroLevel: String(hero?.hero_level ?? 0),
    hardcore: hero?.hardcore ?? false,
    wormholeLevel: String(hero?.wormhole_level ?? 0),
    chaosTowersCleared: String(hero?.chaos_towers_cleared ?? 0),
    classId: String(buildClassGameId ?? hero?.class_id ?? ''),
    applyClass: buildClassGameId != null,
    applyName: false,
    applyLevel: true,
    applyHeroLevel: false,
    applyHardcore: false,
    applyWormhole: false,
    applyChaos: false,
  }
}

export default function GameSaveView() {
  const buildLevel = useBuild((s) => s.level)
  const buildClassId = useBuild((s) => s.classId)
  const buildClass = buildClassId ? getClass(buildClassId) : undefined
  const buildClassGameId = buildClass?.gameClassId ?? null

  const tauri = useMemo(() => isTauri(), [])
  const [folder, setFolder] = useState<string | null>(null)
  const [folderInput, setFolderInput] = useState('')
  const [slots, setSlots] = useState<SaveFileSummary[]>([])
  const [selected, setSelected] = useState<SaveFileSummary | null>(null)
  const [form, setForm] = useState<FormState>(() =>
    defaultFormFromSummary(null, buildLevel, buildClassGameId),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const refreshFolder = useCallback(async (dir: string) => {
    setBusy(true)
    setError(null)
    try {
      const list = await listSaveDir(dir)
      setSlots(list)
      if (list.length === 0) {
        setInfo('Folder znaleziony, ale nie zawiera plików herosiege{N}.hss.')
      } else {
        setInfo(null)
      }
    } catch (err) {
      setError(String(err))
      setSlots([])
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!tauri) return
    let cancelled = false
    defaultSaveDir()
      .then((dir) => {
        if (cancelled || !dir) return
        setFolder(dir)
        setFolderInput(dir)
        refreshFolder(dir)
      })
      .catch((err) => setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [tauri, refreshFolder])

  useEffect(() => {
    setForm(defaultFormFromSummary(selected, buildLevel, buildClassGameId))
  }, [selected, buildLevel, buildClassGameId])

  const onPickFolder = async () => {
    setError(null)
    try {
      const picked = await pickSaveFolder(folder ?? undefined)
      if (!picked) return
      setFolder(picked)
      setFolderInput(picked)
      await refreshFolder(picked)
    } catch (err) {
      setError(String(err))
    }
  }

  const onUseFolderInput = async () => {
    if (!folderInput) return
    setFolder(folderInput)
    await refreshFolder(folderInput)
  }

  const onPickFile = async () => {
    setError(null)
    try {
      const picked = await pickSaveFile(folder ?? undefined)
      if (!picked) return
      const summary = await readSaveFile(picked)
      setSelected(summary)
      setSlots((prev) => {
        const others = prev.filter((s) => s.path !== summary.path)
        return [...others, summary].sort(
          (a, b) => (a.slot ?? 99) - (b.slot ?? 99),
        )
      })
    } catch (err) {
      setError(String(err))
    }
  }

  const onSelectSlot = async (summary: SaveFileSummary) => {
    setError(null)
    setInfo(null)
    try {
      const fresh = await readSaveFile(summary.path)
      setSelected(fresh)
    } catch (err) {
      setError(String(err))
    }
  }

  const onApply = async () => {
    if (!selected) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const intInRange = (raw: string, min: number, max: number, label: string) => {
        const n = Number.parseInt(raw, 10)
        if (!Number.isFinite(n)) {
          throw new Error(`${label} musi być liczbą całkowitą.`)
        }
        if (n < min || n > max) {
          throw new Error(`${label} musi być w zakresie ${min}–${max}.`)
        }
        return n
      }

      const payload: ApplyHeroPayload = {}
      if (form.applyClass) {
        payload.class_id = intInRange(form.classId, 0, 999, 'Class ID')
      }
      if (form.applyName) {
        const trimmed = form.name.trim()
        if (trimmed.length === 0 || trimmed.length > 32) {
          throw new Error('Nazwa musi mieć 1–32 znaków.')
        }
        payload.name = trimmed
      }
      if (form.applyLevel) {
        payload.level = intInRange(form.level, 1, 999, 'Level')
      }
      if (form.applyHeroLevel) {
        payload.hero_level = intInRange(form.heroLevel, 0, 9999, 'Hero level')
      }
      if (form.applyHardcore) payload.hardcore = form.hardcore
      if (form.applyWormhole) {
        payload.wormhole_level = intInRange(
          form.wormholeLevel,
          0,
          9999,
          'Wormhole level',
        )
      }
      if (form.applyChaos) {
        payload.chaos_towers_cleared = intInRange(
          form.chaosTowersCleared,
          0,
          9_999_999,
          'Chaos towers cleared',
        )
      }

      if (Object.keys(payload).length === 0) {
        setInfo('Nie zaznaczono żadnego pola do zapisu.')
        return
      }

      const updated = await applyHero(selected.path, payload)
      setInfo(
        `Zapisano: ${updated.name}, lvl ${updated.level} (klasa ${updated.class_id})`,
      )
      const fresh = await readSaveFile(selected.path)
      setSelected(fresh)
      if (folder) await refreshFolder(folder)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!tauri) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 text-[13px]">
        <h1 className="text-base font-semibold text-text">Game Save File</h1>
        <p className="text-muted">
          Eksport do pliku save Hero Siege jest dostępny tylko w wersji desktop
          (Tauri). Uruchom aplikację przez <code>npm run tauri:dev</code> lub
          zainstalowany build, by edytować plik <code>.hss</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 text-[13px]">
      <header className="space-y-1">
        <h1 className="text-base font-semibold text-text">Game Save File</h1>
        <p className="text-muted">
          Wybierz folder z plikami <code>herosiege{'{N}'}.hss</code> lub
          pojedynczy plik save i zaaplikuj wybrane pola z aktualnego buildu.
          Ekwipunek nie jest jeszcze nadpisywany — wymaga mapowania ID
          przedmiotów na natywne ID gry.
        </p>
      </header>

      <section className="rounded border border-border bg-panel p-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-faint">
          Folder save
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
            placeholder="np. C:\Users\...\AppData\Local\Hero_Siege\hs2saves"
            className="flex-1 rounded border border-border bg-panel-2 px-2 py-1 text-text outline-none focus:border-accent"
          />
          <button
            onClick={onUseFolderInput}
            disabled={busy || !folderInput}
            className="rounded border border-border bg-panel-2 px-3 py-1 text-text hover:border-accent disabled:opacity-50"
          >
            Wczytaj
          </button>
          <button
            onClick={onPickFolder}
            disabled={busy}
            className="rounded border border-border bg-panel-2 px-3 py-1 text-text hover:border-accent disabled:opacity-50"
          >
            Wybierz folder…
          </button>
          <button
            onClick={onPickFile}
            disabled={busy}
            className="rounded border border-border bg-panel-2 px-3 py-1 text-text hover:border-accent disabled:opacity-50"
          >
            Wybierz plik .hss…
          </button>
        </div>
        {folder && (
          <div className="text-faint text-[12px]">
            Aktualny folder: <span className="text-text">{folder}</span>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <div className="rounded border border-border bg-panel p-2 space-y-1 max-h-[420px] overflow-auto">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-faint px-1 pb-1">
            Sloty ({slots.length})
          </div>
          {slots.length === 0 && (
            <div className="text-muted px-1">Brak slotów.</div>
          )}
          {slots.map((s) => {
            const active = selected?.path === s.path
            return (
              <button
                key={s.path}
                onClick={() => onSelectSlot(s)}
                className={`w-full rounded border px-2 py-1.5 text-left transition-colors ${
                  active
                    ? 'border-accent bg-panel-2 text-text'
                    : 'border-transparent bg-panel-2 text-muted hover:text-text hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Slot {s.slot ?? '?'}</span>
                  {s.hero?.hardcore && (
                    <span className="text-[10px] uppercase tracking-[0.1em] text-accent-deep">
                      HC
                    </span>
                  )}
                </div>
                <div className="text-[12px]">
                  {s.hero ? (
                    <>
                      <span className="text-text">{s.hero.name}</span>
                      <span className="text-faint"> · lvl {s.hero.level}</span>
                      <span className="text-faint">
                        {' '}
                        · cls {s.hero.class_id}
                      </span>
                    </>
                  ) : (
                    <span className="text-faint italic">brak danych</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="rounded border border-border bg-panel p-3 space-y-3">
          {!selected ? (
            <div className="text-muted">Wybierz slot lub plik .hss.</div>
          ) : (
            <>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-faint break-all">
                {selected.path}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <FieldRow
                  label="Class ID (game)"
                  toggle={form.applyClass}
                  onToggle={(v) => setForm({ ...form, applyClass: v })}
                  hint={
                    buildClassGameId == null
                      ? 'Brak mapowania w danych klasy — wpisz ID ręcznie.'
                      : `Z buildu: ${buildClassGameId} (${buildClass?.name})`
                  }
                >
                  <input
                    type="number"
                    value={form.classId}
                    onChange={(e) =>
                      setForm({ ...form, classId: e.target.value })
                    }
                    className="w-full rounded border border-border bg-panel-2 px-2 py-1 text-text outline-none focus:border-accent"
                  />
                </FieldRow>

                <FieldRow
                  label="Name"
                  toggle={form.applyName}
                  onToggle={(v) => setForm({ ...form, applyName: v })}
                >
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    className="w-full rounded border border-border bg-panel-2 px-2 py-1 text-text outline-none focus:border-accent"
                  />
                </FieldRow>

                <FieldRow
                  label="Level"
                  toggle={form.applyLevel}
                  onToggle={(v) => setForm({ ...form, applyLevel: v })}
                  hint={`Z buildu: ${buildLevel}`}
                >
                  <input
                    type="number"
                    value={form.level}
                    onChange={(e) =>
                      setForm({ ...form, level: e.target.value })
                    }
                    className="w-full rounded border border-border bg-panel-2 px-2 py-1 text-text outline-none focus:border-accent"
                  />
                </FieldRow>

                <FieldRow
                  label="Hero Level"
                  toggle={form.applyHeroLevel}
                  onToggle={(v) => setForm({ ...form, applyHeroLevel: v })}
                >
                  <input
                    type="number"
                    value={form.heroLevel}
                    onChange={(e) =>
                      setForm({ ...form, heroLevel: e.target.value })
                    }
                    className="w-full rounded border border-border bg-panel-2 px-2 py-1 text-text outline-none focus:border-accent"
                  />
                </FieldRow>

                <FieldRow
                  label="Wormhole Level"
                  toggle={form.applyWormhole}
                  onToggle={(v) => setForm({ ...form, applyWormhole: v })}
                >
                  <input
                    type="number"
                    value={form.wormholeLevel}
                    onChange={(e) =>
                      setForm({ ...form, wormholeLevel: e.target.value })
                    }
                    className="w-full rounded border border-border bg-panel-2 px-2 py-1 text-text outline-none focus:border-accent"
                  />
                </FieldRow>

                <FieldRow
                  label="Chaos Towers"
                  toggle={form.applyChaos}
                  onToggle={(v) => setForm({ ...form, applyChaos: v })}
                >
                  <input
                    type="number"
                    value={form.chaosTowersCleared}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        chaosTowersCleared: e.target.value,
                      })
                    }
                    className="w-full rounded border border-border bg-panel-2 px-2 py-1 text-text outline-none focus:border-accent"
                  />
                </FieldRow>

                <FieldRow
                  label="Hardcore"
                  toggle={form.applyHardcore}
                  onToggle={(v) => setForm({ ...form, applyHardcore: v })}
                >
                  <label className="flex items-center gap-2 px-1">
                    <input
                      type="checkbox"
                      checked={form.hardcore}
                      onChange={(e) =>
                        setForm({ ...form, hardcore: e.target.checked })
                      }
                    />
                    <span className="text-text">
                      {form.hardcore ? 'Yes' : 'No'}
                    </span>
                  </label>
                </FieldRow>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                <div className="text-faint text-[12px]">
                  Equipped items: {selected.equipped.length} (zachowane bez
                  zmian)
                </div>
                <button
                  onClick={onApply}
                  disabled={busy}
                  className="rounded border border-accent bg-accent/10 px-4 py-1.5 text-accent-hot font-medium hover:bg-accent/20 disabled:opacity-50"
                >
                  {busy ? 'Zapisuję…' : 'Zapisz do save'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-red-300 whitespace-pre-wrap">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="rounded border border-accent/40 bg-accent/10 p-3 text-accent-hot">
          {info}
        </div>
      )}
    </div>
  )
}

interface FieldRowProps {
  label: string
  toggle: boolean
  onToggle: (value: boolean) => void
  hint?: string
  children: React.ReactNode
}

function FieldRow({ label, toggle, onToggle, hint, children }: FieldRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={toggle}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="text-faint text-[11px] uppercase tracking-[0.08em]">
          {label}
        </span>
      </div>
      {children}
      {hint && <div className="text-faint text-[11px]">{hint}</div>}
    </div>
  )
}
