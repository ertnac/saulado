import { describe, expect, it } from 'vitest'
import { createAnswer } from './answers.js'
import { reconstructParagraph, renderCloze, renderClozeText } from './render.js'

const CPU_EXAMPLE = 'The CPU is the brain of the computer, and RAM provides temporary storage.'

describe('renderCloze', () => {
  it('produces the CPU/RAM worked example as two independent blanks', () => {
    const answers = [createAnswer(CPU_EXAMPLE, 4, 7), createAnswer(CPU_EXAMPLE, 42, 45)]
    const segments = renderCloze(CPU_EXAMPLE, answers)

    expect(segments).toEqual([
      { kind: 'text', text: 'The ' },
      { kind: 'blank', ordinal: 0, answerLength: 3 },
      { kind: 'text', text: ' is the brain of the computer, and ' },
      { kind: 'blank', ordinal: 1, answerLength: 3 },
      { kind: 'text', text: ' provides temporary storage.' },
    ])
  })

  it('returns a single text segment when there are no answers', () => {
    expect(renderCloze('Plain text.', [])).toEqual([{ kind: 'text', text: 'Plain text.' }])
  })

  it('returns nothing for an empty paragraph', () => {
    expect(renderCloze('', [])).toEqual([])
  })

  it('handles an answer at index 0 with no leading text segment', () => {
    const text = 'CPU is fast.'
    const segments = renderCloze(text, [createAnswer(text, 0, 3)])

    expect(segments[0]).toEqual({ kind: 'blank', ordinal: 0, answerLength: 3 })
    expect(segments).toHaveLength(2)
  })

  it('handles an answer at the very end with no trailing text segment', () => {
    const text = 'It runs on RAM'
    const segments = renderCloze(text, [createAnswer(text, 11, 14)])

    expect(segments).toHaveLength(2)
    expect(segments[1]).toEqual({ kind: 'blank', ordinal: 1 - 1, answerLength: 3 })
  })

  it('emits no empty text segment between adjacent answers', () => {
    const text = 'onetwo'
    const segments = renderCloze(text, [createAnswer(text, 0, 3), createAnswer(text, 3, 6)])

    expect(segments).toEqual([
      { kind: 'blank', ordinal: 0, answerLength: 3 },
      { kind: 'blank', ordinal: 1, answerLength: 3 },
    ])
  })

  it('orders segments by position even when answers arrive unsorted', () => {
    const answers = [createAnswer(CPU_EXAMPLE, 42, 45), createAnswer(CPU_EXAMPLE, 4, 7)]
    const segments = renderCloze(CPU_EXAMPLE, answers)

    expect(segments[0]).toEqual({ kind: 'text', text: 'The ' })
  })

  it('counts emoji as one character in answerLength', () => {
    const text = 'The 🧠 stores memories.'
    const segments = renderCloze(text, [createAnswer(text, 4, 5)])
    const blank = segments.find((segment) => segment.kind === 'blank')

    expect(blank).toEqual({ kind: 'blank', ordinal: 0, answerLength: 1 })
  })
})

describe('renderCloze round-trip', () => {
  const cases: { name: string; text: string; ranges: [number, number][] }[] = [
    {
      name: 'the CPU/RAM example',
      text: CPU_EXAMPLE,
      ranges: [
        [4, 7],
        [42, 45],
      ],
    },
    { name: 'an answer at index 0', text: 'CPU is fast.', ranges: [[0, 3]] },
    { name: 'an answer at the end', text: 'It runs on RAM', ranges: [[11, 14]] },
    {
      name: 'adjacent answers',
      text: 'onetwothree',
      ranges: [
        [0, 3],
        [3, 6],
      ],
    },
    {
      name: 'emoji and CJK',
      text: '🧠 記憶 memory works',
      ranges: [
        [0, 1],
        [2, 4],
      ],
    },
    {
      name: 'multi-line text',
      text: 'Line one here.\nLine two here.',
      ranges: [
        [5, 8],
        [20, 23],
      ],
    },
  ]

  it.each(cases)('reconstructs the original paragraph for $name', ({ text, ranges }) => {
    const answers = ranges.map(([start, end]) => createAnswer(text, start, end))
    expect(reconstructParagraph(renderCloze(text, answers), answers)).toBe(text)
  })
})

describe('renderClozeText', () => {
  it('uses fixed-width blanks by default so length cannot leak the answer', () => {
    const text = 'The CPU and the motherboard.'
    const answers = [createAnswer(text, 4, 7), createAnswer(text, 16, 27)]

    // "CPU" (3) and "motherboard" (11) must render identically.
    expect(renderClozeText(text, answers)).toBe('The _____ and the _____.')
  })

  it('sizes blanks to the answer in proportional mode', () => {
    const text = 'The CPU and the motherboard.'
    const answers = [createAnswer(text, 4, 7), createAnswer(text, 16, 27)]

    expect(renderClozeText(text, answers, { width: 'proportional' })).toBe(
      'The ___ and the ___________.',
    )
  })

  it('accepts a custom placeholder character', () => {
    const text = 'The CPU is fast.'
    expect(renderClozeText(text, [createAnswer(text, 4, 7)], { placeholder: '•' })).toBe(
      'The ••••• is fast.',
    )
  })

  it('renders an answer that is itself underscores without ambiguity', () => {
    const text = 'The _____ is a placeholder.'
    expect(renderClozeText(text, [createAnswer(text, 4, 9)])).toBe(text)
  })
})
