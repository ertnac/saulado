import { describe, expect, it } from 'vitest'
import { browseSnippet, parseSnippet } from './snippet.js'
import { SNIPPET_BROWSE_MAX_CODE_POINTS, SNIPPET_START, SNIPPET_STOP } from './limits.js'

/**
 * Snippet parsing (plan §6.1).
 *
 * The security-relevant assertion is `keeps markup as text`: this function is
 * what stands between a user's pasted paragraph and the DOM, and its whole
 * reason to exist is that the client never receives HTML.
 */

/** Wraps text in the delimiters, the way `ts_headline` would. */
const hl = (text: string): string => `${SNIPPET_START}${text}${SNIPPET_STOP}`

describe('parseSnippet', () => {
  it('returns nothing for an empty headline', () => {
    expect(parseSnippet('')).toEqual([])
  })

  it('returns one unmatched segment when nothing matched', () => {
    expect(parseSnippet('The CPU is the brain')).toEqual([
      { text: 'The CPU is the brain', match: false },
    ])
  })

  it('splits a match out of its surrounding text', () => {
    expect(parseSnippet(`The ${hl('CPU')} is the brain`)).toEqual([
      { text: 'The ', match: false },
      { text: 'CPU', match: true },
      { text: ' is the brain', match: false },
    ])
  })

  it('handles a match at each end without emitting empty segments', () => {
    expect(parseSnippet(`${hl('The')} brain ${hl('computer')}`)).toEqual([
      { text: 'The', match: true },
      { text: ' brain ', match: false },
      { text: 'computer', match: true },
    ])
  })

  it('merges runs that would otherwise render as two identical nodes', () => {
    // `ts_headline` emits adjacent terms as separate pairs. Two <mark>s with
    // nothing between them look like one to the eye but read as two to a screen
    // reader, and make assertions elsewhere depend on Postgres' term splitting.
    expect(parseSnippet(`${hl('CPU')}${hl('s')} run`)).toEqual([
      { text: 'CPUs', match: true },
      { text: ' run', match: false },
    ])
  })

  it('never lets a delimiter through into the output', () => {
    const segments = parseSnippet(`a ${hl('b')} c`)
    const joined = segments.map((segment) => segment.text).join('')

    expect(joined).not.toContain(SNIPPET_START)
    expect(joined).not.toContain(SNIPPET_STOP)
    expect(joined).toBe('a b c')
  })

  it('keeps markup as text rather than treating it as markup', () => {
    // The XSS assertion. A paragraph containing a script tag round-trips as
    // eight visible characters in a text node; nothing here produces HTML, and
    // no consumer is handed a string that would be safe to inject.
    const segments = parseSnippet(`<script>alert(1)</script> ${hl('CPU')}`)

    expect(segments[0]).toEqual({ text: '<script>alert(1)</script> ', match: false })
    expect(segments[1]).toEqual({ text: 'CPU', match: true })
  })

  it('degrades to plain text on an unclosed delimiter', () => {
    // Postgres always balances them. A stray U+E000 in the user's own paragraph
    // would not be, and the right answer is a lost highlight, not a crash.
    expect(parseSnippet(`The ${SNIPPET_START}CPU is the brain`)).toEqual([
      { text: 'The CPU is the brain', match: false },
    ])
  })

  it('drops a closer that never opened', () => {
    expect(parseSnippet(`The ${SNIPPET_STOP}CPU`)).toEqual([
      { text: `The ${SNIPPET_STOP}CPU`, match: false },
    ])
  })
})

describe('browseSnippet', () => {
  it('returns nothing for an empty paragraph', () => {
    expect(browseSnippet('')).toEqual([])
  })

  it('passes a short paragraph through unmarked and untruncated', () => {
    expect(browseSnippet('The CPU is the brain')).toEqual([
      { text: 'The CPU is the brain', match: false },
    ])
  })

  it('truncates a long paragraph on a word boundary', () => {
    const paragraph = `${'word '.repeat(100)}end`
    const [segment] = browseSnippet(paragraph)

    expect(segment?.match).toBe(false)
    expect(segment?.text.endsWith('…')).toBe(true)
    expect(segment?.text).not.toContain('  ')
    // The ellipsis is one code point on top of the budget, not inside it.
    expect([...(segment?.text ?? '')].length).toBeLessThanOrEqual(
      SNIPPET_BROWSE_MAX_CODE_POINTS + 1,
    )
  })

  it('truncates by code point, never splitting a surrogate pair', () => {
    // The failure this guards: slicing UTF-16 at a fixed index can cut an emoji
    // in half and emit a lone surrogate, which renders as a replacement glyph.
    const [segment] = browseSnippet('🧠'.repeat(SNIPPET_BROWSE_MAX_CODE_POINTS + 50))
    const text = segment?.text ?? ''

    /**
     * Two branches, and both are needed. The tempting one-liner —
     * `/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/` — is a false positive generator:
     * that class spans high *and* low surrogates, so in a well-formed run of
     * emoji it matches at every low surrogate, whose successor is the next
     * character's high surrogate and therefore not in the lookahead class. It
     * reports valid text as broken.
     *
     * A lone surrogate is specifically a high one with no low after it, or a
     * low one with no high before it.
     */
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    expect(text).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    expect(text.replaceAll('🧠', '')).toBe('…')
  })

  it('ignores a word boundary too early to be worth honouring', () => {
    // One space near the start of a long unbroken run. Cutting there would
    // return four characters instead of two hundred.
    const paragraph = `word ${'x'.repeat(SNIPPET_BROWSE_MAX_CODE_POINTS + 50)}`
    const [segment] = browseSnippet(paragraph)

    expect([...(segment?.text ?? '')].length).toBeGreaterThan(SNIPPET_BROWSE_MAX_CODE_POINTS / 2)
  })
})
