import type { ReactElement } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProgressSection } from './ProgressSection'

export function ProgressPage(): ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress"
        description="How your reviews have gone over time."
        className="mb-0"
      />
      <ProgressSection showHeader={false} />
    </div>
  )
}
