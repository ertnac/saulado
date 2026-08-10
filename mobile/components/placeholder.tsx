import type { ReactElement } from 'react'
import { Text, View } from 'react-native'

/**
 * A screen that routes but is not built yet.
 *
 * Phase 2 delivers navigation and auth; the screens behind the guard land in
 * Phases 3–5. They exist as files now because the route tree is what Phase 2 is
 * *for* — the tab bar, the guard redirect and the deep links cannot be tested
 * against routes that 404.
 *
 * A named placeholder rather than an empty `<View />`: an unfinished screen and a
 * broken one look identical when both are blank, and this one is going to be
 * tapped repeatedly while the guards are being checked.
 */
export function Placeholder({ title, phase }: { title: string; phase: string }): ReactElement {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-xl font-semibold text-foreground">{title}</Text>
      <Text className="mt-2 text-center text-sm text-muted-foreground">
        Not built yet — arrives in {phase}.
      </Text>
    </View>
  )
}
