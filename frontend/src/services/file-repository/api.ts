import type {
  CloudFileListResponse,
  CloudFileSummary,
  ConvertPptRequest,
  ConvertPptResponse,
  RepositoryFileType,
  UploadCloudFileResponse,
} from '@saulado/shared'
import { authorizedRequest, getAccessToken } from '../api'
import { apiUrl } from '../config'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Extract pure base64 without data: prefix
      const base64 = result.includes(',') ? (result.split(',')[1] ?? '') : result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file as base64'))
    reader.readAsDataURL(file)
  })
}

export async function fetchCloudFiles(): Promise<CloudFileSummary[]> {
  const response = await authorizedRequest<CloudFileListResponse>('/api/files')
  return response.files
}

export async function uploadCloudFile(
  file: File,
  fileType: RepositoryFileType,
): Promise<CloudFileSummary> {
  const dataBase64 = await fileToBase64(file)
  const response = await authorizedRequest<UploadCloudFileResponse>('/api/files', {
    method: 'POST',
    body: {
      name: file.name,
      fileType,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      dataBase64,
    },
  })
  return response.file
}

export async function deleteCloudFile(id: string): Promise<void> {
  await authorizedRequest<void>(`/api/files/${id}`, {
    method: 'DELETE',
  })
}

export async function downloadCloudFileBlob(id: string): Promise<Blob> {
  const token = getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(apiUrl(`/api/files/${id}/download`), {
    method: 'GET',
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`Failed to download file (status ${res.status})`)
  }

  return res.blob()
}

export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function convertPptToPdf(file: File): Promise<{
  blob: Blob
  fileName: string
  fileSize: number
}> {
  const dataBase64 = await fileToBase64(file)
  const response = await authorizedRequest<ConvertPptResponse>('/api/files/convert-ppt', {
    method: 'POST',
    body: {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataBase64,
    } satisfies ConvertPptRequest,
  })

  const byteCharacters = atob(response.file.dataBase64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: 'application/pdf' })

  return {
    blob,
    fileName: response.file.name,
    fileSize: response.file.fileSize,
  }
}
