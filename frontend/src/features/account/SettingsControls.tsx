import { useEffect, useId, useState, type ReactElement, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Reveal } from '@/components/motion/Reveal'
import { Select, fieldChipClass } from '@/components/ui/select'

/**
 * The controls the settings page is built from.
 *
 * Split out because each one carries a small behavioural rule that would be
 * invisible inline: a number input that must not save on every keystroke, a
 * toggle that has to be a real checkbox for screen readers, a timezone list that
 * cannot be hardcoded.
 */

export function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    /*
      Revealed as it scrolls in, and here rather than at each call site — every
      grouped card on the settings and account pages comes through this one
      component, so this is where "a Reveal per section" is a single edit rather
      than one per section that the next new section would then forget.
    */
    <Reveal>
      <Card as="section" className="space-y-5 p-5 sm:p-6">
        {/*
          Sentence case, matching `CardLabel`. Small all-caps is harder to read and
          the uppercase habit here came from the scaffold, not from the design.
        */}
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {children}
      </Card>
    </Reveal>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}): ReactElement {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * A labelled switch.
 *
 * A real `<input type="checkbox">` behind a styled span, not a `<div>` with
 * `role="switch"`. The native element brings the space-bar binding, the form
 * association and the checked state announcement for free — all three of which
 * hand-rolled switches routinely miss.
 */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}): ReactElement {
  const id = useId()

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      <input
        id={id}
        type="checkbox"
        /**
         * `role="switch"` over a native checkbox, not instead of one.
         *
         * The role changes the announcement from "checked" to "on/off", which is
         * what a preference actually is; keeping the real input keeps the
         * space-bar binding and the label association that a `<div role="switch">`
         * has to reimplement by hand.
         */
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked)
        }}
        className="mt-1 h-5 w-5 shrink-0 accent-primary"
      />
    </div>
  )
}

/**
 * A number setting that saves on blur, not on keystroke.
 *
 * Two reasons. Typing `120` passes through `1` and `12`, and saving those would
 * write two values the user never chose — with an optimistic patch, they would
 * also *see* them. And clearing the field to retype leaves it empty, which is
 * not a number at all.
 *
 * Out-of-range values are reported rather than silently clamped. Clamping is
 * quietly wrong here: someone who typed `0` meaning "pause reviews" gets `1` and
 * no explanation of why the app disagreed with them. The message names the range
 * so the next attempt is informed.
 */
export function NumberSetting({
  label,
  hint,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onCommit: (next: number) => void
}): ReactElement {
  const id = useId()
  const errorId = `${id}-error`
  const [text, setText] = useState(String(value))
  const [error, setError] = useState<string | null>(null)

  // Follows the server's value when it changes underneath — a rolled-back
  // optimistic patch, or another tab. Not a controlled-input fight: this only
  // fires when `value` actually changes, which typing does not do.
  useEffect(() => {
    setText(String(value))
  }, [value])

  function commit(): void {
    const parsed = Number.parseInt(text, 10)

    // An empty or unparseable field is a slip, not a choice — restore rather
    // than accuse. Out of range is a choice, and gets an explanation.
    if (Number.isNaN(parsed)) {
      setText(String(value))
      setError(null)
      return
    }

    if (parsed < min || parsed > max) {
      setError(`Pick a number between ${String(min)} and ${String(max)}.`)
      return
    }

    setError(null)
    if (parsed !== value) onCommit(parsed)
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setText(event.target.value)
          if (error) setError(null)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          // Enter commits without leaving the field — the obvious gesture, and
          // otherwise the value only saves once focus moves somewhere else.
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
        className={fieldChipClass('w-full aria-[invalid=true]:border-warning')}
      />
      <div aria-live="polite">
        {error && (
          <p id={errorId} className="text-sm text-warning">
            {error}
          </p>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * The IANA zone list, from the runtime.
 *
 * `Intl.supportedValuesOf('timeZone')` rather than a hardcoded array: the list
 * changes with the tz database — zones get renamed, and new ones appear — and a
 * frozen copy would eventually offer a name the server's `Intl` rejects, which is
 * the one failure this control must not produce.
 *
 * It is not in every runtime (Safari before 15.4, older Node), so a browser
 * without it gets a text input. That is honestly better than a short curated
 * list: someone in a zone the list omits could otherwise never enter it.
 */
function zoneList(): string[] | null {
  try {
    const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf
    return supported ? supported('timeZone') : null
  } catch {
    return null
  }
}

/**
 * The timezone setting.
 *
 * Load-bearing beyond display: the study queue's "today" and every daily-stats
 * row is computed in this zone, so a wrong value means cards are due at the
 * wrong hour and a streak breaks at the wrong midnight.
 */
export function TimezoneSetting({
  value,
  onCommit,
}: {
  value: string
  onCommit: (next: string) => void
}): ReactElement {
  const id = useId()
  const [zones] = useState(zoneList)
  const [text, setText] = useState(value)

  useEffect(() => {
    setText(value)
  }, [value])

  /**
   * The browser's own zone, offered as a shortcut.
   *
   * Shown only when it differs from what is stored, and never applied
   * automatically — a user who deliberately keeps their account on the zone they
   * study in should not have it rewritten by opening the page from an airport.
   */
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        Time zone
      </label>

      {zones ? (
        <Select
          id={id}
          value={value}
          onChange={(event) => {
            onCommit(event.target.value)
          }}
          className="w-full"
        >
          {/*
            The stored value is prepended when the runtime does not list it —
            a zone renamed since the account was created would otherwise render
            as a select showing the wrong entry, and changing anything else would
            silently save it.
          */}
          {!zones.includes(value) && <option value={value}>{value}</option>}
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      ) : (
        <input
          id={id}
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
          onBlur={() => {
            const next = text.trim()
            if (next && next !== value) onCommit(next)
            else setText(value)
          }}
          placeholder="Area/City"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={fieldChipClass('w-full')}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Decides when your study day rolls over.
        {detected && detected !== value && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => {
                onCommit(detected)
              }}
              className="font-medium text-foreground underline"
            >
              Use {detected}
            </button>
          </>
        )}
      </p>
    </div>
  )
}
