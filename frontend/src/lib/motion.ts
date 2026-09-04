/**
 * Every timing value the app is allowed to use.
 *
 * The landing page established this vocabulary by hand and then repeated it —
 * the same bezier array appears roughly fifteen times in that one file, beside
 * hand-written durations that drifted apart. Motion that is retyped per call
 * site is motion that stops matching, so the numbers live here and the call
 * sites name them.
 *
 * Nothing in here is a component. The three wrappers in `components/motion/`
 * are the only place these are turned into behaviour.
 */

/**
 * The curve the landing page established, for enter and exit alike.
 *
 * Typed as a mutable 4-tuple rather than `as const`: framer's `BezierDefinition`
 * is a mutable tuple, and a `readonly` one is not assignable to it.
 */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

/**
 * Overshoot. Controls only — a button, a chip, a toggle.
 *
 * Never a data mark. A bar that overshoots its value is misreporting the data
 * for as long as the animation runs, and a reader glancing at the wrong moment
 * reads the wrong number.
 */
export const EASE_SQUISH: [number, number, number, number] = [0.34, 1.56, 0.64, 1]

export const DUR = { fast: 0.15, base: 0.22, slow: 0.32, page: 0.45 } as const

export const SPRING = { type: 'spring', stiffness: 350, damping: 25, mass: 0.6 } as const

/**
 * Exit runs faster than enter: a leaving element must not delay the next screen.
 * A symmetric exit is the most common reason an interface that animates well in
 * isolation feels sluggish in use.
 */
export const EXIT_FACTOR = 0.6

/** The one enter transition, so a fade-and-rise cannot drift between screens. */
export const fadeRise = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
}

/**
 * Parent variants for a staggered list or grid.
 *
 * The *total* reveal time is clamped rather than the per-item delay being fixed:
 * a twelve-item grid at a flat 0.06s each takes 0.72s to finish, which does not
 * read as choreography, it reads as the page struggling to load. Long lists
 * tighten their stagger until the whole reveal fits inside 0.4s.
 */
export const staggerParent = (
  count: number,
): { hidden: Record<string, never>; shown: { transition: { staggerChildren: number } } } => ({
  hidden: {},
  shown: { transition: { staggerChildren: Math.min(0.04, 0.4 / Math.max(count, 1)) } },
})
