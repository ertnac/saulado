import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DraftAnswer } from '@saulado/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { PARAGRAPH_DECORATION_ATTR } from '@/lib/selection'
import { HighlightEditor } from './HighlightEditor'
import { toPieces } from './HighlightSurface'
import { useCardDraft } from './useCardDraft'

/**
 * The editor end to end, driven through the real {@link useCardDraft} rather than
 * a mocked one — the two modes and the state machine are only correct in
 * combination, and stubbing the hook would test the wiring against itself.
 *
 * jsdom implements Range and Selection well enough to drive the highlight path
 * (see `lib/selection.test.ts`). What it cannot tell us is how touch selection
 * behaves, which is why plan §3.3 asks for device testing on top of this.
 */

/** 36 code points. "CPU" [4,7), "brain" [15,20), "computer" [28,36). */
const PARAGRAPH = 'The CPU is the brain of the computer'

function Harness({
  paragraph = '',
  answers = [],
}: {
  paragraph?: string
  answers?: DraftAnswer[]
}) {
  const draft = useCardDraft({ paragraph, answers })
  return <HighlightEditor draft={draft} />
}

function answer(startOffset: number, endOffset: number, answerText: string): DraftAnswer {
  return { startOffset, endOffset, answerText, altAnswers: [] }
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
})

/** The read-only paragraph the user highlights against. */
function surface(): HTMLElement {
  return screen.getByRole('group', { name: /Paragraph/ })
}

/**
 * Selects from `startUnits` to `endUnits`, counted in UTF-16 units across the
 * surface's text nodes — the way the paragraph reads, not the way React chunked
 * it into spans and marks.
 */
function selectUnits(element: HTMLElement, startUnits: number, endUnits: number): void {
  // Ordinal badges are chrome, not paragraph text — counting their digits here
  // would aim the selection at the wrong characters.
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(`[${PARAGRAPH_DECORATION_ATTR}]`)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  const range = document.createRange()

  let consumed = 0
  let startSet = false

  while (walker.nextNode()) {
    const node = walker.currentNode
    const length = (node.textContent ?? '').length

    if (!startSet && startUnits <= consumed + length) {
      range.setStart(node, startUnits - consumed)
      startSet = true
    }

    if (startSet && endUnits <= consumed + length) {
      range.setEnd(node, endUnits - consumed)
      break
    }

    consumed += length
  }

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Drags over a range and releases, which is what commits a highlight on desktop. */
function highlight(startUnits: number, endUnits: number): void {
  const element = surface()
  selectUnits(element, startUnits, endUnits)
  fireEvent.mouseUp(element)
}

describe('mode switching', () => {
  it('refuses to enter highlight mode with nothing written', () => {
    render(<Harness />)

    expect(screen.getByRole('tab', { name: 'Highlight' })).toBeDisabled()
  })

  it('commits and normalizes the paragraph on the way into highlight mode', async () => {
    // Normalization has to happen at the boundary: it changes string lengths, so
    // running it later would shift offsets out from under existing answers.
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Paragraph'), 'The CPU is here   ')
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    expect(surface()).toHaveTextContent('The CPU is here')
    expect(screen.queryByLabelText('Paragraph')).not.toBeInTheDocument()
  })

  it('returns to the textarea with the committed text in it', async () => {
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} />)

    await user.click(screen.getByRole('tab', { name: 'Highlight' }))
    await user.click(screen.getByRole('tab', { name: 'Write' }))

    expect(screen.getByLabelText('Paragraph')).toHaveValue(PARAGRAPH)
  })
})

describe('the character counter', () => {
  it('counts what is typed and stays within limit', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Paragraph'), 'abc')

    expect(screen.getByText(/^3 \/ /)).toBeInTheDocument()
    expect(screen.getByLabelText('Paragraph')).not.toHaveAttribute('aria-invalid')
  })
})

describe('creating a blank', () => {
  it('turns a selection into a numbered blank and shows it in the preview', async () => {
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} />)
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    highlight(4, 7)

    expect(screen.getByRole('button', { name: /^Blank 1: CPU\./ })).toBeInTheDocument()
    // The preview is what promises study mode will hide the word. Screen readers
    // get wording rather than the run of underscores, so this is what to assert.
    expect(screen.getByText('blank 1')).toBeInTheDocument()
    expect(screen.getByText('1 blank')).toBeInTheDocument()
  })

  it('numbers blanks by position rather than by the order they were made', async () => {
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} />)
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    highlight(28, 36)
    highlight(4, 7)

    expect(screen.getByRole('button', { name: /^Blank 1: CPU\./ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Blank 2: computer\./ })).toBeInTheDocument()
  })

  it('names the blank a selection collides with', async () => {
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} answers={[answer(4, 7, 'CPU')]} />)
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    // "The CPU is" — straddles the existing blank 1.
    highlight(0, 10)

    expect(screen.getByText(/overlaps blank 1/)).toBeInTheDocument()
    expect(screen.getByText('1 blank')).toBeInTheDocument()
  })

  it('explains a whitespace-only selection instead of creating an empty blank', async () => {
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} />)
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    highlight(3, 4)

    expect(screen.getByText(/cannot be only spaces/)).toBeInTheDocument()
    expect(screen.getByText('no blanks yet')).toBeInTheDocument()
  })

  it('says nothing at all for a bare click', async () => {
    // A message on every tap of the paragraph would be noise, so `collapsed` is
    // dropped before it reaches the editor.
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} />)
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    highlight(5, 5)

    // The standing hint below the paragraph also starts with "Select", so this
    // asserts the absence of the rejection wording specifically.
    expect(screen.queryByText(/overlaps|only spaces|Select inside/)).not.toBeInTheDocument()
    expect(screen.getByText('no blanks yet')).toBeInTheDocument()
  })

  it('clears the selection after a successful highlight', async () => {
    // Otherwise the next Ctrl/Cmd+H re-fires against the same range and reports
    // an overlap with the blank just created.
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} />)
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    highlight(4, 7)

    expect(window.getSelection()?.rangeCount ?? 0).toBe(0)
  })
})

describe('removing a blank', () => {
  it('removes the focused blank on Delete', async () => {
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} answers={[answer(4, 7, 'CPU')]} />)
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    const mark = screen.getByRole('button', { name: /^Blank 1: CPU\./ })
    fireEvent.keyDown(mark, { key: 'Delete' })

    expect(screen.queryByRole('button', { name: /^Blank 1: CPU\./ })).not.toBeInTheDocument()
    expect(screen.getByText('no blanks yet')).toBeInTheDocument()
    // The paragraph text is untouched — re-highlighting is one selection away.
    expect(surface()).toHaveTextContent(PARAGRAPH)
  })
})

describe('alternative answers', () => {
  it('records an alternative spelling for a blank', async () => {
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} answers={[answer(4, 7, 'CPU')]} />)
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    await user.click(screen.getByRole('button', { name: /^Blank 1: CPU\./ }))
    const panel = screen.getByRole('dialog', { name: 'Options for blank 1' })

    await user.type(screen.getByLabelText('Alternative answer for blank 1'), 'processor')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(panel).toHaveTextContent('processor')
    expect(screen.getByRole('button', { name: 'Remove alternative processor' })).toBeInTheDocument()
  })

  it('ignores an alternative identical to the answer itself', async () => {
    // A duplicate would be a dead entry in the checker's ladder.
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} answers={[answer(4, 7, 'CPU')]} />)
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    await user.click(screen.getByRole('button', { name: /^Blank 1: CPU\./ }))
    await user.type(screen.getByLabelText('Alternative answer for blank 1'), 'cpu')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.queryByRole('button', { name: /^Remove alternative/ })).not.toBeInTheDocument()
  })
})

describe('orphan reconciliation', () => {
  it('tells the user which highlight an edit destroyed', async () => {
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} answers={[answer(4, 7, 'CPU')]} />)

    const textarea = screen.getByLabelText('Paragraph')
    await user.clear(textarea)
    await user.type(textarea, 'The processor is the brain of the computer')
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('1 highlight no longer matches your text')
    expect(notice).toHaveTextContent('CPU')

    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says nothing when an edit leaves every highlight intact', async () => {
    const user = userEvent.setup()
    render(<Harness paragraph={PARAGRAPH} answers={[answer(4, 7, 'CPU')]} />)

    await user.type(screen.getByLabelText('Paragraph'), ', more or less.')
    await user.click(screen.getByRole('tab', { name: 'Highlight' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Blank 1: CPU\./ })).toBeInTheDocument()
  })
})

describe('toPieces', () => {
  it('splits a paragraph into plain and highlighted runs', () => {
    expect(toPieces(PARAGRAPH, [{ ...answer(4, 7, 'CPU'), ordinal: 0 }])).toEqual([
      { text: 'The ', ordinal: null, start: 0 },
      { text: 'CPU', ordinal: 0, start: 4 },
      { text: ' is the brain of the computer', ordinal: null, start: 7 },
    ])
  })

  it('emits adjacent runs with no empty filler between them', () => {
    // [4,7) and [7,10) are adjacent, not overlapping — a zero-width gap piece
    // would render an empty span and break the offset keys.
    const pieces = toPieces('abcdefghij', [
      { ...answer(4, 7, 'efg'), ordinal: 0 },
      { ...answer(7, 10, 'hij'), ordinal: 1 },
    ])

    expect(pieces).toEqual([
      { text: 'abcd', ordinal: null, start: 0 },
      { text: 'efg', ordinal: 0, start: 4 },
      { text: 'hij', ordinal: 1, start: 7 },
    ])
  })

  it('keys highlighted runs by offset so repeated words stay distinct', () => {
    const pieces = toPieces('the cat and the cat', [
      { ...answer(4, 7, 'cat'), ordinal: 0 },
      { ...answer(16, 19, 'cat'), ordinal: 1 },
    ])

    expect(pieces.filter((p) => p.ordinal !== null).map((p) => p.start)).toEqual([4, 16])
  })

  it('accepts answers out of order without producing a negative slice', () => {
    const pieces = toPieces(PARAGRAPH, [
      { ...answer(28, 36, 'computer'), ordinal: 1 },
      { ...answer(4, 7, 'CPU'), ordinal: 0 },
    ])

    expect(pieces.map((p) => p.text).join('')).toBe(PARAGRAPH)
  })

  it('slices by code point so an astral character survives', () => {
    expect(toPieces('A 🧠 thinks', [{ ...answer(4, 10, 'thinks'), ordinal: 0 }])).toEqual([
      { text: 'A 🧠 ', ordinal: null, start: 0 },
      { text: 'thinks', ordinal: 0, start: 4 },
    ])
  })
})
