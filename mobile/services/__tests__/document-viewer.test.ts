import { describe, expect, it, vi } from 'vitest'
import vm from 'node:vm'
import JSZip from 'jszip'
import {
  parseDocxContent,
  generatePdfViewerHtml,
  generateReaderHtml,
  loadDocumentContent,
} from '../document-viewer'
import type { RepositoryFile } from '../../lib/offline/types'

vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn(),
  EncodingType: { Base64: 'base64' },
}))

import * as FileSystem from 'expo-file-system/legacy'

describe('document-viewer service', () => {
  describe('parseDocxContent', () => {
    it('returns empty fallback if zip does not contain word/document.xml', async () => {
      const zip = new JSZip()
      zip.file('hello.txt', 'Hello world')
      const base64 = await zip.generateAsync({ type: 'base64' })

      const result = await parseDocxContent(base64)
      expect(result.html).toContain('(Empty document)')
      expect(result.text).toBe('')
    })

    it('extracts paragraphs, headings, bold, italic, and lists from document.xml', async () => {
      const zip = new JSZip()
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Document Title</w:t></w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:rPr><w:b/></w:rPr>
        <w:t>Bold Text &amp; More</w:t>
      </w:r>
      <w:r>
        <w:rPr><w:i/></w:rPr>
        <w:t> and Italic Text</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Bullet Item 1</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Bullet Item 2</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`
      zip.file('word/document.xml', docXml)
      const base64 = await zip.generateAsync({ type: 'base64' })

      const result = await parseDocxContent(base64)
      expect(result.html).toContain('<h1>Document Title</h1>')
      expect(result.html).toContain('<strong>Bold Text &amp; More</strong>')
      expect(result.html).toContain('<em> and Italic Text</em>')
      expect(result.html).toContain('<ul>')
      expect(result.html).toContain('<li>Bullet Item 1</li>')
      expect(result.html).toContain('<li>Bullet Item 2</li>')
      expect(result.html).toContain('</ul>')

      expect(result.text).toContain('Document Title')
      expect(result.text).toContain('Bold Text & More and Italic Text')
      expect(result.text).toContain('Bullet Item 1')
      expect(result.text).toContain('Bullet Item 2')
    })

    it('extracts table rows and cells properly', async () => {
      const zip = new JSZip()
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Header A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Header B</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Val 1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Val 2</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`
      zip.file('word/document.xml', docXml)
      const base64 = await zip.generateAsync({ type: 'base64' })

      const result = await parseDocxContent(base64)
      expect(result.html).toContain('<table border="1"')
      expect(result.html).toContain('<td>Header A</td>')
      expect(result.html).toContain('<td>Header B</td>')
      expect(result.text).toContain('Header A | Header B')
      expect(result.text).toContain('Val 1 | Val 2')
    })
  })

  describe('generatePdfViewerHtml', () => {
    it('includes both pdf.min.js and pdf.worker.min.js in head script tags', () => {
      const html = generatePdfViewerHtml({
        pdfBase64: 'JVBERi0xLjQK',
        fileId: 'test-file-1',
        title: 'Sample PDF',
        isDark: false,
      })

      expect(html).toContain('<script src="pdfjs/pdf.min.js"></script>')
      expect(html).toContain('<script src="pdfjs/pdf.worker.min.js"></script>')
      expect(html).toContain('file:///android_asset/pdfjs/pdf.min.js')
      expect(html).toContain('file:///android_asset/pdfjs/pdf.worker.min.js')
    })

    it('sets workerSrc to empty string to activate synchronous fake worker', () => {
      const html = generatePdfViewerHtml({
        pdfBase64: 'JVBERi0xLjQK',
        fileId: 'test-file-1',
        title: 'Sample PDF',
        isDark: false,
      })

      expect(html).toContain("pdfjsLib.GlobalWorkerOptions.workerSrc = ''")
      expect(html).not.toContain("workerSrc = 'file:///android_asset/pdfjs/pdf.worker.min.js'")
    })

    it('includes responsive watchdog and reader switch fallback', () => {
      const html = generatePdfViewerHtml({
        pdfBase64: 'JVBERi0xLjQK',
        fileId: 'test-file-1',
        title: 'Sample PDF',
        isDark: true,
      })

      expect(html).toContain('loadingWatchdog')
      expect(html).toContain('SWITCH_TO_READER')
      expect(html).toContain('Switch to Fast Reader Mode')
    })

    it('renders custom highlights with appropriate hex conversion', () => {
      const html = generatePdfViewerHtml({
        pdfBase64: 'JVBERi0xLjQK',
        fileId: 'test-file-1',
        title: 'Sample PDF',
        isDark: false,
        highlights: [
          {
            id: 'h-1',
            fileId: 'test-file-1',
            pageNumber: 1,
            text: 'Important concept',
            color: '#3B82F6',
            createdAt: '2026-09-17T00:00:00.000Z',
          },
        ],
      })

      expect(html).toContain('storedHighlights')
      expect(html).toContain('#3B82F6')
      expect(html).toContain('hexToRgba')
    })

    it('generates valid JavaScript syntax inside the PDF viewer and reader script tags', () => {
      const pdfHtml = generatePdfViewerHtml({
        pdfBase64: 'JVBERi0xLjQK',
        fileId: 'test-file-1',
        title: 'Sample PDF',
        isDark: false,
      })
      const scripts = [...pdfHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      expect(scripts.length).toBeGreaterThan(0)
      for (const match of scripts) {
        const code = match[1]
        if (!code || code.includes('document.write')) continue
        expect(() => new vm.Script(code)).not.toThrow()
      }
    })
  })

  describe('generateReaderHtml', () => {
    it('generates reader HTML with zoom and selection script', () => {
      const html = generateReaderHtml({
        title: 'Lecture 1',
        bodyHtml: '<p>Content here</p>',
        isDark: true,
        enableSnippetSelection: true,
      })

      expect(html).toContain('<title>Lecture 1</title>')
      expect(html).toContain('<p>Content here</p>')
      expect(html).toContain('TEXT_SELECTION')
      expect(html).toContain('setDocumentZoom')
    })
  })

  describe('loadDocumentContent', () => {
    it('loads docx file without mammoth dependency', async () => {
      const zip = new JSZip()
      zip.file(
        'word/document.xml',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p></w:body></w:document>',
      )
      const base64 = await zip.generateAsync({ type: 'base64' })
      vi.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce(base64)

      const file: RepositoryFile = {
        id: 'docx-1',
        userId: 'user-1',
        name: 'sample.docx',
        fileUri: 'file:///data/sample.docx',
        fileType: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 1024,
        createdAt: '2026-09-17T00:00:00.000Z',
        updatedAt: '2026-09-17T00:00:00.000Z',
      }

      const result = await loadDocumentContent(file, false)
      expect(result.extractedText).toContain('Hello DOCX')
      expect(result.html).toContain('Hello DOCX')
      expect(result.hasReaderMode).toBe(false)
    })
  })
})
