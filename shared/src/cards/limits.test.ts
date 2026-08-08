import { describe, expect, it } from 'vitest'
import {
  ANSWERS_MAX_PER_CARD,
  DEFAULT_SET_COLOR,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  PARAGRAPH_MAX_CODE_POINTS,
  SET_COLORS,
  isSetColor,
  normalizeTag,
  normalizeTags,
} from './limits.js'

describe('normalizeTag', () => {
  it('lowercases and trims', () => {
    expect(normalizeTag('  Cell Biology  ')).toBe('cell biology')
  })

  it('collapses inner whitespace', () => {
    // Otherwise "cell  biology" and "cell biology" are two rows in the user's
    // autocomplete list that render identically.
    expect(normalizeTag('cell   biology')).toBe('cell biology')
    expect(normalizeTag('cell\tbiology')).toBe('cell biology')
  })

  it('leaves an already-canonical tag untouched', () => {
    expect(normalizeTag('anatomy')).toBe('anatomy')
  })

  it('reduces a whitespace-only tag to empty, for the caller to drop', () => {
    expect(normalizeTag('   ')).toBe('')
  })

  it('preserves non-Latin scripts and case-folds them where defined', () => {
    expect(normalizeTag('Biologie Cellulaire')).toBe('biologie cellulaire')
    expect(normalizeTag('日本語')).toBe('日本語')
  })
})

describe('normalizeTags', () => {
  it('de-duplicates case variants', () => {
    expect(normalizeTags(['Anatomy', 'anatomy', 'ANATOMY'])).toEqual(['anatomy'])
  })

  it('preserves first-seen order rather than sorting', () => {
    // Sorting on save makes the tag field appear to shuffle itself the moment
    // the user hits submit.
    expect(normalizeTags(['zebra', 'apple', 'mango'])).toEqual(['zebra', 'apple', 'mango'])
  })

  it('drops empty and whitespace-only entries', () => {
    expect(normalizeTags(['anatomy', '', '   ', 'biology'])).toEqual(['anatomy', 'biology'])
  })

  it('returns an empty array for an empty input', () => {
    expect(normalizeTags([])).toEqual([])
  })
})

describe('set colours', () => {
  it('accepts every advertised colour', () => {
    for (const color of SET_COLORS) {
      expect(isSetColor(color)).toBe(true)
    }
  })

  it('rejects anything else, including a plausible hex', () => {
    for (const value of ['#ff0000', 'rebeccapurple', '', null, undefined, 42]) {
      expect(isSetColor(value)).toBe(false)
    }
  })

  it('defaults to a colour that is actually in the list', () => {
    expect(isSetColor(DEFAULT_SET_COLOR)).toBe(true)
  })
})

describe('the limits themselves', () => {
  it('caps a page below the paragraph cap, so one page cannot be megabytes', () => {
    // 50 cards × 5,000 code points is already ~250 KB of paragraph text before
    // answers. Worth keeping in view when either number is raised.
    expect(PAGE_SIZE_MAX).toBeLessThan(PARAGRAPH_MAX_CODE_POINTS)
    expect(PAGE_SIZE_DEFAULT).toBeLessThanOrEqual(PAGE_SIZE_MAX)
  })

  it('allows more answers than a card sensibly needs but bounds the overlap check', () => {
    expect(ANSWERS_MAX_PER_CARD).toBeGreaterThan(1)
    expect(ANSWERS_MAX_PER_CARD).toBeLessThanOrEqual(50)
  })
})
