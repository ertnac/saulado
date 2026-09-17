export type RepositoryFileType = 'pdf' | 'docx' | 'doc' | 'pptx' | 'ppt'

export type SnippetSource = 'pdf' | 'docx' | 'doc' | 'pptx' | 'ppt' | 'ocr' | 'typed'

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

export type HighlightColor =
  'yellow' | 'blue' | 'green' | 'emerald' | 'rose' | 'purple' | 'amber' | 'orange' | (string & {})

export interface PdfHighlight {
  id: string
  fileId: string
  pageNumber: number
  text: string
  startOffset?: number
  endOffset?: number
  color: HighlightColor
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

export interface ConvertPptRequest {
  name: string
  mimeType?: string
  dataBase64: string
}

export interface ConvertPptResponse {
  file: {
    name: string
    fileType: 'pdf'
    mimeType: 'application/pdf'
    fileSize: number
    dataBase64: string
  }
}
