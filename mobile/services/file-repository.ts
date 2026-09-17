import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import type {
  CloudFileListResponse,
  CloudFileSummary,
  ConvertPptRequest,
  ConvertPptResponse,
} from '@saulado/shared'
import { onlineManager } from '@tanstack/react-query'
import { getDatabase } from '../lib/offline/db'
import type { RepositoryFile, RepositoryFileType, SQLiteRepositoryFile } from '../lib/offline/types'
import { authorizedRequest, getAccessToken } from './api'
import { apiUrl } from './config'

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

export const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'] as const

export function getRepositoryDir(): string {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || ''
  return `${base.replace(/\/$/, '')}/repository/`
}

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

    if (expectedType === 'docx' || expectedType === 'pptx') {
      // Zip standard PK header = 0x50, 0x4B, 0x03, 0x04
      return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
    }

    if (expectedType === 'doc' || expectedType === 'ppt') {
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
  const dir = getRepositoryDir()
  const info = await FileSystem.getInfoAsync(dir)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
  }
  return dir
}

function mapRowToRepositoryFile(row: SQLiteRepositoryFile): RepositoryFile {
  return {
    id: row.id,
    userId: row.user_id,
    cloudFileId: row.cloud_file_id ?? null,
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

export interface ImportProgressUpdate {
  step: 1 | 2 | 3
  title: string
  detail: string
  fileName: string
}

export type ImportProgressCallback = (update: ImportProgressUpdate) => void

/**
 * Opens system document picker filtered to PDF, DOC, and DOCX files,
 * validates magic bytes, copies into app sandbox, and saves metadata to SQLite.
 */
export async function pickAndImportFiles(
  userId: string,
  onProgress?: ImportProgressCallback,
): Promise<RepositoryFile[]> {
  if (!userId) throw new Error('User must be authenticated to import repository files.')

  const pickResult = await DocumentPicker.getDocumentAsync({
    type: ALLOWED_MIME_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  })

  if (pickResult.canceled || !pickResult.assets || pickResult.assets.length === 0) {
    return []
  }

  const repoDir = await ensureRepositoryDirectory()
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
    let finalFileType: RepositoryFileType = detectedType
    let finalName = rawName
    let finalMime = asset.mimeType || 'application/octet-stream'
    let destinationPath = ''
    let fileSize = 0

    if (detectedType === 'pptx' || detectedType === 'ppt') {
      onProgress?.({
        step: 1,
        title: 'Step 1 of 3: Preparing & Uploading',
        detail: `Reading "${rawName}" and connecting to conversion engine...`,
        fileName: rawName,
      })

      if (!onlineManager.isOnline()) {
        throw new Error(
          'PowerPoint presentation conversion requires an active internet connection to preserve slide layout. Please connect to the internet to import.',
        )
      }

      const token = getAccessToken()
      if (!token) {
        throw new Error(
          'Please sign in to your account first so the presentation can be converted into a study PDF.',
        )
      }

      const dataBase64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })

      onProgress?.({
        step: 2,
        title: 'Step 2 of 3: Converting to Vector PDF',
        detail: 'Rendering slides, vector graphics, and selectable text layer...',
        fileName: rawName,
      })

      let converted: ConvertPptResponse
      try {
        converted = await authorizedRequest<ConvertPptResponse>('/api/files/convert-ppt', {
          method: 'POST',
          timeoutMs: 120000,
          body: {
            name: rawName,
            mimeType: asset.mimeType,
            dataBase64,
          } satisfies ConvertPptRequest,
        })
      } catch (convErr: unknown) {
        const anyErr = convErr as { status?: number; message?: string }
        if (anyErr?.status === 404) {
          throw new Error(
            'The presentation conversion service is not available on this server yet. Please ensure the backend is updated and deployed.',
          )
        }
        if (
          anyErr?.message?.includes('Network request failed') ||
          anyErr?.status === 502 ||
          anyErr?.status === 504
        ) {
          throw new Error(
            'Could not reach the conversion server. Please check your internet connection and verify the server is running.',
          )
        }
        throw new Error(`Presentation conversion failed: ${anyErr?.message || 'Server error'}.`)
      }

      onProgress?.({
        step: 3,
        title: 'Step 3 of 3: Saving Offline',
        detail: 'Writing study document into your on-device library...',
        fileName: converted.file.name,
      })

      finalFileType = 'pdf'
      finalName = converted.file.name
      finalMime = 'application/pdf'
      fileSize = converted.file.fileSize

      const sanitizedName = finalName.replace(/[^a-zA-Z0-9._-]/g, '_')
      destinationPath = `${repoDir}${fileId}_${sanitizedName}`

      await FileSystem.writeAsStringAsync(destinationPath, converted.file.dataBase64, {
        encoding: FileSystem.EncodingType.Base64,
      })
    } else {
      onProgress?.({
        step: 1,
        title: 'Step 1 of 3: Preparing File',
        detail: `Verifying structure for "${rawName}"...`,
        fileName: rawName,
      })

      const sanitizedName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
      destinationPath = `${repoDir}${fileId}_${sanitizedName}`

      // Copy to persistent sandboxed directory
      await FileSystem.copyAsync({
        from: asset.uri,
        to: destinationPath,
      })

      fileSize = asset.size ?? 0
      if (fileSize <= 0) {
        const info = await FileSystem.getInfoAsync(destinationPath)
        if (info.exists && 'size' in info) {
          fileSize = info.size
        }
      }

      onProgress?.({
        step: 3,
        title: 'Step 3 of 3: Saving Offline',
        detail: 'Storing in on-device SQLite database...',
        fileName: rawName,
      })

      finalMime =
        asset.mimeType ||
        (detectedType === 'pdf'
          ? 'application/pdf'
          : detectedType === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/msword')
    }

    const now = new Date().toISOString()

    await db.runAsync(
      `INSERT INTO repository_files (
        id, user_id, name, file_type, mime_type, file_uri, file_size, page_count, created_at, updated_at, last_viewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
      [fileId, userId, finalName, finalFileType, finalMime, destinationPath, fileSize, now, now],
    )

    importedFiles.push({
      id: fileId,
      userId,
      name: finalName,
      fileType: finalFileType,
      mimeType: finalMime,
      fileUri: destinationPath,
      fileSize,
      pageCount: null,
      createdAt: now,
      updatedAt: now,
      lastViewedAt: null,
    })
  }

  if (pickResult.assets.length > 0 && importedFiles.length === 0) {
    throw new Error(
      'None of the selected files could be imported. Please verify that the files are valid PDF, Word (.docx/.doc), or PowerPoint (.pptx/.ppt) documents.',
    )
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
    'SELECT * FROM repository_files WHERE id = ? OR cloud_file_id = ? LIMIT 1',
    [fileId, fileId],
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

/**
 * Fetches the user's online files from the cloud account.
 */
export async function fetchCloudFiles(): Promise<CloudFileSummary[]> {
  const response = await authorizedRequest<CloudFileListResponse>('/api/files')
  return response.files
}

/**
 * Downloads a cloud file from the backend API into the mobile device sandbox,
 * verifies magic bytes, and records it in SQLite so it becomes available 100% offline.
 */
export async function downloadCloudFile(
  cloudFile: CloudFileSummary,
  userId: string,
): Promise<RepositoryFile> {
  if (!userId) throw new Error('User must be authenticated to download cloud files.')

  const repoDir = await ensureRepositoryDirectory()
  const db = await getDatabase()

  const sanitizedName = cloudFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const destinationPath = `${repoDir}${cloudFile.id}_${sanitizedName}`

  const downloadUrl = apiUrl(`/api/files/${cloudFile.id}/download`)
  const token = getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const downloadResult = await FileSystem.downloadAsync(downloadUrl, destinationPath, {
    headers,
  })

  if (downloadResult.status < 200 || downloadResult.status >= 300) {
    throw new Error(`Cloud download failed with status ${downloadResult.status}`)
  }

  // Verify file validity
  const isValid = await verifyMagicBytes(destinationPath, cloudFile.fileType)
  if (!isValid) {
    console.warn(`[file-repository] Downloaded file failed magic bytes check: ${cloudFile.name}`)
  }

  const now = new Date().toISOString()
  let localFileId = generateUUID()

  // Check if row already exists in SQLite for this cloud file
  const existing = await db.getFirstAsync<SQLiteRepositoryFile>(
    'SELECT * FROM repository_files WHERE cloud_file_id = ? AND user_id = ?',
    [cloudFile.id, userId],
  )

  if (existing) {
    localFileId = existing.id
    await db.runAsync(
      'UPDATE repository_files SET file_uri = ?, file_size = ?, updated_at = ? WHERE id = ?',
      [destinationPath, cloudFile.fileSize, now, existing.id],
    )
  } else {
    await db.runAsync(
      `INSERT INTO repository_files (
        id, user_id, cloud_file_id, name, file_type, mime_type, file_uri, file_size, page_count, created_at, updated_at, last_viewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
      [
        localFileId,
        userId,
        cloudFile.id,
        cloudFile.name,
        cloudFile.fileType,
        cloudFile.mimeType,
        destinationPath,
        cloudFile.fileSize,
        now,
        now,
      ],
    )
  }

  return {
    id: localFileId,
    userId,
    cloudFileId: cloudFile.id,
    name: cloudFile.name,
    fileType: cloudFile.fileType,
    mimeType: cloudFile.mimeType,
    fileUri: destinationPath,
    fileSize: cloudFile.fileSize,
    pageCount: null,
    createdAt: now,
    updatedAt: now,
    lastViewedAt: null,
  }
}

/**
 * Removes a file from the user's cloud account.
 */
export async function deleteCloudFile(cloudFileId: string): Promise<void> {
  await authorizedRequest<void>(`/api/files/${cloudFileId}`, {
    method: 'DELETE',
  })
}

/**
 * Returns a map of cloudFileId -> localFileId for all files currently downloaded on device.
 */
export async function getDownloadedCloudFileMap(userId: string): Promise<Map<string, string>> {
  if (!userId) return new Map()
  const db = await getDatabase()
  const rows = await db.getAllAsync<{ id: string; cloud_file_id: string }>(
    'SELECT id, cloud_file_id FROM repository_files WHERE user_id = ? AND cloud_file_id IS NOT NULL',
    [userId],
  )
  const map = new Map<string, string>()
  for (const r of rows) {
    if (r.cloud_file_id) {
      map.set(r.cloud_file_id, r.id)
    }
  }
  return map
}
