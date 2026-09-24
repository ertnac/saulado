import { Redirect, useLocalSearchParams } from 'expo-router'
import type { ReactElement } from 'react'

/**
 * Backward compatibility redirect for scan-review route.
 * Redirects to the first-class paste-cards route.
 */
export default function ScanReviewRedirect(): ReactElement {
  const params = useLocalSearchParams()
  return <Redirect href={{ pathname: '/paste-cards', params }} />
}
