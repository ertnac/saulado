import type { ReactElement, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { fadeRise, staggerParent } from '@/lib/motion'

/**
 * A list or grid whose children arrive one after another.
 *
 * Two components rather than one that maps over data: the parent holds the
 * stagger timing and the child holds the enter variant, and keeping them apart
 * is what lets a caller put the item wrapper on the element the list actually
 * needs. A card inside a `<ul>` has to be an `<li>` — a `<div>` between a list
 * and its items makes the list announce as empty — and a component that rendered
 * its own children could not honour that.
 *
 * `count` feeds the clamp in `staggerParent`, so pass the real length rather
 * than a guess: it is what stops a long list taking most of a second to finish
 * appearing.
 */

type Element = 'div' | 'ul' | 'ol' | 'section'
type ItemElement = 'div' | 'li' | 'article' | 'section'

export function Stagger({
  children,
  count,
  className,
  as = 'div',
}: {
  children: ReactNode
  count: number
  className?: string
  as?: Element
}): ReactElement {
  const Component = motion[as]

  return (
    <Component
      className={className}
      variants={staggerParent(count)}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '-10%' }}
    >
      {children}
    </Component>
  )
}

/**
 * One item in a `Stagger`.
 *
 * Carries no `initial` or `animate` of its own — the parent drives it by variant
 * name, which is the whole mechanism. Setting either here would detach the item
 * from the parent's timing and every item would appear at once.
 */
export function StaggerItem({
  children,
  className,
  as = 'div',
  layout = false,
}: {
  children: ReactNode
  className?: string
  as?: ItemElement
  /**
   * Opt in where the list reflows in place — a filter or sort change. Off by
   * default because layout animation costs a measurement pass per item on every
   * render, which a list that only ever appears once does not need.
   */
  layout?: boolean
}): ReactElement {
  const Component = motion[as]

  return (
    <Component className={className} variants={fadeRise} layout={layout}>
      {children}
    </Component>
  )
}
