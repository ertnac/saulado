import { describe, expect, it } from 'vitest'
import { formatDocumentTextLayout } from '../text-formatting'

describe('formatDocumentTextLayout', () => {
  it('formats the user exact screenshot case with bullets and glued words', () => {
    const raw =
      'IntroductionLesson Objectives: • Explain the core components of Information Assurance (IA) andCyber Security. • Differentiate between CIA Triad principles and extended IAsecurity goals. • Map security controls and risk assessments directly to IA pillars.'

    const formatted = formatDocumentTextLayout(raw)

    expect(formatted).toContain('Introduction\n\nLesson Objectives:')
    expect(formatted).toContain(
      '• Explain the core components of Information Assurance (IA) and Cyber Security.',
    )
    expect(formatted).toContain(
      '• Differentiate between CIA Triad principles and extended IA security goals.',
    )
    expect(formatted).toContain(
      '• Map security controls and risk assessments directly to IA pillars.',
    )

    const lines = formatted.split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(4)
  })

  it('formats numbered enumeration lists onto separate lines', () => {
    const raw = 'Requirements: 1. Valid ID 2. Proof of address 3. Passport photograph'
    const formatted = formatDocumentTextLayout(raw)

    expect(formatted).toBe(
      'Requirements:\n1. Valid ID\n2. Proof of address\n3. Passport photograph',
    )
  })

  it('formats lettered enumeration lists onto separate lines', () => {
    const raw = 'Select one: a) First choice b) Second choice c) Third choice'
    const formatted = formatDocumentTextLayout(raw)

    expect(formatted).toBe('Select one:\na) First choice\nb) Second choice\nc) Third choice')
  })

  it('formats dashed and hyphenated list items onto separate lines', () => {
    const raw = 'Key pillars: - Confidentiality - Integrity - Availability'
    const formatted = formatDocumentTextLayout(raw)

    expect(formatted).toBe('Key pillars:\n- Confidentiality\n- Integrity\n- Availability')
  })

  it('fixes glued words after periods and parentheses', () => {
    const raw = 'First sentence.Second sentence (IA)is important.'
    const formatted = formatDocumentTextLayout(raw)

    expect(formatted).toContain('First sentence. Second sentence')
    expect(formatted).toContain('(IA) is important.')
  })

  it('handles empty or blank input gracefully', () => {
    expect(formatDocumentTextLayout('')).toBe('')
    expect(formatDocumentTextLayout('   \n  ')).toBe('')
  })
})
