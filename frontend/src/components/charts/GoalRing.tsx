import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { useDrawOn } from '@/components/motion/useDrawOn'
import { DUR, EASE } from '@/lib/motion'

/**
 * The daily goal ring (plan §5.2).
 *
 * Genuine geometry, so genuinely SVG. A circle with a dash pattern is the whole
 * implementation: `strokeDasharray` set to the circumference, `strokeDashoffset`
 * to the unfinished remainder.
 *
 * **It sweeps to its value on mount**, which reverses this file's original
 * position. That position had two halves: there is nothing to animate *to*, and a
 * sweep would be decoration a reduced-motion user then has to have suppressed.
 * The second half no longer holds — `useDrawOn` suppresses it, and the ring
 * renders finished rather than frozen at zero. The first half was a judgement
 * call, and the clay redesign makes the other one: the ring is the figure the
 * dashboard exists to show, and a ring that fills is how a reader sees it is a
 * proportion rather than a picture.
 *
 * One thing it still deliberately does not do: **fill past 100%**. Overshooting
 * the ring makes a 40-review day look identical to a 20-review one against a goal
 * of 20. The count beside it carries the excess, and the goal is met either way.
 * The sweep uses `EASE`, never `EASE_SQUISH`, for the same reason — an overshoot
 * would momentarily draw a goal that was exceeded when it was only met.
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
  const drawOn = useDrawOn()

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
            <motion.circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              // Rotated so the arc starts at twelve o'clock. SVG angles begin at
              // three, and a progress ring that starts on the right reads as
              // already part-finished.
              transform={`rotate(-90 ${String(SIZE / 2)} ${String(SIZE / 2)})`}
              className={met ? 'stroke-success' : 'stroke-primary'}
              // A full offset is an empty ring, so the sweep runs from there to
              // the unfinished remainder that was previously rendered outright.
              initial={drawOn ? { strokeDashoffset: CIRCUMFERENCE } : false}
              animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - fraction) }}
              transition={{ duration: DUR.page, ease: EASE }}
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
