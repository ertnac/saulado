import type { RepositoryFileType } from '@saulado/shared'

export const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc'] as const

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
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
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Validates magic byte signatures for PDF (%PDF), DOCX (PK\x03\x04 zip), and DOC (0xD0CF11E0).
 */
export async function verifyMagicBytes(
  file: File,
  expectedType: RepositoryFileType,
): Promise<boolean> {
  try {
    const slice = file.slice(0, 16)
    const buffer = await slice.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    if (bytes.length < 4) return false

    if (expectedType === 'pdf') {
      // '%PDF' = 0x25 0x50 0x44 0x46
      return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
    }

    if (expectedType === 'docx') {
      // Zip header = 0x50 0x4B 0x03 0x04
      return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
    }

    if (expectedType === 'doc') {
      // Compound Document header = 0xD0 0xCF 0x11 0xE0
      return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
    }

    return false
  } catch (error) {
    console.warn('[file-validation] magic byte check error:', error)
    return true
  }
}
