import { cleanOcrText } from './ocr-cleanup'

const TEXT_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
])

const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'pdf'])

export function isDocumentFile(file: File): boolean {
  if (TEXT_MIMES.has(file.type.toLowerCase())) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext !== undefined && TEXT_EXTS.has(ext)
}

export async function readFileAsText(file: File | Blob): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file as text'))
    reader.readAsText(file)
  })
}

export async function readFileAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result instanceof ArrayBuffer ? reader.result : new ArrayBuffer(0)
      resolve(result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file as arrayBuffer'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Extracts raw text from a PDF file using basic text stream scanning or fallback.
 */
async function extractPdfText(file: File): Promise<string> {
  const buffer = await readFileAsArrayBuffer(file)
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const content = decoder.decode(bytes)

  // Find all text within PDF stream text operators (e.g. BT ... ET blocks and (string) Tj / [...] TJ)
  const textMatches: string[] = []
  const tjRegex = /\(([^)]+)\)\s*Tj/g
  let match: RegExpExecArray | null

  while ((match = tjRegex.exec(content)) !== null) {
    if (match[1] && match[1].trim().length > 0) {
      // Unescape basic PDF escape sequences
      const unescaped = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
      textMatches.push(unescaped)
    }
  }

  if (textMatches.length > 0) {
    return textMatches.join(' ')
  }

  // Fallback: search for readable text blocks if standard Tj was not matched
  const cleanMatches = content.match(/[A-Za-z0-9,.;:'"!?\s-]{10,}/g)
  if (cleanMatches && cleanMatches.length > 0) {
    return cleanMatches.join('\n\n')
  }

  throw new Error(
    'Could not extract text from this PDF. If it is a scanned image PDF, please export the page as a PNG or JPEG.',
  )
}

export async function processDocumentText(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  onProgress?.(0.2)

  if (ext === 'pdf' || file.type === 'application/pdf') {
    onProgress?.(0.6)
    const pdfText = await extractPdfText(file)
    onProgress?.(1.0)
    return cleanOcrText(pdfText)
  }

  // Plain text / Markdown / CSV
  onProgress?.(0.5)
  const raw = await readFileAsText(file)
  onProgress?.(1.0)
  return cleanOcrText(raw)
}
