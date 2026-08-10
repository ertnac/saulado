import { useLocalSearchParams } from 'expo-router'
import type { ReactElement } from 'react'
import { Placeholder } from '../../../components/placeholder'

export default function SetDetailScreen(): ReactElement {
  const { setId } = useLocalSearchParams<{ setId: string }>()

  return <Placeholder title={`Set ${setId}`} phase="Phase 4" />
}
