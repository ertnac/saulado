import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
}))

vi.mock('../api', () => ({
  authorizedRequest: vi.fn(),
  getAccessToken: vi.fn(() => 'mock-token'),
  apiUrl: vi.fn((path: string) => `http://localhost:3000${path}`),
}))

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
  downloadAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  documentDirectory: 'file:///test-dir/',
  EncodingType: { Base64: 'base64' },
}))

import * as DocumentPicker from 'expo-document-picker'
import {
  detectFileType,
  formatFileSize,
  verifyMagicBytes,
  fetchCloudFiles,
  getDownloadedCloudFileMap,
  pickAndImportFiles,
  type ImportProgressUpdate,
} from '../file-repository'
import { generateReaderHtml, generatePdfViewerHtml } from '../document-viewer'
import * as FileSystem from 'expo-file-system/legacy'
import { authorizedRequest } from '../api'
import { getDatabase } from '../../lib/offline/db'

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

    it('detects PPTX by extension and MIME', () => {
      expect(detectFileType('presentation.pptx')).toBe('pptx')
      expect(detectFileType('slides.PPTX')).toBe('pptx')
      expect(
        detectFileType(
          'file',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ),
      ).toBe('pptx')
    })

    it('detects PPT by extension and MIME', () => {
      expect(detectFileType('lecture.ppt')).toBe('ppt')
      expect(detectFileType('deck.PPT')).toBe('ppt')
      expect(detectFileType('file', 'application/vnd.ms-powerpoint')).toBe('ppt')
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

    it('verifies valid PPTX header (PK\\x03\\x04)', async () => {
      vi.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce('UEsDBA==')
      const result = await verifyMagicBytes('file:///test.pptx', 'pptx')
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

    it('verifies valid PPT header (0xD0CF11E0)', async () => {
      const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      const base64 = btoa(String.fromCharCode(...bytes))
      vi.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce(base64)
      const result = await verifyMagicBytes('file:///test.ppt', 'ppt')
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

    it('generates continuous scroll PDF viewer HTML with page container and indicator', () => {
      const html = generatePdfViewerHtml({
        pdfBase64: 'JVBERg==',
        title: 'Sample PDF',
        isDark: false,
      })
      expect(html).toContain('pdf.js')
      expect(html).toContain('Sample PDF')
      expect(html).toContain('pdf-container')
      expect(html).toContain('page-indicator')
      expect(html).not.toContain('prevPage()')
      expect(html).not.toContain('nextPage()')
      expect(html).toContain('IntersectionObserver')
      expect(html).toContain('page-wrapper')
    })

    it('embeds highlights and dark mode styles in continuous scroll PDF viewer', () => {
      const highlights = [
        {
          id: 'hl-1',
          fileId: 'file-1',
          userId: 'user-1',
          pageNumber: 2,
          text: 'Highlighted concept',
          startOffset: 10,
          endOffset: 29,
          color: 'yellow' as const,
          createdAt: '2026-09-16T00:00:00.000Z',
        },
      ]
      const html = generatePdfViewerHtml({
        pdfBase64: 'JVBERg==',
        title: 'Dark PDF',
        isDark: true,
        highlights,
      })
      expect(html).toContain('#031a14')
      expect(html).toContain('Highlighted concept')
      expect(html).toContain('PDF_PAGE_CHANGED')
      expect(html).toContain('PDF_TEXT_SELECTION')
      expect(html).toContain("closest('.page-wrapper')")
    })
  })

  describe('cloud files integration', () => {
    it('fetches cloud files through authorizedRequest', async () => {
      const mockList = [
        {
          id: 'cloud-1',
          name: 'biology.pdf',
          fileType: 'pdf' as const,
          fileSize: 1024,
          mimeType: 'application/pdf',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ]
      vi.mocked(authorizedRequest).mockResolvedValueOnce({ files: mockList })

      const result = await fetchCloudFiles()
      expect(authorizedRequest).toHaveBeenCalledWith('/api/files')
      expect(result).toEqual(mockList)
    })

    it('returns a map of downloaded cloud file ids to local file ids', async () => {
      const mockDb = {
        getAllAsync: vi.fn().mockResolvedValueOnce([
          { id: 'local-1', cloud_file_id: 'cloud-1' },
          { id: 'local-2', cloud_file_id: 'cloud-2' },
        ]),
      }
      vi.mocked(getDatabase).mockResolvedValueOnce(
        mockDb as unknown as ReturnType<typeof getDatabase> extends Promise<infer U> ? U : never,
      )

      const map = await getDownloadedCloudFileMap('user-123')
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('cloud_file_id IS NOT NULL'),
        ['user-123'],
      )
      expect(map.get('cloud-1')).toBe('local-1')
      expect(map.get('cloud-2')).toBe('local-2')
      expect(map.get('cloud-3')).toBeUndefined()
    })
  })

  describe('pickAndImportFiles progress callback', () => {
    it('notifies 3 distinct steps when importing a PowerPoint presentation', async () => {
      vi.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: 'file:///sample.pptx',
            name: 'Microeconomics.pptx',
            mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            size: 5000,
            lastModified: 0,
          },
        ],
      })

      vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
        exists: true,
        isDirectory: true,
        uri: 'file:///test-dir/',
        size: 5000,
        modificationTime: 0,
      })

      // Magic bytes for PPTX (PK.. -> 50 4B 03 04)
      vi.mocked(FileSystem.readAsStringAsync).mockImplementation((_uri, options) => {
        if (options && 'length' in options) {
          return Promise.resolve('UEsDBBQAAAAIAAA=')
        }
        return Promise.resolve('mock-base64-pptx')
      })

      // Backend conversion response
      vi.mocked(authorizedRequest).mockResolvedValueOnce({
        file: {
          name: 'Microeconomics.pdf',
          fileSize: 4500,
          dataBase64: 'JVBERi0xLjQK...',
        },
      })

      const mockDb = {
        runAsync: vi.fn().mockResolvedValue({}),
      }
      vi.mocked(getDatabase).mockResolvedValue(
        mockDb as unknown as ReturnType<typeof getDatabase> extends Promise<infer U> ? U : never,
      )

      const progressEvents: ImportProgressUpdate[] = []
      const imported = await pickAndImportFiles('user-1', (update) => {
        progressEvents.push(update)
      })

      expect(imported).toHaveLength(1)
      expect(imported[0]?.name).toBe('Microeconomics.pdf')
      expect(imported[0]?.fileType).toBe('pdf')

      // Verify all 3 steps fired
      expect(progressEvents.map((p) => p.step)).toEqual([1, 2, 3])
      expect(progressEvents[0]?.title).toContain('Step 1 of 3')
      expect(progressEvents[1]?.title).toContain('Step 2 of 3')
      expect(progressEvents[2]?.title).toContain('Step 3 of 3')
    })
  })
})
