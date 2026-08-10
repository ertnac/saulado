import type { DashboardResponse, ProgressRange, ProgressResponse } from '@saulado/shared'

import { authorizedRequest } from './api'

/**
 * The dashboard and progress endpoints, one function each.
 *
 * A straight port of `frontend/src/services/progress.ts` — same paths, same
 * shapes. Every type comes from `@saulado/shared`, so a contract change is a
 * compile error rather than a chart quietly rendering `undefined`.
 */

export function getDashboard(): Promise<DashboardResponse> {
  return authorizedRequest<DashboardResponse>('/api/dashboard')
}

export function getProgress(range: ProgressRange): Promise<ProgressResponse> {
  return authorizedRequest<ProgressResponse>(`/api/progress?range=${range}`)
}
