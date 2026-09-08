import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(),
}))

vi.mock('../../lib/offline/db', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  copyAsync: vi.fn(),
  deleteAsync: vi.fn(),
  documentDirectory: 'file:///test-dir/',
  EncodingType: { Base64: 'base64' },
}))

import { detectFileType, formatFileSize, verifyMagicBytes } from '../file-repository'
import { generateReaderHtml, generatePdfViewerHtml } from '../document-viewer'
import * as FileSystem from 'expo-file-system/legacy'

describe('file-repository service', () => {
  describe('detectFileType', () => {
    it('detects PDF by extension and MIME', () => {
      expect(detectFileType('lecture_notes.pdf')).toBe('pdf')
      expect(detectFileType('notes.PDF')).toBe('pdf')
      expect(detectFileType('document', 'application/pdf')).toBe('pdf')
    })

    it('detects DOCX by extension and MIME', () => {
      expect(detectFileType('essay_draft.docx')).toBe('docx')
      expect(detectFileType('draft.DOCX')).toBe('docx')
      expect(
        detectFileType(
          'doc',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).toBe('docx')
    })

    it('detects DOC by extension and MIME', () => {
      expect(detectFileType('legacy_report.doc')).toBe('doc')
      expect(detectFileType('old.DOC')).toBe('doc')
      expect(detectFileType('file', 'application/msword')).toBe('doc')
    })

    it('rejects unsupported extensions and MIME types', () => {
      expect(detectFileType('image.png')).toBeNull()
      expect(detectFileType('archive.zip')).toBeNull()
      expect(detectFileType('sheet.xlsx')).toBeNull()
      expect(detectFileType('script.js')).toBeNull()
      expect(detectFileType('notes.txt')).toBeNull()
      expect(detectFileType('file', 'text/plain')).toBeNull()
      expect(detectFileType('file', 'image/jpeg')).toBeNull()
    })
  })

  describe('formatFileSize', () => {
    it('formats bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 B')
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(1024 * 1024 * 3.5)).toBe('3.5 MB')
    })
  })

  describe('verifyMagicBytes', () => {
    it('verifies valid PDF header (%PDF-)', async () => {
      // '%PDF-1.4' base64 = JVBERi0xLjQ=
      vi.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce('JVBERi0xLjQ=')
      const result = await verifyMagicBytes('file:///test.pdf', 'pdf')
      expect(result).toBe(true)
    })

    it('verifies valid DOCX header (PK\\x03\\x04)', async () => {
      // 'PK\x03\x04' base64 = UEsDBA==
      vi.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce('UEsDBA==')
      const result = await verifyMagicBytes('file:///test.docx', 'docx')
      expect(result).toBe(true)
    })

    it('verifies valid DOC header (0xD0CF11E0)', async () => {
      // 0xD0, 0xCF, 0x11, 0xE0 base64 = 0M8R4A==
      const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      const base64 = btoa(String.fromCharCode(...bytes))
      vi.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce(base64)
      const result = await verifyMagicBytes('file:///test.doc', 'doc')
      expect(result).toBe(true)
    })

    it('rejects disguised non-document files', async () => {
      // Random bytes (e.g. text or image)
      const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) // GIF89a
      const base64 = btoa(String.fromCharCode(...bytes))
      vi.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce(base64)
      const result = await verifyMagicBytes('file:///fake.pdf', 'pdf')
      expect(result).toBe(false)
    })
  })

  describe('document-viewer generators', () => {
    it('generates reader HTML containing title and body', () => {
      const html = generateReaderHtml({
        title: 'Sample Document',
        bodyHtml: '<p>Hello world content</p>',
        isDark: true,
      })
      expect(html).toContain('Sample Document')
      expect(html).toContain('Hello world content')
      expect(html).toContain('#031a14') // dark background
    })

    it('generates PDF viewer HTML with pdf.js script and navigation controls', () => {
      const html = generatePdfViewerHtml({
        pdfBase64: 'JVBERg==',
        title: 'Sample PDF',
        isDark: false,
      })
      expect(html).toContain('pdf.js')
      expect(html).toContain('Sample PDF')
      expect(html).toContain('pdf-canvas')
      expect(html).toContain('prevPage()')
      expect(html).toContain('nextPage()')
    })
  })
})
