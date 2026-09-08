import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { getDatabase } from '../lib/offline/db'
import type { RepositoryFile, RepositoryFileType, SQLiteRepositoryFile } from '../lib/offline/types'

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'] as const

const REPOSITORY_DIR = `${FileSystem.documentDirectory ?? ''}repository/`

function generateUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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

/**
 * Validates magic byte signatures for PDF (%PDF), DOCX (PK\x03\x04 zip), and DOC (0xD0CF11E0).
 */
export async function verifyMagicBytes(
  fileUri: string,
  expectedType: RepositoryFileType,
): Promise<boolean> {
  try {
    const base64Header = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 12,
      position: 0,
    })

    if (!base64Header) return false

    // Convert base64 to binary bytes
    const binaryString = atob(base64Header)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    if (expectedType === 'pdf') {
      // '%PDF' = 0x25, 0x50, 0x44, 0x46
      return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
    }

    if (expectedType === 'docx') {
      // Zip standard PK header = 0x50, 0x4B, 0x03, 0x04
      return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
    }

    if (expectedType === 'doc') {
      // Compound Document header = 0xD0, 0xCF, 0x11, 0xE0
      return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
    }

    return false
  } catch (error) {
    console.warn('[file-repository] magic byte verification failed:', error)
    // If reading header fails, fall back to extension check so valid files aren't blocked on quirks
    return true
  }
}

export async function ensureRepositoryDirectory(): Promise<string> {
  const info = await FileSystem.getInfoAsync(REPOSITORY_DIR)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(REPOSITORY_DIR, { intermediates: true })
  }
  return REPOSITORY_DIR
}

function mapRowToRepositoryFile(row: SQLiteRepositoryFile): RepositoryFile {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    fileType: row.file_type,
    mimeType: row.mime_type,
    fileUri: row.file_uri,
    fileSize: row.file_size,
    pageCount: row.page_count ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastViewedAt: row.last_viewed_at ?? null,
  }
}

/**
 * Opens system document picker filtered to PDF, DOC, and DOCX files,
 * validates magic bytes, copies into app sandbox, and saves metadata to SQLite.
 */
export async function pickAndImportFiles(userId: string): Promise<RepositoryFile[]> {
  if (!userId) throw new Error('User must be authenticated to import repository files.')

  const pickResult = await DocumentPicker.getDocumentAsync({
    type: ALLOWED_MIME_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  })

  if (pickResult.canceled || !pickResult.assets || pickResult.assets.length === 0) {
    return []
  }

  await ensureRepositoryDirectory()
  const db = await getDatabase()
  const importedFiles: RepositoryFile[] = []

  for (const asset of pickResult.assets) {
    const rawName = asset.name || 'document'
    const detectedType = detectFileType(rawName, asset.mimeType)

    if (!detectedType) {
      console.warn(`[file-repository] Unsupported file format rejected: ${rawName}`)
      continue
    }

    const isValidHeader = await verifyMagicBytes(asset.uri, detectedType)
    if (!isValidHeader) {
      console.warn(`[file-repository] File header check failed for: ${rawName}`)
      continue
    }

    const fileId = generateUUID()
    const sanitizedName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const destinationPath = `${REPOSITORY_DIR}${fileId}_${sanitizedName}`

    // Copy to persistent sandboxed directory
    await FileSystem.copyAsync({
      from: asset.uri,
      to: destinationPath,
    })

    // Get true size
    let fileSize = asset.size ?? 0
    if (fileSize <= 0) {
      const info = await FileSystem.getInfoAsync(destinationPath)
      if (info.exists && 'size' in info) {
        fileSize = info.size
      }
    }

    const now = new Date().toISOString()
    const mime =
      asset.mimeType ||
      (detectedType === 'pdf'
        ? 'application/pdf'
        : detectedType === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/msword')

    await db.runAsync(
      `INSERT INTO repository_files (
        id, user_id, name, file_type, mime_type, file_uri, file_size, page_count, created_at, updated_at, last_viewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
      [fileId, userId, rawName, detectedType, mime, destinationPath, fileSize, now, now],
    )

    importedFiles.push({
      id: fileId,
      userId,
      name: rawName,
      fileType: detectedType,
      mimeType: mime,
      fileUri: destinationPath,
      fileSize,
      pageCount: null,
      createdAt: now,
      updatedAt: now,
      lastViewedAt: null,
    })
  }

  return importedFiles
}

export async function getRepositoryFiles(
  userId: string,
  filterType?: RepositoryFileType | 'all',
  searchQuery?: string,
): Promise<RepositoryFile[]> {
  if (!userId) return []
  const db = await getDatabase()

  let sql = 'SELECT * FROM repository_files WHERE user_id = ?'
  const params: (string | number)[] = [userId]

  if (filterType && filterType !== 'all') {
    sql += ' AND file_type = ?'
    params.push(filterType)
  }

  if (searchQuery && searchQuery.trim().length > 0) {
    sql += ' AND name LIKE ?'
    params.push(`%${searchQuery.trim()}%`)
  }

  sql += ' ORDER BY updated_at DESC'

  const rows = await db.getAllAsync<SQLiteRepositoryFile>(sql, params)
  return rows.map(mapRowToRepositoryFile)
}

export async function getRepositoryFile(fileId: string): Promise<RepositoryFile | null> {
  if (!fileId) return null
  const db = await getDatabase()
  const row = await db.getFirstAsync<SQLiteRepositoryFile>(
    'SELECT * FROM repository_files WHERE id = ?',
    [fileId],
  )
  return row ? mapRowToRepositoryFile(row) : null
}

export async function deleteRepositoryFile(fileId: string): Promise<void> {
  if (!fileId) return
  const db = await getDatabase()

  const file = await getRepositoryFile(fileId)
  if (file?.fileUri) {
    try {
      await FileSystem.deleteAsync(file.fileUri, { idempotent: true })
    } catch (error) {
      console.warn('[file-repository] could not delete physical file:', error)
    }
  }

  await db.runAsync('DELETE FROM repository_files WHERE id = ?', [fileId])
}

export async function renameRepositoryFile(fileId: string, newName: string): Promise<void> {
  if (!fileId || !newName.trim()) return
  const db = await getDatabase()
  const now = new Date().toISOString()
  await db.runAsync('UPDATE repository_files SET name = ?, updated_at = ? WHERE id = ?', [
    newName.trim(),
    now,
    fileId,
  ])
}

export async function updateFileLastViewed(fileId: string): Promise<void> {
  if (!fileId) return
  const db = await getDatabase()
  const now = new Date().toISOString()
  await db.runAsync('UPDATE repository_files SET last_viewed_at = ? WHERE id = ?', [now, fileId])
}

export interface RepositoryStats {
  totalFiles: number
  totalSizeBytes: number
  pdfCount: number
  docxCount: number
  docCount: number
}

export async function getRepositoryStats(userId: string): Promise<RepositoryStats> {
  if (!userId) {
    return { totalFiles: 0, totalSizeBytes: 0, pdfCount: 0, docxCount: 0, docCount: 0 }
  }
  const db = await getDatabase()
  const rows = await db.getAllAsync<{
    file_type: RepositoryFileType
    count: number
    total_size: number
  }>(
    `SELECT file_type, COUNT(*) as count, SUM(file_size) as total_size 
     FROM repository_files 
     WHERE user_id = ? 
     GROUP BY file_type`,
    [userId],
  )

  let totalFiles = 0
  let totalSizeBytes = 0
  let pdfCount = 0
  let docxCount = 0
  let docCount = 0

  for (const row of rows) {
    totalFiles += row.count
    totalSizeBytes += row.total_size || 0
    if (row.file_type === 'pdf') pdfCount = row.count
    if (row.file_type === 'docx') docxCount = row.count
    if (row.file_type === 'doc') docCount = row.count
  }

  return { totalFiles, totalSizeBytes, pdfCount, docxCount, docCount }
}
