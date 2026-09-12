export type RepositoryFileType = 'pdf' | 'docx' | 'doc'

export type SnippetSource = 'pdf' | 'docx' | 'doc' | 'ocr' | 'typed'

export interface BaggedSnippet {
  id: string
  fileId: string
  fileName: string
  fileType: RepositoryFileType
  source: SnippetSource
  text: string
  pageNumber?: number
  startOffset?: number
  endOffset?: number
  sourceParagraphIndex?: number
  createdAt: string
}

export interface PdfTextSelection {
  fileId: string
  pageNumber: number
  text: string
  startOffset?: number
  endOffset?: number
  source?: 'pdf'
}

export interface PdfHighlight {
  id: string
  fileId: string
  pageNumber: number
  text: string
  startOffset?: number
  endOffset?: number
  color: 'yellow' | 'green' | 'emerald' | 'rose'
  createdAt: string
}

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
