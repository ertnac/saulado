import { act, renderHook } from '@testing-library/react'
import { ANSWERS_MAX_PER_CARD } from '@saulado/shared'
import { describe, expect, it } from 'vitest'
import { useCardDraft } from './useCardDraft'

/**
 * The editor's state machine (plan §2.1, §3.3).
 *
 * These tests exist for one invariant above all others: **every answer offset
 * indexes into `paragraph`, never into `draftText`**. Most of the ways a cloze
 * card can silently corrupt itself are a violation of that — a blank drifting
 * mid-word, an `answerText` that no longer matches the slice it points at — and
 * they are invisible until a review weeks later. So the offsets are asserted
 * numerically rather than through rendered output.
 */

/** 36 code points. "CPU" [4,7), "brain" [15,20), "computer" [28,36). */
const PARAGRAPH = 'The CPU is the brain of the computer'

function answer(startOffset: number, endOffset: number, answerText: string) {
  return { startOffset, endOffset, answerText, altAnswers: [] }
}

const CPU = answer(4, 7, 'CPU')
const BRAIN = answer(15, 20, 'brain')

describe('initial state', () => {
  it('normalizes the paragraph it is given', () => {
    const { result } = renderHook(() => useCardDraft({ paragraph: 'Line one\r\nLine two   \n' }))

    expect(result.current.paragraph).toBe('Line one\nLine two')
    expect(result.current.draftText).toBe(result.current.paragraph)
    expect(result.current.mode).toBe('compose')
  })

  it('numbers the answers it is given by position, not array order', () => {
    const { result } = renderHook(() =>
      useCardDraft({ paragraph: PARAGRAPH, answers: [BRAIN, CPU] }),
    )

    expect(result.current.answers.map((a) => [a.answerText, a.ordinal])).toEqual([
      ['CPU', 0],
      ['brain', 1],
    ])
  })
})

describe('compose mode', () => {
  it('leaves the committed paragraph alone while typing', () => {
    // The load-bearing case. If `paragraph` tracked the textarea, every
    // keystroke would invalidate the offsets of every existing answer.
    const { result } = renderHook(() => useCardDraft({ paragraph: PARAGRAPH, answers: [CPU] }))

    act(() => {
      result.current.setDraftText('Something else entirely')
    })

    expect(result.current.draftText).toBe('Something else entirely')
    expect(result.current.paragraph).toBe(PARAGRAPH)
    expect(result.current.answers[0]).toMatchObject({ startOffset: 4, endOffset: 7 })
  })

  it('discards the in-progress edit on revert', () => {
    const { result } = renderHook(() => useCardDraft({ paragraph: PARAGRAPH }))

    act(() => {
      result.current.setDraftText('half-written thought')
    })
    act(() => {
      result.current.revertDraftText()
    })

    expect(result.current.draftText).toBe(PARAGRAPH)
  })
})

describe('commit', () => {
  it('normalizes on commit and syncs the textarea to the result', () => {
    // The textarea has to be rewritten too, or the next keystroke re-submits the
    // un-normalized text and the offsets shift a second time.
    const { result } = renderHook(() => useCardDraft())

    act(() => {
      result.current.setDraftText('The CPU is here\r\nand here   ')
    })
    act(() => {
      result.current.commitParagraph()
    })

    expect(result.current.paragraph).toBe('The CPU is here\nand here')
    expect(result.current.draftText).toBe('The CPU is here\nand here')
  })

  it('keeps offsets untouched when text is appended after every answer', () => {
    const { result } = renderHook(() =>
      useCardDraft({ paragraph: PARAGRAPH, answers: [CPU, BRAIN] }),
    )

    act(() => {
      result.current.setDraftText(`${PARAGRAPH}, more or less.`)
    })
    act(() => {
      result.current.commitParagraph()
    })

    expect(result.current.answers).toMatchObject([
      { answerText: 'CPU', startOffset: 4, endOffset: 7 },
      { answerText: 'brain', startOffset: 15, endOffset: 20 },
    ])
    expect(result.current.orphaned).toEqual([])
  })
})

describe('re-anchoring', () => {
  it('shifts every offset when text is inserted above the answers', () => {
    const { result } = renderHook(() =>
      useCardDraft({ paragraph: PARAGRAPH, answers: [CPU, BRAIN] }),
    )

    act(() => {
      result.current.setDraftText(`Note: ${PARAGRAPH}`)
    })
    act(() => {
      result.current.commitParagraph()
    })

    // Everything moved right by the 6 code points of "Note: ".
    expect(result.current.answers).toMatchObject([
      { answerText: 'CPU', startOffset: 10, endOffset: 13, ordinal: 0 },
      { answerText: 'brain', startOffset: 21, endOffset: 26, ordinal: 1 },
    ])
    expect(result.current.orphaned).toEqual([])
  })

  it('orphans a highlight whose word was deleted rather than dropping it', () => {
    // The whole point of the reconciliation UI. A silently dropped highlight is
    // work the user did deliberately, vanishing with no way to notice.
    const { result } = renderHook(() =>
      useCardDraft({ paragraph: PARAGRAPH, answers: [CPU, BRAIN] }),
    )

    act(() => {
      result.current.setDraftText('The processor is the brain of the computer')
    })
    act(() => {
      result.current.commitParagraph()
    })

    expect(result.current.orphaned).toMatchObject([{ answerText: 'CPU' }])
    expect(result.current.answers).toMatchObject([
      { answerText: 'brain', startOffset: 21, endOffset: 26, ordinal: 0 },
    ])
  })

  it('renumbers when an answer moves past another', () => {
    const { result } = renderHook(() =>
      useCardDraft({
        paragraph: 'alpha and beta',
        answers: [answer(0, 5, 'alpha'), answer(10, 14, 'beta')],
      }),
    )

    act(() => {
      result.current.setDraftText('beta and alpha')
    })
    act(() => {
      result.current.commitParagraph()
    })

    // Ordinals are positional: blank 0 must be the one that now reads first.
    expect(result.current.answers.map((a) => [a.answerText, a.ordinal])).toEqual([
      ['beta', 0],
      ['alpha', 1],
    ])
  })

  it('clears a previous orphan list once the edit that caused it is undone', () => {
    const { result } = renderHook(() => useCardDraft({ paragraph: PARAGRAPH, answers: [CPU] }))

    act(() => {
      result.current.setDraftText('The processor is the brain of the computer')
    })
    act(() => {
      result.current.commitParagraph()
    })
    expect(result.current.orphaned).toHaveLength(1)

    act(() => {
      result.current.dismissOrphans()
    })
    expect(result.current.orphaned).toEqual([])
  })
})

describe('highlights', () => {
  it('derives answerText from the paragraph rather than trusting the caller', () => {
    // This is what makes `answerText` usable as a corruption tripwire: the
    // editor never types the string itself, so a mismatch always means the
    // offsets are wrong.
    const { result } = renderHook(() => useCardDraft({ paragraph: PARAGRAPH }))

    act(() => {
      result.current.addHighlight({ startOffset: 15, endOffset: 20 })
    })

    expect(result.current.answers).toMatchObject([
      { answerText: 'brain', startOffset: 15, endOffset: 20, ordinal: 0, altAnswers: [] },
    ])
  })

  it('orders by position however the highlights were added', () => {
    const { result } = renderHook(() => useCardDraft({ paragraph: PARAGRAPH }))

    act(() => {
      result.current.addHighlight({ startOffset: 28, endOffset: 36 })
    })
    act(() => {
      result.current.addHighlight({ startOffset: 4, endOffset: 7 })
    })

    expect(result.current.answers.map((a) => a.answerText)).toEqual(['CPU', 'computer'])
  })

  it('swallows an invalid range instead of throwing out of a click handler', () => {
    const { result } = renderHook(() => useCardDraft({ paragraph: PARAGRAPH }))

    act(() => {
      // [3,4) is the single space before "CPU" — whitespace-only.
      result.current.addHighlight({ startOffset: 3, endOffset: 4 })
    })
    act(() => {
      result.current.addHighlight({ startOffset: 0, endOffset: 999 })
    })

    expect(result.current.answers).toEqual([])
  })

  it('stops accepting highlights at the per-card limit', () => {
    // 40 single characters available, so the cap is what bites, not the text.
    const long = 'a b '.repeat(ANSWERS_MAX_PER_CARD + 5).trimEnd()
    const { result } = renderHook(() => useCardDraft({ paragraph: long }))

    for (let i = 0; i < ANSWERS_MAX_PER_CARD + 3; i += 1) {
      const start = i * 2
      act(() => {
        result.current.addHighlight({ startOffset: start, endOffset: start + 1 })
      })
    }

    expect(result.current.answers).toHaveLength(ANSWERS_MAX_PER_CARD)
  })

  it('renumbers the survivors when a middle blank is removed', () => {
    const { result } = renderHook(() =>
      useCardDraft({ paragraph: PARAGRAPH, answers: [CPU, BRAIN, answer(28, 36, 'computer')] }),
    )

    act(() => {
      result.current.removeHighlight(1)
    })

    expect(result.current.answers.map((a) => [a.answerText, a.ordinal])).toEqual([
      ['CPU', 0],
      ['computer', 1],
    ])
  })
})

describe('alternative answers', () => {
  it('sets alternatives on the addressed blank only, dropping blank entries', () => {
    const { result } = renderHook(() =>
      useCardDraft({ paragraph: PARAGRAPH, answers: [CPU, BRAIN] }),
    )

    act(() => {
      result.current.setAltAnswers(0, ['processor', '   ', 'central processing unit'])
    })

    expect(result.current.answers[0]?.altAnswers).toEqual(['processor', 'central processing unit'])
    expect(result.current.answers[1]?.altAnswers).toEqual([])
  })
})

describe('reset', () => {
  it('replaces paragraph, answers and orphans in one step', () => {
    const { result } = renderHook(() => useCardDraft({ paragraph: PARAGRAPH, answers: [CPU] }))

    act(() => {
      result.current.setDraftText('mid-edit text')
    })
    act(() => {
      result.current.reset({ paragraph: 'A wholly new paragraph.\r\n', answers: [] })
    })

    expect(result.current.paragraph).toBe('A wholly new paragraph.')
    expect(result.current.draftText).toBe('A wholly new paragraph.')
    expect(result.current.answers).toEqual([])
    expect(result.current.orphaned).toEqual([])
  })
})

describe('astral characters', () => {
  it('indexes by code point, not UTF-16 unit', () => {
    // 'A 🧠 thinks' is 11 UTF-16 units but 10 code points; "thinks" starts at
    // code point 4. Getting this wrong slices the emoji in half.
    const { result } = renderHook(() => useCardDraft({ paragraph: 'A 🧠 thinks' }))

    act(() => {
      result.current.addHighlight({ startOffset: 4, endOffset: 10 })
    })

    expect(result.current.answers[0]?.answerText).toBe('thinks')
  })
})
