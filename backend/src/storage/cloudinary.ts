import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'
import { env } from '../config/env.js'

if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  })
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
}

export interface CloudinaryUploadResult {
  secureUrl: string
  publicId: string
  bytes: number
}

/**
 * Uploads a document (PDF, DOCX, DOC) to Cloudinary as a raw asset.
 *
 * Uses `upload_stream` to pipe the buffer directly without writing temporary files to disk.
 */
export async function uploadDocumentToCloudinary(
  buffer: Buffer,
  fileName: string,
  userId: string,
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary credentials are not configured.')
  }

  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const publicId = `${Date.now()}_${sanitizedName}`

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: `saulado/cloud_files/${userId}`,
        public_id: publicId,
        overwrite: true,
      },
      (error: unknown, result?: UploadApiResponse) => {
        if (error || !result) {
          reject(error instanceof Error ? error : new Error('Cloudinary upload failed'))
          return
        }

        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
        })
      },
    )

    uploadStream.end(buffer)
  })
}

/**
 * Deletes a raw document asset from Cloudinary by its public ID.
 */
export async function deleteDocumentFromCloudinary(publicId: string): Promise<void> {
  if (!isCloudinaryConfigured() || !publicId) return

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: 'raw',
    })
  } catch (err) {
    console.warn(`[cloudinary] failed to delete raw asset ${publicId}:`, err)
  }
}
