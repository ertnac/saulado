import { useState, type ReactElement } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ANSWERS_MAX_PER_CARD,
  assignOrdinals,
  codePointLength,
  createAnswer,
  PARAGRAPH_MAX_CODE_POINTS,
  sliceCodePoints,
  type AnswerRange,
  type DraftAnswer,
} from '@saulado/shared'
import { Button } from '../../components/button'
import { HighlightSurface } from '../../components/highlight-surface'
import { SetList } from '../../components/set-list'
import { takeScannedPage } from '../../lib/scan-handoff'
import { useImportQueue } from '../../stores/import-queue'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * The scanned page, turned into cards — the mobile half of the two-stage flow in
 * `frontend/src/features/cards/ImportDialog.tsx`.
 *
 * Both stages are the same {@link HighlightSurface} the card editor uses, which
 * is what makes this screen cheap: the tap-first-word/tap-last-word gesture, the
 * numbered badges, the overlap refusal and the accessibility labels all already
 * exist. Only the two nouns and the cap differ, and both are props.
 *
 * **Stage 1 highlights questions out of the whole page**, not sentences and not
 * paragraphs. The user asked for freeform spans explicitly, and a card boundary
 * is a judgement about what belongs together that no splitter can make from
 * punctuation.
 *
 * **Stage 2 places blanks inside one question at a time.** Its offsets index into
 * `question.text` — the span, sliced and finalized at creation, before it can
 * carry a blank — and never into the page. Deriving that string later, from the
 * page plus offsets, is the same value with one more chance to be wrong.
 *
 * The page is read once, in a lazy initializer. `takeScannedPage` clears as it
 * reads, so calling it during render would leave the second render with nothing.
 */

/** Questions are spans of a page, not of a card — the card cap does not apply. */
const QUESTIONS_MAX = 50

interface Question {
  /** Code point offsets into the recognized page. */
  startOffset: number
  endOffset: number
  /**
   * The card's paragraph: the span, capped and trimmed.
   *
   * Finalized the moment the question is created, before it can carry a blank —
   * every blank offset indexes into *this* string, not the page it came from.
   */
  text: string
  answers: DraftAnswer[]
}

/**
 * Turns a stage-1 span into the card paragraph it will become.
 *
 * `sliceCodePoints` rather than `String.prototype.slice`, because these offsets
 * count code points — slicing by UTF-16 unit would split an astral character
 * into a lone surrogate. Capped here, once, while the question still has no
 * blanks to invalidate.
 */
function toQuestion(page: string, range: Pick<AnswerRange, 'startOffset' | 'endOffset'>): Question {
  const span = sliceCodePoints(page, range.startOffset, range.endOffset)
  const capped =
    codePointLength(span) > PARAGRAPH_MAX_CODE_POINTS
      ? sliceCodePoints(span, 0, PARAGRAPH_MAX_CODE_POINTS)
      : span

  return {
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    text: capped.trim(),
    answers: [],
  }
}

export default function ScanReviewScreen(): ReactElement {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { setId } = useLocalSearchParams<{ setId?: string }>()
  const startImport = useImportQueue((state) => state.start)

  const [page] = useState(() => takeScannedPage())
  const [questions, setQuestions] = useState<Question[]>([])
  /** `null` is stage 1; a number is the question being blanked in stage 2. */
  const [current, setCurrent] = useState<number | null>(null)
  /**
   * Stage 3, and only for a scan that has no set yet.
   *
   * The tab-bar scan button belongs to no set — it is the one action you take at
   * a page, reachable from anywhere — so the destination is chosen here instead.
   * Last rather than first: the camera is what the user opened the tab for, and a
   * set chooser standing between them and it would make the quick action slower
   * than opening the set and scanning from inside it.
   */
  const [picking, setPicking] = useState(false)

  if (page === null) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-5">
        <Text className="text-center text-base text-foreground">There is no scan to review.</Text>
        <Text className="text-center text-sm text-muted-foreground">
          Point the camera at a page and it will land here.
        </Text>
        <Button
          label="Back"
          variant="outline"
          onPress={() => {
            router.back()
          }}
        />
      </View>
    )
  }

  const question = current === null ? undefined : questions[current]

  /** Hands the finished cards to the composer and leaves the scanner behind. */
  const finish = (cards: Question[], target: string): void => {
    startImport(
      target,
      cards.map(({ text, answers }) => ({ paragraph: text, answers })),
    )
    // `dismissTo` rather than `back`: the scanner is still on the stack under
    // this screen, and going back one would return to a live viewfinder.
    router.dismissTo(`/sets/${target}`)
  }

  /** The last button in stage 2: straight to the composer, or via the chooser. */
  const commit = (): void => {
    if (setId === undefined || setId.length === 0) {
      setPicking(true)
      return
    }
    finish(questions, setId)
  }

  if (picking) {
    return (
      <ChooseSet
        count={questions.length}
        onPick={(target) => {
          finish(questions, target)
        }}
        onCancel={() => {
          setPicking(false)
        }}
      />
    )
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-5 p-5 pb-8">
        {question === undefined ? (
          <SelectQuestions
            page={page}
            questions={questions}
            onAdd={(range) => {
              // Kept sorted by offset so a question's ordinal is its index —
              // `toPieces` renders in offset order regardless of the order the
              // user picked them in, and the two have to agree or removing
              // highlight 2 removes highlight 1.
              setQuestions(
                [...questions, toQuestion(page, range)].sort(
                  (a, b) => a.startOffset - b.startOffset,
                ),
              )
            }}
            onRemove={(ordinal) => {
              setQuestions(questions.filter((_, index) => index !== ordinal))
            }}
          />
        ) : (
          <SelectBlanks
            question={question}
            index={current ?? 0}
            total={questions.length}
            onChange={(answers) => {
              setQuestions(
                questions.map((item, index) => (index === current ? { ...item, answers } : item)),
              )
            }}
          />
        )}
      </ScrollView>

      <View
        style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}
        className="gap-3 border-t border-border bg-surface p-5"
      >
        {question === undefined ? (
          <>
            <Button
              label={
                questions.length === 1
                  ? 'Next: choose blanks'
                  : `Next: choose blanks for ${String(questions.length)}`
              }
              size="lg"
              disabled={questions.length === 0}
              onPress={() => {
                setCurrent(0)
              }}
            />
            <Button
              label="Scan again"
              variant="ghost"
              onPress={() => {
                router.replace(
                  setId === undefined || setId.length === 0
                    ? '/scan'
                    : `/scan?setId=${encodeURIComponent(setId)}`,
                )
              }}
            />
          </>
        ) : (
          <>
            <Button
              label={
                current !== null && current < questions.length - 1
                  ? 'Next question'
                  : questions.length === 1
                    ? 'Add 1 card'
                    : `Add ${String(questions.length)} cards`
              }
              size="lg"
              disabled={question.answers.length === 0}
              onPress={() => {
                if (current !== null && current < questions.length - 1) {
                  setCurrent(current + 1)
                  return
                }
                commit()
              }}
            />
            {/*
              Skip drops the question rather than carrying it forward blank. OCR
              will produce a span not worth keeping, and without this the user
              abandons the whole scan to drop one. Skipping the last one returns
              to the page, not to the camera — the text is still good.
            */}
            <Button
              label="Skip this one"
              variant="ghost"
              onPress={() => {
                const kept = questions.filter((_, index) => index !== current)
                setQuestions(kept)
                if (kept.length === 0) {
                  setCurrent(null)
                  return
                }
                setCurrent(Math.min(current ?? 0, kept.length - 1))
              }}
            />
          </>
        )}
      </View>
    </View>
  )
}

function ChooseSet({
  count,
  onPick,
  onCancel,
}: {
  count: number
  onPick: (setId: string) => void
  onCancel: () => void
}): ReactElement {
  const insets = useSafeAreaInsets()
  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-5 p-5 pb-8" keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text className="text-xl font-semibold text-foreground">Where do these go?</Text>
          <Text className="text-sm text-muted-foreground">
            {count === 1
              ? 'Pick a set for this card, or type a name to make a new one.'
              : `Pick a set for these ${String(count)} cards, or type a name to make a new one.`}
          </Text>
        </View>

        {/*
          Roots only, matching the library. A sub-set is reachable by opening its
          parent everywhere else in the app, and a chooser that drills down is a
          navigation stack inside a screen that already sits on one — the cards can
          be moved later, which a wrong pick here cannot be if the flow to fix it
          does not exist.
        */}
        <SetList
          parent={null}
          emptyText="No sets yet. Name one above and this scan goes straight into it."
          onPick={(set) => {
            onPick(set.id)
          }}
        />
      </ScrollView>

      <View
        style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}
        className="border-t border-border bg-surface p-5"
      >
        <Button label="Back to the blanks" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  )
}

function SelectQuestions({
  page,
  questions,
  onAdd,
  onRemove,
}: {
  page: string
  questions: readonly Question[]
  onAdd: (range: Pick<AnswerRange, 'startOffset' | 'endOffset'>) => void
  onRemove: (ordinal: number) => void
}): ReactElement {
  // Already sorted by offset, so array order *is* the order the badges label.
  // `answerText` carries the span for the surface's accessibility label; nothing
  // downstream reads it, because a question is not an answer.
  const answers = questions.map((item, ordinal) => ({
    startOffset: item.startOffset,
    endOffset: item.endOffset,
    answerText: item.text,
    altAnswers: [],
    ordinal,
  }))

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-xl font-semibold text-foreground">Highlight each question</Text>
        <Text className="text-sm text-muted-foreground">
          Tap the first and last word of the part that should become one card. Blanks come next.
        </Text>
      </View>

      <HighlightSurface
        paragraph={page}
        answers={answers}
        noun="question"
        max={QUESTIONS_MAX}
        onAddHighlight={onAdd}
        onRemoveHighlight={onRemove}
      />

      <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
        {questions.length === 0
          ? 'No questions yet'
          : questions.length === 1
            ? '1 question'
            : `${String(questions.length)} questions`}
      </Text>
    </View>
  )
}

function SelectBlanks({
  question,
  index,
  total,
  onChange,
}: {
  question: Question
  index: number
  total: number
  onChange: (answers: DraftAnswer[]) => void
}): ReactElement {
  // Sorted and renumbered so the badges read 1, 2, 3 down the paragraph however
  // the user picked them — the same call the card editor makes.
  const answers = assignOrdinals(question.answers)

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-xl font-semibold text-foreground">
          {`Question ${String(index + 1)} of ${String(total)}`}
        </Text>
        <Text className="text-sm text-muted-foreground">
          Tap the words to blank out. You can skip this one.
        </Text>
      </View>

      <HighlightSurface
        paragraph={question.text}
        answers={answers}
        max={ANSWERS_MAX_PER_CARD}
        onAddHighlight={(range) => {
          // `createAnswer` derives `answerText` by slicing the paragraph rather
          // than trusting a string the surface passed along, which is what makes
          // that field a corruption tripwire downstream.
          onChange([
            ...question.answers,
            createAnswer(question.text, range.startOffset, range.endOffset),
          ])
        }}
        onRemoveHighlight={(ordinal) => {
          // Resolved through the *renumbered* list: an ordinal is a position in
          // reading order, not an index into the array selections arrived in.
          const target = answers.find((answer) => answer.ordinal === ordinal)
          if (target === undefined) return
          onChange(question.answers.filter((answer) => answer.startOffset !== target.startOffset))
        }}
      />

      <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
        {question.answers.length === 0
          ? 'Highlight at least one word to keep this question'
          : question.answers.length === 1
            ? '1 blank'
            : `${String(question.answers.length)} blanks`}
      </Text>
    </View>
  )
}
