import { describe, expect, it, vi } from 'vitest'
import type { SQLiteDatabase } from '../../lib/offline/db'

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

import {
  createRepositoryFolder,
  deleteRepositoryFolder,
  getRepositoryFiles,
  getRepositoryFolders,
  getRepositoryStats,
  moveFilesToFolder,
  updateRepositoryFolder,
} from '../file-repository'
import { getDatabase } from '../../lib/offline/db'

describe('file-repository folders service', () => {
  describe('createRepositoryFolder', () => {
    it('creates a new folder with valid UUID, name, and color', async () => {
      const mockRunAsync = vi.fn().mockResolvedValue({})
      const mockDb = {
        runAsync: mockRunAsync,
      }
      vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as SQLiteDatabase)

      const folder = await createRepositoryFolder('user-1', 'Science', '#317054')

      expect(folder).toMatchObject({
        userId: 'user-1',
        name: 'Science',
        color: '#317054',
        fileCount: 0,
      })
      expect(typeof folder.id).toBe('string')
      expect(folder.id.length).toBeGreaterThan(0)
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO repository_folders'),
        expect.arrayContaining(['user-1', 'Science', '#317054']),
      )
    })

    it('throws when user is not authenticated or folder name is empty', async () => {
      await expect(createRepositoryFolder('', 'Science')).rejects.toThrow(
        'User must be authenticated',
      )
      await expect(createRepositoryFolder('user-1', '   ')).rejects.toThrow(
        'Folder name cannot be empty',
      )
    })
  })

  describe('getRepositoryFolders', () => {
    it('returns folders with aggregated file count for user', async () => {
      const mockGetAllAsync = vi.fn().mockResolvedValue([
        {
          id: 'folder-1',
          user_id: 'user-1',
          name: 'Science',
          color: '#317054',
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
          file_count: 5,
        },
        {
          id: 'folder-2',
          user_id: 'user-1',
          name: 'Mathematics',
          color: '#2563EB',
          created_at: '2026-09-02T00:00:00.000Z',
          updated_at: '2026-09-02T00:00:00.000Z',
          file_count: 0,
        },
      ])
      const mockDb = { getAllAsync: mockGetAllAsync }
      vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as SQLiteDatabase)

      const folders = await getRepositoryFolders('user-1')

      expect(folders).toHaveLength(2)
      expect(folders[0]).toEqual({
        id: 'folder-1',
        userId: 'user-1',
        name: 'Science',
        color: '#317054',
        fileCount: 5,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      })
      expect(folders[1]?.fileCount).toBe(0)
    })

    it('returns empty array when user_id is empty', async () => {
      const folders = await getRepositoryFolders('')
      expect(folders).toEqual([])
    })
  })

  describe('updateRepositoryFolder', () => {
    it('updates folder name and custom color', async () => {
      const mockRunAsync = vi.fn().mockResolvedValue({})
      const mockDb = { runAsync: mockRunAsync }
      vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as SQLiteDatabase)

      await updateRepositoryFolder('folder-1', 'Advanced Science', '#0E7490')

      expect(mockRunAsync).toHaveBeenCalledWith(
        'UPDATE repository_folders SET name = ?, color = ?, updated_at = ? WHERE id = ?',
        expect.arrayContaining(['Advanced Science', '#0E7490', 'folder-1']),
      )
    })
  })

  describe('deleteRepositoryFolder', () => {
    it('safely unassigns files (sets folder_id to NULL) before deleting folder', async () => {
      const mockRunAsync = vi.fn().mockResolvedValue({})
      const mockDb = {
        runAsync: mockRunAsync,
        withTransactionAsync: vi.fn((cb: () => Promise<void>) => cb()),
      }
      vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as SQLiteDatabase)

      await deleteRepositoryFolder('folder-1')

      // 1. Files safely detached to NULL
      expect(mockRunAsync).toHaveBeenCalledWith(
        'UPDATE repository_files SET folder_id = NULL WHERE folder_id = ?',
        ['folder-1'],
      )
      // 2. Folder deleted
      expect(mockRunAsync).toHaveBeenCalledWith('DELETE FROM repository_folders WHERE id = ?', [
        'folder-1',
      ])
    })
  })

  describe('moveFilesToFolder', () => {
    it('batch moves multiple file IDs into a target folder', async () => {
      const mockRunAsync = vi.fn().mockResolvedValue({})
      const mockDb = { runAsync: mockRunAsync }
      vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as SQLiteDatabase)

      await moveFilesToFolder(['file-1', 'file-2', 'file-3'], 'folder-science')

      expect(mockRunAsync).toHaveBeenCalledWith(
        'UPDATE repository_files SET folder_id = ?, updated_at = ? WHERE id IN (?, ?, ?)',
        expect.arrayContaining(['folder-science', 'file-1', 'file-2', 'file-3']),
      )
    })

    it('batch removes multiple file IDs from folders when target is null', async () => {
      const mockRunAsync = vi.fn().mockResolvedValue({})
      const mockDb = { runAsync: mockRunAsync }
      vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as SQLiteDatabase)

      await moveFilesToFolder(['file-1'], null)

      expect(mockRunAsync).toHaveBeenCalledWith(
        'UPDATE repository_files SET folder_id = ?, updated_at = ? WHERE id IN (?)',
        expect.arrayContaining([null, 'file-1']),
      )
    })
  })

  describe('getRepositoryFiles with folder filter', () => {
    it('applies folder_id = ? filter when a specific folder is selected', async () => {
      const mockGetAllAsync = vi.fn().mockResolvedValue([])
      const mockDb = { getAllAsync: mockGetAllAsync }
      vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as SQLiteDatabase)

      await getRepositoryFiles('user-1', 'all', '', 'folder-science')

      expect(mockGetAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('AND folder_id = ?'),
        expect.arrayContaining(['user-1', 'folder-science']),
      )
    })

    it('applies folder_id IS NULL filter when querying uncategorized', async () => {
      const mockGetAllAsync = vi.fn().mockResolvedValue([])
      const mockDb = { getAllAsync: mockGetAllAsync }
      vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as SQLiteDatabase)

      await getRepositoryFiles('user-1', 'all', '', null)

      expect(mockGetAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('AND folder_id IS NULL'),
        ['user-1'],
      )
    })
  })

  describe('getRepositoryStats', () => {
    it('accurately counts uncategorized files alongside total files', async () => {
      const mockGetAllAsync = vi.fn().mockResolvedValue([
        { file_type: 'pdf', count: 4, total_size: 4000 },
        { file_type: 'docx', count: 2, total_size: 2000 },
      ])
      const mockGetFirstAsync = vi.fn().mockResolvedValue({ count: 3 })
      const mockDb = {
        getAllAsync: mockGetAllAsync,
        getFirstAsync: mockGetFirstAsync,
      }
      vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as SQLiteDatabase)

      const stats = await getRepositoryStats('user-1')

      expect(stats.totalFiles).toBe(6)
      expect(stats.uncategorizedCount).toBe(3)
      expect(stats.pdfCount).toBe(4)
      expect(stats.docxCount).toBe(2)
      expect(mockGetFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('AND folder_id IS NULL'),
        ['user-1'],
      )
    })
  })
})
