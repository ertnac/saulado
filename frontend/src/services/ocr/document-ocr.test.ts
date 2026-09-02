import { describe, expect, it } from 'vitest'
import { isDocumentFile, processDocumentText } from './document-ocr'

describe('document-ocr', () => {
  it('identifies document files by mime or extension', () => {
    const txtFile = new File(['Hello'], 'notes.txt', { type: 'text/plain' })
    const mdFile = new File(['# Title'], 'notes.md', { type: 'text/markdown' })
    const pdfFile = new File(['%PDF'], 'document.pdf', { type: 'application/pdf' })
    const imgFile = new File(['bytes'], 'photo.png', { type: 'image/png' })

    expect(isDocumentFile(txtFile)).toBe(true)
    expect(isDocumentFile(mdFile)).toBe(true)
    expect(isDocumentFile(pdfFile)).toBe(true)
    expect(isDocumentFile(imgFile)).toBe(false)
  })

  it('processes plain text files correctly', async () => {
    const txtFile = new File(
      ['Photosynthesis converts light into chemical energy.'],
      'biology.txt',
      { type: 'text/plain' },
    )

    const text = await processDocumentText(txtFile)
    expect(text).toContain('Photosynthesis converts light into chemical energy.')
  })
})
