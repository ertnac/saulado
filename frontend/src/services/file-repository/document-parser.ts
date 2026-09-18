import mammoth from 'mammoth'
import { extractTextFromPdfStream, type RepositoryFileType } from '@saulado/shared'

export interface DocumentParsedContent {
  html: string
  readerHtml?: string
  extractedText: string
  hasReaderMode?: boolean
}

function generateReaderContainerHtml(title: string, bodyHtml: string): string {
  return `
    <article class="prose prose-sm sm:prose-base dark:prose-invert max-w-none space-y-4 font-sans text-foreground">
      <h1 class="text-xl font-bold border-b border-border/60 pb-3">${title}</h1>
      <div class="reader-body leading-relaxed space-y-4">
        ${bodyHtml}
      </div>
    </article>
  `
}

export async function parseDocumentContent(
  blob: Blob,
  fileName: string,
  fileType: RepositoryFileType,
): Promise<DocumentParsedContent> {
  const arrayBuffer = await blob.arrayBuffer()

  // 1. DOCX (Word Modern)
  if (fileType === 'docx') {
    try {
      const result = await mammoth.convertToHtml({ arrayBuffer })
      const textResult = await mammoth.extractRawText({ arrayBuffer })

      const html = generateReaderContainerHtml(
        fileName,
        result.value || '<p><em>(Empty document)</em></p>',
      )

      return {
        html,
        extractedText: textResult.value || '',
        hasReaderMode: false,
      }
    } catch (err) {
      console.warn('[document-parser] docx parse failed:', err)
      return {
        html: `<div class="p-4 bg-destructive/10 text-destructive rounded-lg">Could not render Word document format.</div>`,
        extractedText: '',
      }
    }
  }

  // 2. PDF
  if (fileType === 'pdf') {
    const bytes = new Uint8Array(arrayBuffer)
    let extractedText = ''
    try {
      extractedText = extractTextFromPdfStream(bytes)
    } catch (err) {
      console.warn('[document-parser] pdf text extraction error:', err)
    }

    const paragraphs = extractedText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => {
        if (/^(\d+\s+0\s+R\s*)+$/.test(p)) return false
        if (/^XYZ\s+[\d.]+/i.test(p)) return false
        if (/^(FEFF[0-9A-Fa-f\s]+)$/i.test(p)) return false
        if (/^ParentTreeNextKey/i.test(p)) return false
        if (/^PDF m\d+\s+Google Docs/i.test(p)) return false
        return p.length > 0
      })

    const readerBody =
      paragraphs.length > 0
        ? paragraphs.map((p) => `<p>${p.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('')
        : `<p>${extractedText.replace(/</g, '&lt;').replace(/>/g, '&gt;') || '<em>(No selectable text found in this PDF)</em>'}</p>`

    const readerHtml = generateReaderContainerHtml(fileName, readerBody)

    return {
      html: readerHtml,
      readerHtml,
      extractedText: extractedText || fileName,
      hasReaderMode: true,
    }
  }

  // 3. DOC (Legacy Word)
  const bytes = new Uint8Array(arrayBuffer)
  const textRuns: string[] = []
  let currentRun = ''

  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i]
    if (
      code !== undefined &&
      ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9)
    ) {
      currentRun += String.fromCharCode(code)
    } else {
      if (currentRun.trim().length > 4) {
        textRuns.push(currentRun.trim())
      }
      currentRun = ''
    }
  }
  if (currentRun.trim().length > 4) {
    textRuns.push(currentRun.trim())
  }

  const extractedText = textRuns.join('\n\n')
  const bodyHtml = `
    <div class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-400 text-sm mb-4">
      <strong>Legacy Format:</strong> Displaying extracted text runs from Word 97-2003 (.doc).
    </div>
    ${textRuns.map((r) => `<p>${r.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('')}
  `

  return {
    html: generateReaderContainerHtml(fileName, bodyHtml),
    extractedText,
    hasReaderMode: false,
  }
}
