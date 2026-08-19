import { forwardRef, type ReactElement } from 'react'
import { Platform, Text, TextInput, useWindowDimensions, View } from 'react-native'
import type { BlankResult, AnsweringType } from '@saulado/shared'

import { useTokenColor } from '../stores/theme'

/**
 * One blank, as an input before grading and as a verdict after — in the same box.
 *
 * This component is where plan §2.7's "no layout shift on reveal" is actually
 * paid for. The slot's width is computed once, from `answerLength`, and never
 * changes: the input, the correct answer and the canonical spelling all render
 * inside a container whose geometry was fixed before the user typed anything.
 *
 * Two invariants make that safe rather than merely hopeful:
 *
 * - `answerLength` is always at least as long as the canonical answer that will
 *   appear here. Under `fixed` mode it is the longest answer on the card; under
 *   `proportional` it is this answer's own length. So the revealed text fits the
 *   reserved width in both modes, and neither mode needs a fallback.
 * - The input and the verdict share one monospace face at one size, so
 *   `charWidth × N` is exactly N characters for both. In a proportional face a
 *   single measurement would be wrong for every character but the one measured.
 *
 * The web sizes the box in `ch` units. React Native has no `ch`, so the caller
 * measures one character of this exact face and passes the result down — see
 * `study-card.tsx`, which owns that measurement and gates the paragraph on it.
 *
 * What the user typed is *not* shown here when it was wrong — the slot shows the
 * canonical spelling, because that is the thing worth reading twice. The wrong
 * submission is echoed in the feedback panel instead, where it can be as long as
 * they made it without stretching the paragraph.
 */

/**
 * One face for both states, and a monospace one.
 *
 * `monospace` resolves on Android; iOS has no such alias and silently falls back
 * to the system face, which would make the measurement wrong by a few points per
 * character — enough to shift a line on reveal.
 */
export const SLOT_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' })

/** Matches `px-2` on both states, so the text area is exactly `answerLength` wide. */
const SLOT_PADDING = 16

/** Tall enough for a 44pt touch target once the paragraph's line height is added. */
export const SLOT_HEIGHT = 40

export const SLOT_FONT_SIZE = 16

interface BlankSlotProps {
  ordinal: number
  blankCount: number
  answerLength: number
  /** Width of one character of {@link SLOT_FONT} at {@link SLOT_FONT_SIZE}. */
  charWidth: number
  value: string
  /** `null` until this card is graded. */
  result: BlankResult | null
  disabled: boolean
  /** The last blank submits the card; the others move to the next one. */
  isLastBlank: boolean
  answeringType: AnsweringType
  onFocus: () => void
  onChange: (value: string) => void
  onSubmit: () => void
}

export const BlankSlot = forwardRef<TextInput, BlankSlotProps>(function BlankSlot(
  {
    ordinal,
    blankCount,
    answerLength,
    charWidth,
    value,
    result,
    disabled,
    isLastBlank,
    answeringType,
    onFocus,
    onChange,
    onSubmit,
  },
  ref,
): ReactElement {
  const { width: screenWidth } = useWindowDimensions()
  const border = useTokenColor('--border')
  const surface = useTokenColor('--surface')
  const foreground = useTokenColor('--foreground')
  const muted = useTokenColor('--muted-foreground')

  // A 40-character answer would otherwise reserve a box wider than the phone and
  // push the paragraph into a horizontal scroll. Clamping costs nothing: the box
  // is the same width in both states, so the reveal still does not shift.
  const width = Math.min(answerLength * charWidth + SLOT_PADDING, screenWidth - 80)
  const position = `Blank ${String(ordinal + 1)} of ${String(blankCount)}`

  if (result) {
    // `matchType` rather than `correct`: a typo counts as correct but still has to
    // show the canonical form, or the user rehearses their own misspelling.
    const showCanonical = result.matchType !== 'exact'

    return (
      <View
        accessibilityLabel={`${position}: ${result.canonical}, ${
          result.correct
            ? result.matchType === 'typo'
              ? `correct — spelled ${result.canonical}`
              : 'correct'
            : `incorrect — the answer was ${result.canonical}`
        }`}
        style={{ width, height: SLOT_HEIGHT }}
        // Green and red, not green and amber. Amber reads as "nearly", and the
        // one thing a graded blank has to be is unambiguous. Colour never stands
        // alone: the label above spells the verdict out for a screen reader, and
        // the feedback panel repeats it with an icon and a word.
        className={`mx-0.5 justify-center overflow-hidden rounded-md border px-2 ${
          result.correct ? 'border-success bg-success/10' : 'border-danger bg-danger/10'
        }`}
      >
        <Text
          numberOfLines={1}
          style={{ fontFamily: SLOT_FONT, fontSize: SLOT_FONT_SIZE }}
          className={result.correct ? 'text-success' : 'text-danger'}
        >
          {showCanonical ? result.canonical : result.submitted}
        </Text>
      </View>
    )
  }

  return (
    <TextInput
      ref={ref}
      value={value}
      editable={!disabled}
      accessibilityLabel={position}
      /*
        Every one of these is off for a recall test. A keyboard that autocompletes
        the answer, capitalises the first letter of a lowercase term, or rewrites
        a word it does not recognise is answering the question for the user —
        iOS turning "chloroplast" into something else and then being marked wrong
        is the worst thing this screen can do.
      */
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="off"
      spellCheck={false}
      showSoftInputOnFocus={answeringType !== 'multiple-choice'}
      onFocus={onFocus}
      // The last blank has nowhere to go, so its key checks the card instead.
      returnKeyType={isLastBlank ? 'done' : 'next'}
      // `submit` keeps focus and the keyboard up while the return key walks from
      // one blank to the next; dismissing it between blanks would make a
      // three-blank card three keyboard animations long.
      submitBehavior={isLastBlank ? 'blurAndSubmit' : 'submit'}
      onSubmitEditing={onSubmit}
      onChangeText={onChange}
      selectionColor={foreground}
      placeholderTextColor={muted}
      style={{
        width,
        height: SLOT_HEIGHT,
        fontFamily: SLOT_FONT,
        fontSize: SLOT_FONT_SIZE,
        color: foreground,
        borderColor: border,
        backgroundColor: surface,
        opacity: disabled ? 0.6 : 1,
        // Android centres text in a TextInput by its own metrics and adds its own
        // padding; both are set explicitly so the two states line up to the pixel.
        paddingVertical: 0,
        paddingHorizontal: 8,
        textAlignVertical: 'center',
      }}
      className="mx-0.5 rounded-md border"
    />
  )
})
