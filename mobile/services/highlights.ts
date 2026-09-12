import type { PdfHighlight } from '@saulado/shared'
import { getDatabase } from '../lib/offline/db'
import type { SQLiteFileHighlight } from '../lib/offline/types'

function generateUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'hl-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36)
}

function mapRowToHighlight(row: SQLiteFileHighlight): PdfHighlight {
  return {
    id: row.id,
    fileId: row.file_id,
    pageNumber: row.page_number,
    text: row.text,
    startOffset: row.start_offset ?? undefined,
    endOffset: row.end_offset ?? undefined,
    color: (row.color as PdfHighlight['color']) || 'yellow',
    createdAt: row.created_at,
  }
}

/**
 * Retrieves all stored highlights for a given file, optionally filtered by page number.
 */
export async function getFileHighlights(
  fileId: string,
  pageNumber?: number,
): Promise<PdfHighlight[]> {
  if (!fileId) return []
  const db = await getDatabase()

  let sql = 'SELECT * FROM file_highlights WHERE file_id = ?'
  const params: (string | number)[] = [fileId]

  if (pageNumber !== undefined) {
    sql += ' AND page_number = ?'
    params.push(pageNumber)
  }

  sql += ' ORDER BY created_at ASC'

  const rows = await db.getAllAsync<SQLiteFileHighlight>(sql, params)
  return rows.map(mapRowToHighlight)
}

/**
 * Saves a new highlight into SQLite.
 */
export async function saveFileHighlight(
  userId: string,
  input: Omit<PdfHighlight, 'id' | 'createdAt'>,
): Promise<PdfHighlight> {
  const db = await getDatabase()
  const id = generateUUID()
  const now = new Date().toISOString()
  const color = input.color || 'yellow'

  await db.runAsync(
    `INSERT INTO file_highlights (
      id, file_id, user_id, page_number, text, start_offset, end_offset, color, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.fileId,
      userId,
      input.pageNumber,
      input.text.trim(),
      input.startOffset ?? null,
      input.endOffset ?? null,
      color,
      now,
    ],
  )

  return {
    id,
    fileId: input.fileId,
    pageNumber: input.pageNumber,
    text: input.text.trim(),
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    color,
    createdAt: now,
  }
}

/**
 * Deletes a highlight by ID.
 */
export async function deleteFileHighlight(id: string): Promise<void> {
  if (!id) return
  const db = await getDatabase()
  await db.runAsync('DELETE FROM file_highlights WHERE id = ?', [id])
}
