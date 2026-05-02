import { useEffect, useMemo, useRef, useState } from 'react'
import changelogMd from '../../CHANGELOG.md?raw'
import { useBuild } from '../store/build'
import {
  inTauriRuntime,
  installUpdateOnQuit,
} from '../utils/installUpdate'
import { getSavedBuild } from '../utils/savedBuilds'
import { readStorage } from '../utils/storage'
import {
  APP_VERSION,
  BUILD_CHANNEL,
  GITHUB_REPO,
  UpdateCheckError,
  checkForUpdate,
  isMockEnabled,
  type UpdateInfo,
} from '../utils/version'
import UpdateModal from './UpdateModal'

const AUTO_INSTALL_KEY = 'hsplanner.update.auto_install'

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; info: UpdateInfo }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'error'; message: string }

export default function BottomBar() {
  const activeBuildId = useBuild((s) => s.activeBuildId)
  const savedBuildsVersion = useBuild((s) => s.savedBuildsVersion)
  const buildName = useMemo(() => {
    if (!activeBuildId) return 'Unnamed'
    const b = getSavedBuild(activeBuildId)
    return b?.name ?? 'Unnamed'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBuildId, savedBuildsVersion])

  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })
  const [modalOpen, setModalOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)

  const changelogInfo = useMemo<UpdateInfo>(
    () => ({
      current: APP_VERSION,
      latest: APP_VERSION,
      hasUpdate: false,
      body: changelogMd,
      releaseName: `HSPlanner v${APP_VERSION}`,
    }),
    [],
  )
  const abortRef = useRef<AbortController | null>(null)
  const transientTimer = useRef<number | null>(null)
  const checkRef = useRef<CheckState>(check)
  useEffect(() => {
    checkRef.current = check
  }, [check])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (transientTimer.current !== null)
        window.clearTimeout(transientTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!inTauriRuntime()) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      if (cancelled) return
      const win = getCurrentWindow()
      unlisten = await win.onCloseRequested(async (event) => {
        const auto = readStorage(AUTO_INSTALL_KEY) === '1'
        const cur = checkRef.current
        if (!auto || cur.kind !== 'available') return
        event.preventDefault()
        try {
          await installUpdateOnQuit()
        } catch {
          // If install fails, fall through and exit anyway so the close
          // request the user issued is still honoured.
        }
        const { exit } = await import('@tauri-apps/plugin-process')
        await exit(0)
      })
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const scheduleRevert = (delayMs: number) => {
    if (transientTimer.current !== null)
      window.clearTimeout(transientTimer.current)
    transientTimer.current = window.setTimeout(
      () => setCheck({ kind: 'idle' }),
      delayMs,
    )
  }

  const onCheck = async () => {
    if (check.kind === 'checking') return
    if (transientTimer.current !== null) {
      window.clearTimeout(transientTimer.current)
      transientTimer.current = null
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setCheck({ kind: 'checking' })
    try {
      const info = await checkForUpdate(ctrl.signal)
      if (ctrl.signal.aborted) return
      if (info.hasUpdate) {
        setCheck({ kind: 'available', info })
      } else {
        setCheck({ kind: 'ok', info })
        scheduleRevert(4000)
      }
    } catch (err) {
      if (ctrl.signal.aborted) return
      const message =
        err instanceof UpdateCheckError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Check failed'
      setCheck({ kind: 'error', message })
      scheduleRevert(5000)
    }
  }

  const hasRepo = GITHUB_REPO.length > 0 || isMockEnabled()

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-border bg-panel px-3 text-[11px] text-muted">
      <span className="font-mono tracking-[0.08em] text-accent-deep">
        HSPLANNER
      </span>
      <button
        type="button"
        onClick={() => setChangelogOpen(true)}
        title="View changelog"
        className="font-mono text-faint transition-colors hover:text-accent-hot cursor-pointer"
      >
        v{APP_VERSION}
      </button>
      <BuildChannelBadge channel={BUILD_CHANNEL} />

      <UpdateBadge
        state={check}
        hasRepo={hasRepo}
        onCheck={onCheck}
        onOpenModal={() => setModalOpen(true)}
      />

      {modalOpen && check.kind === 'available' && (
        <UpdateModal
          info={check.info}
          onClose={() => setModalOpen(false)}
          onSkipVersion={() => setCheck({ kind: 'idle' })}
        />
      )}

      {changelogOpen && (
        <UpdateModal
          info={changelogInfo}
          mode="changelog"
          onClose={() => setChangelogOpen(false)}
        />
      )}

      <span className="ml-auto flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-stat-green shadow-[0_0_6px_rgba(116,201,138,0.6)]" />
        Auto-saved
      </span>
      <span className="hidden sm:flex items-center gap-1.5">
        Build: <span className="font-mono text-text">{buildName}</span>
      </span>
      <span className="hidden lg:inline text-faint">
        Pan: drag · Zoom: scroll · Allocate: click
      </span>
    </footer>
  )
}

function UpdateBadge({
  state,
  hasRepo,
  onCheck,
  onOpenModal,
}: {
  state: CheckState
  hasRepo: boolean
  onCheck: () => void
  onOpenModal: () => void
}) {
  if (!hasRepo) {
    return (
      <button
        type="button"
        disabled
        title="Set GITHUB_REPO in src/utils/version.ts to enable update checks"
        className="rounded-[3px] border border-border bg-panel-2/40 px-2 py-0.5 text-faint cursor-not-allowed"
      >
        Check for updates
      </button>
    )
  }

  if (state.kind === 'checking') {
    return <span className="font-mono text-faint">Checking…</span>
  }

  if (state.kind === 'ok') {
    return (
      <span className="inline-flex items-center gap-1.5 text-stat-green">
        <span aria-hidden>✓</span>
        Up to date
      </span>
    )
  }

  if (state.kind === 'available') {
    const label = `v${state.info.latest} available`
    return (
      <button
        type="button"
        onClick={onOpenModal}
        title={state.info.releaseName ?? label}
        className="btn-primary-gold inline-flex items-center gap-1 rounded-[3px] px-2 py-0.5 text-[11px] font-mono"
      >
        <span aria-hidden>↑</span>
        {label}
      </button>
    )
  }

  if (state.kind === 'error') {
    return (
      <span className="font-mono text-stat-red" title={state.message}>
        × Check failed
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onCheck}
      className="rounded-[3px] border border-border bg-panel-2 px-2 py-0.5 text-text transition-colors hover:border-accent-deep hover:text-accent-hot"
    >
      Check
    </button>
  )
}

function BuildChannelBadge({ channel }: { channel: 'dev' | 'stable' }) {
  const isDev = channel === 'dev'
  const label = isDev ? 'DEV' : 'STABLE'
  const className = isDev
    ? 'border-accent-deep/40 bg-accent-deep/10 text-accent-hot'
    : 'border-stat-green/40 bg-stat-green/10 text-stat-green'
  return (
    <span
      title={isDev ? 'Development build' : 'Stable build'}
      className={`rounded-[3px] border px-1.5 py-px font-mono text-[9px] tracking-[0.14em] ${className}`}
    >
      {label}
    </span>
  )
}
