import type { RepositoryFileType } from '@saulado/shared'

export interface LocalRepositoryFile {
  id: string
  userId: string
  cloudFileId?: string
  name: string
  fileType: RepositoryFileType
  mimeType: string
  fileSize: number
  blob: Blob
  createdAt: string
  updatedAt: string
  lastViewedAt: string | null
}

const DB_NAME = 'saulado-file-repository'
const DB_VERSION = 1
const STORE_NAME = 'files'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('userId', 'userId', { unique: false })
        store.createIndex('cloudFileId', 'cloudFileId', { unique: false })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open database'))
  })
}

export async function saveLocalFile(file: LocalRepositoryFile): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(file)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('Failed to save file'))
  })
}

export async function listLocalFiles(userId: string): Promise<LocalRepositoryFile[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('userId')
    const req = index.getAll(userId)

    req.onsuccess = () => {
      const results = (req.result as LocalRepositoryFile[]) || []
      // Sort newest first
      results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      resolve(results)
    }
    req.onerror = () => reject(req.error ?? new Error('Failed to list files'))
  })
}

export async function getLocalFile(id: string): Promise<LocalRepositoryFile | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(id)
    req.onsuccess = () => resolve((req.result as LocalRepositoryFile) || null)
    req.onerror = () => reject(req.error ?? new Error('Failed to get file'))
  })
}

export async function deleteLocalFile(id: string): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('Failed to delete file'))
  })
}

export async function updateLocalLastViewed(id: string): Promise<void> {
  const item = await getLocalFile(id)
  if (!item) return
  item.lastViewedAt = new Date().toISOString()
  await saveLocalFile(item)
}
