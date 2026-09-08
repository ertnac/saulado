export type RepositoryFileType = 'pdf' | 'docx' | 'doc'

export interface CloudFileSummary {
  id: string
  userId: string
  name: string
  fileType: RepositoryFileType
  mimeType: string
  fileSize: number
  fileUrl?: string
  createdAt: string
  updatedAt: string
}

export interface CloudFileListResponse {
  files: CloudFileSummary[]
}

export interface UploadCloudFileRequest {
  name: string
  fileType: RepositoryFileType
  mimeType: string
  fileSize: number
  dataBase64: string
}

export interface UploadCloudFileResponse {
  file: CloudFileSummary
}
