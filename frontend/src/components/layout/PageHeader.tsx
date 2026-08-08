import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  /** A count or status pill shown beside the title. */
  badge?: ReactNode
  description?: ReactNode
  /** The screen's actions. At most one of them should be a filled CTA. */
  actions?: ReactNode
  className?: string
}

/**
 * The title block every screen opens with.
 *
 * The badge sits *outside* the `<h1>` on purpose. A count folded into the
 * heading changes its accessible name every time the number moves — "Sets 12"
 * one render and "Sets 13" the next — which breaks heading navigation for
 * anyone using it to find their place, and makes the heading unmatchable by
 * name. The heading stays the stable word; the number sits next to it.
 */
export function PageHeader({
  title,
  badge,
  description,
  actions,
  className,
}: PageHeaderProps): ReactElement {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
