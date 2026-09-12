import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockRunAsync = vi.fn()
const mockGetAllAsync = vi.fn()

vi.mock('../../lib/offline/db', () => ({
  getDatabase: vi.fn(() =>
    Promise.resolve({
      runAsync: mockRunAsync,
      getAllAsync: mockGetAllAsync,
    }),
  ),
}))

import { getFileHighlights, saveFileHighlight, deleteFileHighlight } from '../highlights'

describe('highlights service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retrieves highlights for a file', async () => {
    mockGetAllAsync.mockResolvedValueOnce([
      {
        id: 'hl-1',
        file_id: 'file-123',
        user_id: 'user-1',
        page_number: 2,
        text: 'Important concept on page 2',
        start_offset: 10,
        end_offset: 37,
        color: 'yellow',
        created_at: '2026-09-12T10:00:00.000Z',
      },
    ])

    const results = await getFileHighlights('file-123')
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('hl-1')
    expect(results[0]?.text).toBe('Important concept on page 2')
    expect(results[0]?.pageNumber).toBe(2)
    expect(results[0]?.startOffset).toBe(10)
    expect(results[0]?.endOffset).toBe(37)
    expect(results[0]?.color).toBe('yellow')
  })

  it('filters highlights by page number when provided', async () => {
    mockGetAllAsync.mockResolvedValueOnce([])
    await getFileHighlights('file-123', 3)
    expect(mockGetAllAsync).toHaveBeenCalledWith(expect.stringContaining('AND page_number = ?'), [
      'file-123',
      3,
    ])
  })

  it('saves a new highlight with default and custom colors', async () => {
    mockRunAsync.mockResolvedValueOnce({ changes: 1 })

    const saved = await saveFileHighlight('user-1', {
      fileId: 'file-123',
      pageNumber: 4,
      text: 'Mitochondria is the powerhouse of the cell',
      startOffset: 0,
      endOffset: 42,
      color: 'emerald',
    })

    expect(saved.id).toBeDefined()
    expect(saved.fileId).toBe('file-123')
    expect(saved.pageNumber).toBe(4)
    expect(saved.text).toBe('Mitochondria is the powerhouse of the cell')
    expect(saved.color).toBe('emerald')
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO file_highlights'),
      expect.arrayContaining([
        'file-123',
        'user-1',
        4,
        'Mitochondria is the powerhouse of the cell',
      ]),
    )
  })

  it('deletes a highlight by ID', async () => {
    mockRunAsync.mockResolvedValueOnce({ changes: 1 })
    await deleteFileHighlight('hl-999')
    expect(mockRunAsync).toHaveBeenCalledWith('DELETE FROM file_highlights WHERE id = ?', [
      'hl-999',
    ])
  })
})
