import type { ReactElement, ReactNode } from 'react'
import { Text, View } from 'react-native'

/**
 * The frame every chart sits in — the counterpart of
 * `frontend/src/components/charts/ChartFigure.tsx`.
 *
 * The web version pairs the picture with a full `<table>` of the same numbers,
 * visually hidden. React Native has neither `<table>` nor `sr-only`, so the
 * table becomes **one visible sentence carrying the same figures**, and the
 * picture is hidden from the accessibility tree instead.
 *
 * That is not a downgrade of the contract, it is the same contract at phone
 * size: a chart is two things saying the same thing, and neither is a fallback
 * for the other. A 90-row table on a 375px screen would have been unusable by
 * everyone, so the sentence is what a screen reader reads *and* what a sighted
 * user reads under the picture.
 *
 * `accessibilityElementsHidden` is iOS and `importantForAccessibility` is
 * Android; both are needed, and neither is inherited by every child unless the
 * subtree is marked at the top, which is why they sit on one wrapper here rather
 * than on each bar.
 */
export function ChartFrame({
  caption,
  summary,
  children,
}: {
  caption: string
  /** One sentence with the same numbers the picture shows. Never a repeat of the caption. */
  summary: string
  children: ReactNode
}): ReactElement {
  return (
    <View className="gap-3">
      <Text className="text-sm font-medium text-foreground">{caption}</Text>

      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children}
      </View>

      <Text className="text-xs leading-relaxed text-muted-foreground">{summary}</Text>
    </View>
  )
}

/**
 * What a chart shows before there is anything to chart.
 *
 * Not a chart of zeroes. A brand-new user looking at 30 empty bars sees a month
 * of failure they had no opportunity to avoid (saulado-ux §5).
 */
export function ChartEmpty({
  caption,
  message,
}: {
  caption: string
  message: string
}): ReactElement {
  return (
    <View className="gap-3">
      <Text className="text-sm font-medium text-foreground">{caption}</Text>
      <View className="min-h-[128px] items-center justify-center rounded-xl border border-dashed border-border p-5">
        <Text className="text-center text-sm text-muted-foreground">{message}</Text>
      </View>
    </View>
  )
}
