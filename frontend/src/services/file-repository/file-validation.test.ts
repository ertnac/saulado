import { describe, expect, it } from 'vitest'
import { detectFileType, formatFileSize, verifyMagicBytes } from './file-validation'

describe('frontend file-validation service', () => {
  describe('detectFileType', () => {
    it('detects PDF files', () => {
      expect(detectFileType('lecture.pdf')).toBe('pdf')
      expect(detectFileType('lecture.PDF')).toBe('pdf')
      expect(detectFileType('file', 'application/pdf')).toBe('pdf')
    })

    it('detects DOCX files', () => {
      expect(detectFileType('notes.docx')).toBe('docx')
      expect(detectFileType('notes.DOCX')).toBe('docx')
      expect(
        detectFileType(
          'file',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).toBe('docx')
    })

    it('detects DOC files', () => {
      expect(detectFileType('old.doc')).toBe('doc')
      expect(detectFileType('old.DOC')).toBe('doc')
      expect(detectFileType('file', 'application/msword')).toBe('doc')
    })

    it('detects PPTX files', () => {
      expect(detectFileType('presentation.pptx')).toBe('pptx')
      expect(detectFileType('slides.PPTX')).toBe('pptx')
      expect(
        detectFileType(
          'file',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ),
      ).toBe('pptx')
    })

    it('detects PPT files', () => {
      expect(detectFileType('lecture.ppt')).toBe('ppt')
      expect(detectFileType('deck.PPT')).toBe('ppt')
      expect(detectFileType('file', 'application/vnd.ms-powerpoint')).toBe('ppt')
    })

    it('rejects unsupported extensions and MIME types', () => {
      expect(detectFileType('image.png')).toBeNull()
      expect(detectFileType('data.csv')).toBeNull()
      expect(detectFileType('script.py')).toBeNull()
      expect(detectFileType('sheet.xlsx')).toBeNull()
      expect(detectFileType('file', 'text/plain')).toBeNull()
    })
  })

  describe('formatFileSize', () => {
    it('formats file sizes accurately', () => {
      expect(formatFileSize(100)).toBe('100 B')
      expect(formatFileSize(2048)).toBe('2.0 KB')
      expect(formatFileSize(1024 * 1024 * 5)).toBe('5.0 MB')
    })
  })

  describe('verifyMagicBytes', () => {
    it('verifies valid PDF magic bytes (%PDF)', async () => {
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35])
      const file = new File([bytes], 'doc.pdf', { type: 'application/pdf' })
      const valid = await verifyMagicBytes(file, 'pdf')
      expect(valid).toBe(true)
    })

    it('verifies valid PPTX magic bytes (PK\\x03\\x04)', async () => {
      const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])
      const file = new File([bytes], 'deck.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })
      const valid = await verifyMagicBytes(file, 'pptx')
      expect(valid).toBe(true)
    })

    it('verifies valid PPT magic bytes (0xD0CF11E0)', async () => {
      const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      const file = new File([bytes], 'deck.ppt', { type: 'application/vnd.ms-powerpoint' })
      const valid = await verifyMagicBytes(file, 'ppt')
      expect(valid).toBe(true)
    })

    it('rejects invalid file headers', async () => {
      const bytes = new Uint8Array([0x00, 0x11, 0x22, 0x33])
      const file = new File([bytes], 'fake.pptx', { type: 'application/octet-stream' })
      const valid = await verifyMagicBytes(file, 'pptx')
      expect(valid).toBe(false)
    })
  })
})
