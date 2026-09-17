import type { RepositoryFileType } from '@saulado/shared'

export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.pptx', '.ppt'] as const

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
]

export function detectFileType(fileName: string, mimeType?: string): RepositoryFileType | null {
  const lowerName = fileName.toLowerCase()
  const lowerMime = (mimeType || '').toLowerCase()

  if (lowerName.endsWith('.pdf') || lowerMime === 'application/pdf') {
    return 'pdf'
  }
  if (
    lowerName.endsWith('.docx') ||
    lowerMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx'
  }
  if (lowerName.endsWith('.doc') || lowerMime === 'application/msword') {
    return 'doc'
  }
  if (
    lowerName.endsWith('.pptx') ||
    lowerMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'pptx'
  }
  if (lowerName.endsWith('.ppt') || lowerMime === 'application/vnd.ms-powerpoint') {
    return 'ppt'
  }
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readSliceAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error || new Error('Failed to read file slice'))
    reader.readAsArrayBuffer(blob)
  })
}

/**
 * Validates magic byte signatures for PDF (%PDF), DOCX/PPTX (PK\x03\x04 zip), and DOC/PPT (0xD0CF11E0).
 */
export async function verifyMagicBytes(
  file: File,
  expectedType: RepositoryFileType,
): Promise<boolean> {
  try {
    const slice = file.slice(0, 16)
    const buffer = await readSliceAsArrayBuffer(slice)
    const bytes = new Uint8Array(buffer)

    if (bytes.length < 4) return false

    if (expectedType === 'pdf') {
      // '%PDF' = 0x25 0x50 0x44 0x46
      return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
    }

    if (expectedType === 'docx' || expectedType === 'pptx') {
      // Zip header = 0x50 0x4B 0x03 0x04
      return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
    }

    if (expectedType === 'doc' || expectedType === 'ppt') {
      // Compound Document header = 0xD0 0xCF 0x11 0xE0
      return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
    }

    return false
  } catch (error) {
    console.warn('[file-validation] magic byte check error:', error)
    return true
  }
}
