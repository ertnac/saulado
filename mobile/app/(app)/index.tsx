import type { ReactElement } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { Button } from '../../components/button'
import { Placeholder } from '../../components/placeholder'

export default function DashboardScreen(): ReactElement {
  const router = useRouter()

  return (
    <View className="flex-1 bg-background">
      <Placeholder title="Dashboard" phase="Phase 5" />
      {/*
        ponytail: a temporary way into `/study`, which is `href: null` in the tab
        bar and has no caller until Phase 5 builds the real dashboard CTA with its
        due count. Delete this block then — it is a test harness, not a feature.
      */}
      <View className="px-6 pb-10">
        <Button
          label="Start studying"
          size="lg"
          onPress={() => {
            router.push('/study')
          }}
        />
      </View>
    </View>
  )
}
