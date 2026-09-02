import { getOcrProvider } from './ocr-service'

const SUPPORTED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
  'image/gif',
])

export function isImageFile(file: File): boolean {
  if (SUPPORTED_IMAGE_MIMES.has(file.type.toLowerCase())) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'bmp'
}

export async function processImageOcr(
  file: File | Blob,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const provider = getOcrProvider()
  return provider.recognizeImage(file, onProgress, signal)
}
