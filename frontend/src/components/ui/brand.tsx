import { type ReactElement } from 'react'
import { cn } from '@/lib/utils'
import { SauladoIcon } from './saulado-logo'
export {
  SauladoLogo,
  SauladoIcon,
  SauladoLoader,
  type SauladoLogoProps,
  type SauladoLoaderProps,
  type StarAnimation,
} from './saulado-logo'

/**
 * The brand marks: logo, avatar, and the sprite-sheet animation.
 *
 * All three come out of `public/` rather than `src/assets/` because the logo is
 * also the favicon, and a favicon has to resolve from `index.html` where the
 * bundler's asset graph does not reach. One copy, one URL, both consumers.
 *
 * They are plain `<img>` and `<div>` rather than inline SVG on purpose: the
 * marks never take colour from the theme (sage and amber are the brand, in both
 * light and dark), so there is nothing for `currentColor` to do, and keeping
 * them out of the bundle keeps them cacheable across deploys.
 */

interface LogoProps {
  /** Renders the wordmark beside the mark. Off for tight spots like the nav rail. */
  withWordmark?: boolean
  className?: string
}

export function Logo({ withWordmark = false, className }: LogoProps): ReactElement {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <SauladoIcon size={32} className="h-8 w-8 shrink-0 select-none" />
      {withWordmark && <span className="font-semibold tracking-tight">Saulado</span>}
    </span>
  )
}

interface AvatarProps {
  /** Shown as the accessible name — the email, usually. */
  label: string
  className?: string
}

/**
 * The account avatar.
 *
 * Deliberately not the user's initial: the initial was a stand-in for an avatar
 * that did not exist, and one letter in a green disc identifies nothing in a
 * single-account view. The `title`/`label` carries the identity instead, which
 * works for a screen reader too.
 */
export function Avatar({ label, className }: AvatarProps): ReactElement {
  return (
    <img
      src="/saulado-avatar.svg"
      alt={label}
      width={36}
      height={36}
      decoding="async"
      className={cn(
        'h-9 w-9 shrink-0 select-none rounded-full object-cover ring-1 ring-border',
        className,
      )}
      draggable={false}
    />
  )
}

/**
 * The mascot: 8 frames of `public/saulado-mascot.svg`, waving.
 *
 * Purely decorative, so it is `aria-hidden` and takes no label — the opposite of
 * {@link BrainSprite}, which stands in for work in progress and therefore has to
 * announce itself. Here the welcome heading beside it already says everything
 * the mascot says, and a screen reader repeating it as "waving character" adds a
 * second thing to skip past on every dashboard visit.
 *
 * The hand is raised in every frame of the sheet, so the pose the animation
 * settles on is a still worth looking at rather than an arm caught mid-swing.
 */
export function MascotSprite({ className }: { className?: string }): ReactElement {
  return <span aria-hidden="true" className={cn('saulado-mascot shrink-0', className)} />
}

interface BrainSpriteProps {
  /**
   * What the animation is waiting on, announced politely.
   *
   * Required rather than optional: a spinner with no accessible name is a
   * decorative box to anyone who cannot see it move, and this one always stands
   * in for real work.
   */
  label: string
  className?: string
}

/**
 * The sprite-sheet animation — 8 frames of `public/saulado-sprite.svg`, stepped
 * through with `background-position` (see `.saulado-sprite` in `index.css`).
 *
 * A sprite sheet rather than a CSS transform on the logo because the frames are
 * hand-tuned: the brain breathes while the sparkle turns, and the two are out of
 * phase. `steps()` over a sheet gives that for one background-position property,
 * where matching it with keyframed transforms would need a element per moving
 * part.
 *
 * Reduced motion is handled in the stylesheet: the animation stops on the
 * resting frame rather than disappearing, so the layout does not change
 * (saulado-ux §6).
 */
export function BrainSprite({ label, className }: BrainSpriteProps): ReactElement {
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex', className)}>
      <span aria-hidden="true" className="saulado-sprite" />
      <span className="sr-only">{label}</span>
    </span>
  )
}
