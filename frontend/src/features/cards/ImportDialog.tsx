import { useRef, useState, type ReactElement } from 'react'
import {
  ANSWERS_MAX_PER_CARD,
  PARAGRAPH_MAX_CODE_POINTS,
  assignOrdinals,
  codePointLength,
  createAnswer,
  sliceCodePoints,
  type AnswerRange,
} from '@saulado/shared'
import { BrainSprite } from '@/components/ui/brand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { AlertIcon, ImageIcon } from '@/components/ui/icons'
import { type SelectionResult, type OffsetRange } from '@/lib/selection'
import { HighlightSurface } from './HighlightSurface'
import { recognize } from './ocr'

/**
 * Image in, questions out — two-stage highlighting.
 *
 * Stage 1: the user highlights question spans out of the full recognized text.
 * Stage 2: for each question, the user highlights which words become blanks.
 *
 * Nothing here writes a card. The dialog owns recognition, the full text, the
 * question-span selection, and the blank-selection per question. When it closes
 * it hands the caller an array of `{text, answers}` — one card's worth each —
 * and the composer downstream mounts with those blanks already placed.
 *
 * Three input paths (paste, drop, picker button) because each covers a platform
 * the others do not. Paste is fastest on desktop. Drop works for a file already
 * on screen. The picker is the keyboard path and the only one that works on most
 * mobile browsers.
 */

interface Question {
  /** Code point offsets into the full recognized text. */
  startOffset: number
  endOffset: number
  /**
   * The card's paragraph: the span, capped and trimmed.
   *
   * Finalized the moment the question is created, before it can carry a blank —
   * every blank offset indexes into *this* string, not the page it came from.
   */
  text: string
}

interface QuestionWithBlanks extends Question {
  answers: AnswerRange[]
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'working'; progress: number }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'select-questions'; text: string; questions: Question[] }
  | {
      kind: 'select-blanks'
      /** Carried so skipping every question can return to the page, not to idle. */
      text: string
      questions: QuestionWithBlanks[]
      current: number
    }

const FAILED =
  'Could not read that image. The recognizer downloads once on first use — check your connection and try again.'
const NOT_AN_IMAGE = 'That file is not an image. Use a PNG or a JPEG, or a screenshot of the page.'

/**
 * Why a selection was refused, in the user's words.
 *
 * `collapsed` and `no-selection` never reach here — {@link HighlightSurface}
 * drops them, because a bare click is not a failed attempt.
 */
function rejection(reason: string, noun: 'question' | 'blank'): string {
  switch (reason) {
    case 'outside':
      return `Select inside the text to make a ${noun}.`
    case 'whitespace':
      return 'Select at least one word.'
    case 'overlap':
      return `${noun === 'question' ? 'Questions' : 'Blanks'} cannot overlap — remove the existing one first.`
    default:
      return `Could not make a ${noun} from that selection.`
  }
}

interface ImportDialogProps {
  open: boolean
  onClose: () => void
  onImport: (questions: { text: string; answers: AnswerRange[] }[]) => void
}

export function ImportDialog({ open, onClose, onImport }: ImportDialogProps): ReactElement {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const start = (file: File | undefined | null): void => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setStage({ kind: 'error', message: NOT_AN_IMAGE })
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setStage({ kind: 'working', progress: 0 })

    recognize(
      file,
      (progress) => {
        if (!controller.signal.aborted) setStage({ kind: 'working', progress })
      },
      controller.signal,
    )
      .then((text) => {
        if (controller.signal.aborted) return
        const trimmed = text.trim()
        setStage(
          trimmed.length === 0
            ? { kind: 'empty' }
            : { kind: 'select-questions', text: trimmed, questions: [] },
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) setStage({ kind: 'error', message: FAILED })
      })
  }

  const reset = (): void => {
    abortRef.current?.abort()
    abortRef.current = null
    setStage({ kind: 'idle' })
  }

  const close = (): void => {
    reset()
    onClose()
  }

  /** The question being blanked, or `undefined` outside stage 2. */
  const current = stage.kind === 'select-blanks' ? stage.questions[stage.current] : undefined

  /** Moves to the next question, or hands the finished set to the caller. */
  const advance = (): void => {
    if (stage.kind !== 'select-blanks') return

    if (stage.current < stage.questions.length - 1) {
      setStage({ ...stage, current: stage.current + 1 })
      return
    }

    onImport(stage.questions.map(({ text, answers }) => ({ text, answers })))
    reset()
  }

  /** Drops the current question. Skipping the last one goes back to the page. */
  const skipQuestion = (): void => {
    if (stage.kind !== 'select-blanks') return

    const kept = stage.questions.filter((_, index) => index !== stage.current)
    if (kept.length === 0) {
      setStage({ kind: 'select-questions', text: stage.text, questions: [] })
      return
    }

    setStage({ ...stage, questions: kept, current: Math.min(stage.current, kept.length - 1) })
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Import from an image"
      description="The text is read on this device. Nothing is uploaded and no image is stored."
    >
      <div
        onPaste={(event) => {
          start(event.clipboardData.files[0])
        }}
        onDragOver={(event) => {
          event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()
          start(event.dataTransfer.files[0])
        }}
      >
        {stage.kind === 'idle' && (
          <div className="rounded-lg border border-dashed border-border bg-surface/50 p-6 text-center">
            <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Paste a screenshot, or drop an image here</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              A photo of a page works too. English text, PNG or JPEG.
            </p>
            <Button
              className="mt-5"
              variant="soft"
              onClick={() => {
                fileRef.current?.click()
              }}
            >
              Choose an image
            </Button>
          </div>
        )}

        {stage.kind === 'working' && (
          <div className="space-y-3 py-2">
            {/*
              The sprite is decoration over a determinate bar, not a substitute
              for one — the bar below is what says how far along this is. Its
              `role="status"` label is the only announcement; the bar carries its
              own.
            */}
            <BrainSprite label="Reading the image" className="justify-center text-[1.25rem]" />
            <label htmlFor="ocr-progress" className="block text-sm font-medium">
              Reading the image…
            </label>
            <progress
              id="ocr-progress"
              value={stage.progress}
              max={1}
              className="h-2 w-full overflow-hidden rounded-full"
            />
            <p className="text-sm tabular-nums text-muted-foreground">
              {Math.round(stage.progress * 100)}%
              {stage.progress < 0.3 && ' · downloading the recognizer, once only'}
            </p>
          </div>
        )}

        {stage.kind === 'empty' && (
          <div className="rounded-lg border border-dashed border-border bg-surface/50 p-6 text-center">
            <p className="font-medium">No text found in that image</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Try a straighter, closer shot in better light — or a screenshot instead of a photo.
              Handwriting is not recognised.
            </p>
            <Button className="mt-5" variant="soft" onClick={reset}>
              Try another image
            </Button>
          </div>
        )}

        {stage.kind === 'error' && (
          <div className="space-y-3">
            <p role="alert" className="flex items-start gap-1.5 text-sm text-warning">
              <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
              {stage.message}
            </p>
            <Button variant="soft" onClick={reset}>
              Try again
            </Button>
          </div>
        )}

        {stage.kind === 'select-questions' && (
          <SelectQuestions
            text={stage.text}
            questions={stage.questions}
            onSelect={(range) => {
              setStage({
                kind: 'select-questions',
                text: stage.text,
                // Kept sorted by offset so a question's ordinal is its index —
                // `toPieces` renders in offset order regardless of the order the
                // user picked them in, and the two have to agree or removing
                // highlight 2 removes highlight 1.
                questions: [...stage.questions, toQuestion(stage.text, range)].sort(
                  (a, b) => a.startOffset - b.startOffset,
                ),
              })
            }}
            onRemove={(startOffset) => {
              setStage({
                kind: 'select-questions',
                text: stage.text,
                questions: stage.questions.filter((q) => q.startOffset !== startOffset),
              })
            }}
          />
        )}

        {stage.kind === 'select-blanks' && current && (
          <SelectBlanks
            question={current}
            index={stage.current}
            total={stage.questions.length}
            onUpdate={(answers) => {
              setStage({
                ...stage,
                questions: stage.questions.map((question, index) =>
                  index === stage.current ? { ...question, answers } : question,
                ),
              })
            }}
          />
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          tabIndex={-1}
          onChange={(event) => {
            start(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>

      <DialogActions>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        {stage.kind === 'select-questions' && (
          <Button
            disabled={stage.questions.length === 0}
            onClick={() => {
              setStage({
                kind: 'select-blanks',
                text: stage.text,
                questions: stage.questions.map((question) => ({ ...question, answers: [] })),
                current: 0,
              })
            }}
          >
            {stage.questions.length === 1
              ? 'Next: choose blanks'
              : `Next: choose blanks for ${String(stage.questions.length)}`}
          </Button>
        )}

        {stage.kind === 'select-blanks' && (
          <>
            {/*
              Skip drops the question rather than carrying it forward blank. OCR
              will produce a span not worth keeping, and without this the user
              abandons the whole import to drop one.
            */}
            <Button variant="soft" onClick={skipQuestion}>
              Skip this one
            </Button>
            <Button disabled={(current?.answers.length ?? 0) === 0} onClick={advance}>
              {stage.current < stage.questions.length - 1
                ? 'Next question'
                : stage.questions.length === 1
                  ? 'Add 1 card'
                  : `Add ${String(stage.questions.length)} cards`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}

interface SelectQuestionsProps {
  text: string
  questions: Question[]
  onSelect: (range: OffsetRange) => void
  onRemove: (startOffset: number) => void
}

function SelectQuestions({
  text,
  questions,
  onSelect,
  onRemove,
}: SelectQuestionsProps): ReactElement {
  const [message, setMessage] = useState<string | null>(null)

  const handleSelect = (result: SelectionResult): void => {
    if (!result.ok) {
      setMessage(rejection(result.reason, 'question'))
      return
    }

    setMessage(null)
    onSelect(result.range)
  }

  // Questions are already sorted by offset, so array order *is* the visual
  // order the badges label — but HighlightSurface types these as answers, and
  // the fields it reads are the ones the surface's own renumbering would set.
  const answers = questions.map((q, i) => ({
    startOffset: q.startOffset,
    endOffset: q.endOffset,
    answerText: q.text,
    ordinal: i,
    altAnswers: [],
  }))

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Highlight each question</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the span that will become one card. You'll choose blanks next.
        </p>
      </div>

      <HighlightSurface
        paragraph={text}
        answers={answers}
        onSelect={handleSelect}
        onOpenHighlight={(ordinal) => {
          const question = questions[ordinal]
          if (question) onRemove(question.startOffset)
        }}
        onRemoveHighlight={(ordinal) => {
          const question = questions[ordinal]
          if (question) onRemove(question.startOffset)
        }}
        className="max-h-96 overflow-y-auto"
      />

      <div aria-live="polite" className="min-h-5">
        {message && (
          <p className="flex items-start gap-1.5 text-sm text-warning">
            <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
            {message}
          </p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {questions.length === 0
          ? 'No questions selected yet'
          : questions.length === 1
            ? '1 question selected'
            : `${questions.length} questions selected`}
      </p>
    </div>
  )
}

interface SelectBlanksProps {
  question: QuestionWithBlanks
  index: number
  total: number
  onUpdate: (answers: AnswerRange[]) => void
}

function SelectBlanks({ question, index, total, onUpdate }: SelectBlanksProps): ReactElement {
  const [message, setMessage] = useState<string | null>(null)

  const handleSelect = (result: SelectionResult): void => {
    if (!result.ok) {
      setMessage(rejection(result.reason, 'blank'))
      return
    }

    if (question.answers.length >= ANSWERS_MAX_PER_CARD) {
      setMessage(`A card can have at most ${String(ANSWERS_MAX_PER_CARD)} blanks.`)
      return
    }

    setMessage(null)
    // `createAnswer` derives `answerText` by slicing the paragraph rather than
    // trusting a string from the DOM, which is what makes that field a
    // corruption tripwire downstream. It throws only on a range this component
    // has already had validated by `resolveHighlight`.
    onUpdate([
      ...question.answers,
      createAnswer(question.text, result.range.startOffset, result.range.endOffset),
    ])
  }

  // Sorted and renumbered so the badges read 1, 2, 3 down the paragraph however
  // the user picked them — the same call the card editor makes.
  const answers = assignOrdinals(question.answers)

  // Removal goes through the *renumbered* list: an ordinal is a position in
  // reading order, not an index into the array the selections arrived in.
  const remove = (ordinal: number): void => {
    const target = answers.find((answer) => answer.ordinal === ordinal)
    if (!target) return
    onUpdate(question.answers.filter((answer) => answer.startOffset !== target.startOffset))
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">
          Question {index + 1} of {total}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Highlight the words to blank out. You can skip this question.
        </p>
      </div>

      <HighlightSurface
        paragraph={question.text}
        answers={answers}
        onSelect={handleSelect}
        onOpenHighlight={remove}
        onRemoveHighlight={remove}
      />

      <div aria-live="polite" className="min-h-5">
        {message && (
          <p className="flex items-start gap-1.5 text-sm text-warning">
            <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
            {message}
          </p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {question.answers.length === 0
          ? 'Highlight at least one word to keep this question'
          : question.answers.length === 1
            ? '1 blank'
            : `${String(question.answers.length)} blanks`}
      </p>
    </div>
  )
}

/**
 * Turns a stage-1 span into the card paragraph it will become.
 *
 * Trimmed and capped here, once, while the question still has no blanks to
 * invalidate: `resolveHighlight` accepts a span with whitespace at its edges
 * (only an all-whitespace one is refused), and a selection that runs off the end
 * of a very long scan would otherwise produce a card the composer refuses to
 * save. `sliceCodePoints` rather than `String.prototype.slice` because these
 * offsets count code points — slicing by UTF-16 unit would split an astral
 * character into a lone surrogate.
 */
function toQuestion(full: string, range: OffsetRange): Question {
  const span = sliceCodePoints(full, range.startOffset, range.endOffset)
  const capped =
    codePointLength(span) > PARAGRAPH_MAX_CODE_POINTS
      ? sliceCodePoints(span, 0, PARAGRAPH_MAX_CODE_POINTS)
      : span

  return { startOffset: range.startOffset, endOffset: range.endOffset, text: capped.trim() }
}
