import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Text, useWindowDimensions, View, type TextInput } from 'react-native'
import type { BlankResult, SessionCard, Segment, AnsweringType } from '@saulado/shared'

import { BlankSlot, SLOT_FONT, SLOT_FONT_SIZE, SLOT_HEIGHT } from './blank-slot'
import { MultipleChoiceGrid } from './multiple-choice-grid'

/**
 * The card under review: the paragraph with its blanks as inputs.
 *
 * The paragraph is rendered from `segments`, which is all the server sends — the
 * text *around* the answers. There is no client-side blanking step, and no
 * `answers` array to accidentally render, which makes "the answer is not on
 * screen before submission" a property of the wire format rather than a rule this
 * component has to remember to follow.
 *
 * ## Why this is a flex row and not a `<Text>`
 *
 * The web nests the inputs inside a `<p>`, so they flow with the prose for free.
 * React Native no longer documents views nested inside `<Text>`, so the paragraph
 * is a `flex-row flex-wrap` container of word tokens with the blanks as siblings.
 * Wrapping happens at token boundaries, which is what a line break is anyway, and
 * `alignItems: 'center'` applies per wrapped line — that is what reproduces the
 * web's `align-middle`.
 *
 * The alternative — a list of inputs under the paragraph — breaks the whole
 * premise of contextual recall by divorcing the blank from its sentence, so it was
 * never a candidate.
 *
 * ## Why the paragraph waits for a measurement
 *
 * `BlankSlot` reserves its box from `answerLength`, and the web multiplies by the
 * `ch` unit. There is no `ch` here, so one character of the slot's own monospace
 * face is measured off-screen and multiplied. Nothing renders until that number
 * exists: rendering at a guessed width and correcting it afterwards is the exact
 * layout shift saulado-ux §1.2 forbids, just moved earlier in the card's life.
 */

export const PARAGRAPH_FONT_SIZE = 17

/** Every wrapped line is one slot tall, so a line with a blank is no taller. */
export const LINE_HEIGHT = SLOT_HEIGHT

/** Enough characters that rounding in the measurement averages out. */
const SAMPLE = '0000000000'

export type Token =
  | { kind: 'word'; text: string }
  | { kind: 'break'; height: number }
  | { kind: 'blank'; ordinal: number; answerLength: number }

/**
 * Segments to a flat list of things that can sit in a wrapping row.
 *
 * A run of whitespace with no newline becomes a single trailing space on the word
 * before it, so punctuation after a blank stays flush against it. A run
 * containing newlines becomes a full-width zero-height item, which cannot share a
 * line with anything and therefore forces a wrap; each *additional* newline adds
 * a line-height-tall one, which is how a paragraph gap survives.
 *
 * ponytail: runs of two or more spaces collapse to one, where the web's
 * `whitespace-pre-wrap` preserved them. Preserving them needs a per-space
 * measurement of the prose face; do it if a card ever depends on aligned columns.
 */
export function tokenize(segments: Segment[]): Token[] {
  const tokens: Token[] = []

  const space = (): void => {
    const last = tokens[tokens.length - 1]
    if (last?.kind === 'word') last.text += ' '
    else tokens.push({ kind: 'word', text: ' ' })
  }

  for (const segment of segments) {
    if (segment.kind === 'blank') {
      tokens.push({
        kind: 'blank',
        ordinal: segment.ordinal,
        answerLength: segment.answerLength,
      })
      continue
    }

    for (const piece of segment.text.split(/(\s+)/)) {
      if (piece === '') continue
      if (!/\s/.test(piece)) {
        tokens.push({ kind: 'word', text: piece })
        continue
      }
      const newlines = (piece.match(/\r\n|\r|\n/g) ?? []).length
      if (newlines === 0) {
        space()
        continue
      }
      tokens.push({ kind: 'break', height: 0 })
      for (let extra = 1; extra < newlines; extra += 1) {
        tokens.push({ kind: 'break', height: LINE_HEIGHT })
      }
    }
  }

  return tokens
}

export function Badge({
  text,
  className = '',
  textClassName = '',
}: {
  text: string
  className?: string
  textClassName?: string
}): ReactElement {
  return (
    <View
      className={`rounded-full px-2.5 py-0.5 border border-transparent items-center justify-center ${className}`}
    >
      <Text className={`text-xs font-semibold ${textClassName}`}>{text}</Text>
    </View>
  )
}

interface StudyCardProps {
  card: SessionCard
  values: Record<number, string>
  /** `null` until the card is graded; then one entry per blank. */
  results: BlankResult[] | null
  disabled: boolean
  answeringType: AnsweringType
  onChange: (ordinal: number, value: string) => void
  onSubmit: (overrideValues?: Record<number, string>) => void
}

export function StudyCard({
  card,
  values,
  results,
  disabled,
  answeringType,
  onChange,
  onSubmit,
}: StudyCardProps): ReactElement {
  const { fontScale } = useWindowDimensions()
  const [charWidth, setCharWidth] = useState(0)
  const [focusedOrdinal, setFocusedOrdinal] = useState(0)
  const blanks = useRef<Record<number, TextInput | null>>({})

  useEffect(() => {
    if (!results) {
      blanks.current[0]?.focus()
      setFocusedOrdinal(0)
    }
  }, [card.cardId, results, charWidth])

  const handleSelectChoice = (option: string) => {
    if (disabled || !!results) return

    const nextValues = { ...values, [focusedOrdinal]: option }
    onChange(focusedOrdinal, option)

    const isLastBlank = focusedOrdinal === card.blankCount - 1
    if (isLastBlank) {
      onSubmit(nextValues)
    } else {
      const nextOrdinal = focusedOrdinal + 1
      setFocusedOrdinal(nextOrdinal)
      blanks.current[nextOrdinal]?.focus()
    }
  }

  const byOrdinal = new Map(results?.map((result) => [result.ordinal, result]))
  const meta = card.isNew || card.isLeech || card.tags.length > 0

  return (
    <View className="rounded-3xl border border-border/80 bg-surface p-6 shadow-sm">
      <Text
        key={fontScale}
        style={{
          position: 'absolute',
          opacity: 0,
          fontFamily: SLOT_FONT,
          fontSize: SLOT_FONT_SIZE,
        }}
        onLayout={(event) => {
          setCharWidth(event.nativeEvent.layout.width / SAMPLE.length)
        }}
      >
        {SAMPLE}
      </Text>

      {meta && (
        <View className="mb-4 flex-row flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
          <View className="flex-row flex-wrap items-center gap-1.5">
            {card.isNew && (
              <Badge
                text="✨ New"
                className="bg-primary/15 border-primary/30"
                textClassName="text-primary"
              />
            )}
            {card.isLeech && (
              <Badge
                text="⚠️ Review"
                className="bg-warning/15 border-warning/30"
                textClassName="text-warning"
              />
            )}
            {card.tags.map((tag) => (
              <Badge
                key={tag}
                text={`#${tag}`}
                className="bg-surface-muted border-border/80"
                textClassName="text-foreground/80"
              />
            ))}
          </View>

          {card.blankCount > 1 && (
            <Text className="text-xs font-semibold text-muted-foreground">
              {card.blankCount} blanks
            </Text>
          )}
        </View>
      )}

      {charWidth > 0 && (
        <View
          accessibilityLabel="The paragraph you are recalling"
          className="flex-row flex-wrap items-center leading-loose py-1"
        >
          {tokenize(card.segments).map((token, index) => {
            if (token.kind === 'break') {
              return (
                <View key={`n${String(index)}`} style={{ width: '100%', height: token.height }} />
              )
            }

            if (token.kind === 'word') {
              return (
                <Text
                  key={`t${String(index)}`}
                  style={{ fontSize: PARAGRAPH_FONT_SIZE, lineHeight: LINE_HEIGHT }}
                  className="text-foreground"
                >
                  {token.text}
                </Text>
              )
            }

            const isLastBlank = token.ordinal === card.blankCount - 1

            return (
              <BlankSlot
                key={`b${String(token.ordinal)}`}
                ref={(node) => {
                  blanks.current[token.ordinal] = node
                }}
                ordinal={token.ordinal}
                blankCount={card.blankCount}
                answerLength={token.answerLength}
                charWidth={charWidth}
                value={values[token.ordinal] ?? ''}
                result={byOrdinal.get(token.ordinal) ?? null}
                disabled={disabled}
                isLastBlank={isLastBlank}
                answeringType={answeringType}
                onFocus={() => setFocusedOrdinal(token.ordinal)}
                onChange={(value) => {
                  onChange(token.ordinal, value)
                }}
                onSubmit={() => {
                  if (isLastBlank) onSubmit()
                  else blanks.current[token.ordinal + 1]?.focus()
                }}
              />
            )
          })}
        </View>
      )}

      {answeringType === 'multiple-choice' && card.blankOptions && (
        <View className="mt-4 border-t border-border/40 pt-4">
          {card.blankCount > 1 && (
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Options for Blank {focusedOrdinal + 1}
              </Text>
              <Text className="text-xs text-primary font-medium">
                {focusedOrdinal + 1} of {card.blankCount}
              </Text>
            </View>
          )}
          <MultipleChoiceGrid
            options={card.blankOptions[focusedOrdinal] ?? []}
            selectedValue={values[focusedOrdinal] ?? ''}
            result={byOrdinal.get(focusedOrdinal) ?? null}
            onSelect={handleSelectChoice}
            disabled={disabled || !!results}
          />
        </View>
      )}
    </View>
  )
}
