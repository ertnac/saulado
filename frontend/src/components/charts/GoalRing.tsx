import type { ReactElement } from 'react'

/**
 * The daily goal ring (plan §5.2).
 *
 * Genuine geometry, so genuinely SVG. A circle with a dash pattern is the whole
 * implementation: `strokeDasharray` set to the circumference, `strokeDashoffset`
 * to the unfinished remainder.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not animate.** Not because of `prefers-reduced-motion` per se, but
 *   because there is nothing to animate *to* — the ring renders once at the
 *   value it already has. A sweep on mount would be decoration that a reduced-
 *   motion user then has to have suppressed.
 * - **It does not fill past 100%.** Overshooting the ring makes a 40-review day
 *   look identical to a 20-review one against a goal of 20. The count beside it
 *   carries the excess, and the goal is met either way.
 *
 * The ring itself is `aria-hidden`; the label beside it is the accessible text.
 * A screen reader gets "12 of 20 reviews", which is the entire content.
 */

const SIZE = 72
const STROKE = 7
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface GoalRingProps {
  value: number
  goal: number
  /** Latched server-side, so a lowered goal cannot revoke a day already earned. */
  met: boolean
}

export function GoalRing({ value, goal, met }: GoalRingProps): ReactElement {
  // A goal of zero would divide by zero and, more to the point, cannot be
  // missed — treat it as complete rather than as an error state.
  const fraction = goal <= 0 ? 1 : Math.min(1, value / goal)

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
          aria-hidden="true"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-surface-muted"
          />
          {fraction > 0 && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              // Rotated so the arc starts at twelve o'clock. SVG angles begin at
              // three, and a progress ring that starts on the right reads as
              // already part-finished.
              transform={`rotate(-90 ${String(SIZE / 2)} ${String(SIZE / 2)})`}
              className={met ? 'stroke-success' : 'stroke-primary'}
            />
          )}
        </svg>

        {/*
          HTML on top rather than an SVG <text>, so it renders at its natural
          size and inherits the app's font rather than being scaled by the
          viewBox transform.
        */}
        <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums">
          {value}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium">
          {met ? 'Daily goal met' : `${String(value)} of ${String(goal)} reviews`}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {met
            ? `Goal is ${String(goal)} a day.`
            : /*
                Framed as what remains, not as what is missing. "8 to go" is the
                same arithmetic as "you are 8 short" and reads completely
                differently (plan §5.2: avoid loss-framing).
              */
              `${String(Math.max(0, goal - value))} to go today.`}
        </p>
      </div>
    </div>
  )
}
