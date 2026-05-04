function syncPct(input: HTMLInputElement): void {
  // Computes the current `(value - min) / (max - min)` percentage for a range input and writes it into the `--sl-pct` CSS custom property on the element. Used to power the gold gradient fill on the WebKit slider track, which has no native ::-moz-range-progress equivalent.
  const min = Number(input.min) || 0
  const max = Number(input.max) || 100
  const span = max - min
  const v = Number(input.value)
  const pct = span === 0 ? 0 : ((v - min) / span) * 100
  input.style.setProperty('--sl-pct', pct + '%')
}

function syncIfRange(node: Node): void {
  // For an arbitrary DOM node, syncs the `--sl-pct` value on the node itself if it is a range input and on every range descendant it contains. Used by the MutationObserver inside initRangeInputs whenever new subtrees appear in the document.
  if (!(node instanceof HTMLElement)) return
  if (node instanceof HTMLInputElement && node.type === 'range') {
    syncPct(node)
  }
  const ranges = node.querySelectorAll?.('input[type="range"]')
  ranges?.forEach((el) => syncPct(el as HTMLInputElement))
}

let initialized = false

export function initRangeInputs(): void {
  // Idempotent global setup that watches the document for range inputs and keeps their `--sl-pct` CSS variable in sync via an initial pass, delegated input/change listeners, and a MutationObserver tracking subtree and value/min/max attribute changes. Called once from main.tsx so every slider in the app renders its gold fill correctly across renders.
  if (initialized || typeof document === 'undefined') return
  initialized = true

  const initialPass = () => {
    document.querySelectorAll('input[type="range"]').forEach((el) => {
      syncPct(el as HTMLInputElement)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialPass, { once: true })
  } else {
    initialPass()
  }

  const onValueEvent = (e: Event) => {
    const t = e.target
    if (t instanceof HTMLInputElement && t.type === 'range') syncPct(t)
  }
  document.addEventListener('input', onValueEvent, true)
  document.addEventListener('change', onValueEvent, true)

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(syncIfRange)
      } else if (
        m.type === 'attributes' &&
        m.target instanceof HTMLInputElement &&
        m.target.type === 'range' &&
        (m.attributeName === 'value' ||
          m.attributeName === 'min' ||
          m.attributeName === 'max')
      ) {
        syncPct(m.target)
      }
    }
  })

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['value', 'min', 'max'],
    })
  } else {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['value', 'min', 'max'],
        })
      },
      { once: true },
    )
  }
}
