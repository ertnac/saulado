import type { DashboardResponse, ProgressRange, ProgressResponse } from '@saulado/shared'
import { authorizedRequest } from './api'

/**
 * Typed wrappers over the dashboard and progress endpoints (plan §5.1).
 *
 * Thin like the rest of `services/` — every shape comes from `@saulado/shared`,
 * so a contract change is a compile error rather than a chart quietly rendering
 * `undefined`.
 */

export function getDashboard(): Promise<DashboardResponse> {
  return authorizedRequest<DashboardResponse>('/api/dashboard')
}

export function getProgress(range: ProgressRange): Promise<ProgressResponse> {
  return authorizedRequest<ProgressResponse>(`/api/progress?range=${range}`)
}
