import { useState } from 'react'
import { useBuild } from '../store/build'
import { encodeBuildToShare } from '../utils/shareBuild'

type Status = 'idle' | 'copied' | 'error'

export default function ShareButton() {
  // Top-bar button that generates a compact, lz-string-encoded share code from the current build (and its notes) on first open, exposes it in a popover, and offers a one-click copy-to-clipboard with a transient "Copied!" / "Copy failed" status. Used as the primary entry point for sharing builds outside the app.
  const exportSnapshot = useBuild((s) => s.exportBuildSnapshot)
  const [status, setStatus] = useState<Status>('idle')
  const [code, setCode] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const generate = (): string => {
    // Encodes the current build snapshot and notes into a fresh share code, stores it in component state, and opens the popover. Used by the toggle and copy actions to lazily produce a code only when needed.
    const { notes } = useBuild.getState()
    const next = encodeBuildToShare(exportSnapshot(), notes)
    setCode(next)
    setOpen(true)
    setStatus('idle')
    return next
  }

  const onToggle = () => {
    // Opens the popover (generating a code if one isn't ready) or closes it when already open. Used as the click handler for the Share button.
    if (open) {
      setOpen(false)
      return
    }
    generate()
  }

  const onCopy = async () => {
    // Copies the (possibly just-generated) build code to the clipboard and toggles a transient "Copied!" / "Copy failed" status for 2.5 seconds. Used as the click handler for the Copy button inside the popover.
    const next = code ?? generate()
    try {
      await navigator.clipboard.writeText(next)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2500)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="btn-primary-gold inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1.5 text-xs font-medium"
        title="Generate shareable build code"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>

      {open && code && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[32rem] max-w-[90vw] rounded border border-border bg-panel p-3 text-xs shadow-lg">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted">
              Build code ({code.length} chars)
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted hover:text-text px-1"
              title="Close"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <textarea
            value={code}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            rows={5}
            className="w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono text-[11px] tabular-nums"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={onCopy}
              className="rounded border border-accent/50 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20"
            >
              {status === 'copied'
                ? 'Copied!'
                : status === 'error'
                  ? 'Copy failed'
                  : 'Copy code'}
            </button>
            <span className="text-[10px] text-muted">
              Paste into Builds → Import to load.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
