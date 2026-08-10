import type { ReactElement } from 'react'
import { Text, View } from 'react-native'
import { renderCloze, type AnswerRange } from '@saulado/shared'
import { SLOT_FONT } from './blank-slot'

/**
 * The generated question, as study mode will render it — a port of
 * `frontend/src/features/cards/ClozePreview.tsx`.
 *
 * Built on the shared `renderCloze` rather than a local string replace, so what
 * the editor promises and what the study screen delivers cannot drift. That is
 * the whole payoff of deriving blanks instead of storing them.
 *
 * Blanks are fixed width. Sizing each one to its answer leaks the answer — the
 * difference between `_____` and `______________` is a free hint that measurably
 * degrades recall (saulado-ux §1.1). The preview showing proportional blanks
 * would be misleading even if study mode got it right, which is why the answer
 * length that `renderCloze` supplies is deliberately ignored here.
 *
 * Plain nested `<Text>`, not the `flex-row flex-wrap` that `study-card.tsx` uses:
 * that file wraps because it has `TextInput` views in the prose, and a preview has
 * nothing but text in it.
 */

const BLANK_WIDTH = 5

export function ClozePreview({
  paragraph,
  answers,
}: {
  paragraph: string
  answers: readonly AnswerRange[]
}): ReactElement {
  const segments = renderCloze(paragraph, answers)

  return (
    <View className="rounded-lg bg-surface-muted p-4">
      {segments.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          Your question will appear here as you highlight words.
        </Text>
      ) : (
        <Text style={{ fontSize: 17, lineHeight: 28 }} className="text-foreground">
          {segments.map((segment, index) =>
            segment.kind === 'text' ? (
              <Text key={`t${String(index)}`}>{segment.text}</Text>
            ) : (
              // Announced as "blank 2", not as its underscores: a screen reader
              // given the raw run reads "line line line line line" or skips it,
              // and neither conveys that there is a gap to fill. An
              // `accessibilityLabel` on the run replaces its children in the
              // accessibility tree, which is the whole trick — no second hidden
              // node, and so no stray character in the visible text.
              <Text
                key={`b${String(segment.ordinal)}`}
                accessibilityLabel={`blank ${String(segment.ordinal + 1)}`}
                style={{ fontFamily: SLOT_FONT }}
                className="text-muted-foreground"
              >
                {'_'.repeat(BLANK_WIDTH)}
                <Text style={{ fontSize: 11 }} className="font-semibold">
                  {segment.ordinal + 1}
                </Text>
              </Text>
            ),
          )}
        </Text>
      )}
    </View>
  )
}
