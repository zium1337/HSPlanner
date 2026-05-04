import {
  forwardRef,
  useId,
  useCallback,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'

type FormatFn = (v: number) => ReactNode

export interface SliderProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type'
  > {
  value?: number
  defaultValue?: number
  onChange?: (next: number, e: ChangeEvent<HTMLInputElement>) => void
  min?: number
  max?: number
  step?: number
  label?: ReactNode
  unit?: ReactNode
  ticks?: ReactNode[]
  variant?: 'red' | 'blue' | 'green'
  compact?: boolean
  format?: 'int' | 'pct' | `fixed:${number}` | FormatFn
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    value,
    defaultValue,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    unit,
    ticks,
    variant,
    compact = false,
    format,
    className = '',
    disabled,
    id: idProp,
    ...rest
  },
  ref,
) {
  // Themed range slider component supporting controlled or uncontrolled modes, custom value formatting (int / percent / fixed-decimals / function), optional label/unit/ticks, colour variants, and a compact layout. Used throughout the app for any percentage / numeric input that benefits from a visual track.
  const reactId = useId()
  const id = idProp ?? reactId
  const isControlled = value !== undefined
  const current = (isControlled ? value : (defaultValue ?? min)) as number
  const span = max - min
  const pct = span === 0 ? 0 : ((current - min) / span) * 100

  const formatValue = useCallback(
    (v: number): ReactNode => {
      // Renders the slider's current numeric value in the requested format. Supports a function for full custom rendering, "pct" / "int" presets, and "fixed:N" for fixed-decimal output. Used to render the value pill above the slider track.
      if (typeof format === 'function') return format(v)
      if (format === 'pct') return v + '%'
      if (format === 'int') return Math.round(v)
      if (typeof format === 'string' && format.startsWith('fixed:')) {
        return v.toFixed(+format.split(':')[1]! || 1)
      }
      return v
    },
    [format],
  )

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Forwards the native input change event to the consumer's `onChange` callback as a parsed number plus the original event. Used as the single change handler for both controlled and uncontrolled modes.
    onChange?.(Number(e.target.value), e)
  }

  const wrapClass = [
    'hs-slider',
    variant ?? '',
    compact ? 'compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={wrapClass}
      style={{ ['--sl-pct' as never]: pct + '%' }}
    >
      {(label != null || unit != null) && (
        <div className="hs-slider-head">
          {label != null && (
            <label htmlFor={id} className="hs-slider-label">
              {label}
            </label>
          )}
          <span className="hs-slider-value">
            <span>{formatValue(current)}</span>
            {unit != null && <span className="hs-slider-unit">{unit}</span>}
          </span>
        </div>
      )}
      <input
        ref={ref}
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        {...(isControlled
          ? { value, onChange: handleChange }
          : { defaultValue, onChange: handleChange })}
        {...rest}
      />
      {ticks && ticks.length > 0 && (
        <div className="hs-slider-ticks">
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      )}
    </div>
  )
})

export default Slider
