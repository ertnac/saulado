import { useReducedMotion } from 'framer-motion'

/**
 * Whether a mark may draw itself on.
 *
 * `MotionConfig reducedMotion="user"` in `main.tsx` covers most of the app, but it
 * suppresses *transform and layout* animation specifically — it deliberately lets
 * opacity through so nothing ends up invisible. A chart drawing on with
 * `pathLength` or `strokeDashoffset` is neither a transform nor a layout change,
 * so the global would let it keep moving for a user who asked for stillness.
 *
 * There is a second reason charts ask rather than trusting the global: a mark
 * caught mid-draw is a mark showing the wrong value. Stillness here has to mean
 * "already finished", never "frozen at zero".
 *
 * Pass the result straight into `initial`: `false` tells framer to skip the enter
 * animation and render at the `animate` values, which is exactly the finished
 * state.
 *
 *     const drawOn = useDrawOn()
 *     <motion.polyline initial={drawOn ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} />
 */
export function useDrawOn(): boolean {
  return !useReducedMotion()
}
