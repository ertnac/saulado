import express, { Router, type Request, type Response } from 'express'
import type {
  CloudFileListResponse,
  RepositoryFileType,
  UploadCloudFileResponse,
} from '@saulado/shared'
import { prisma } from '../db/client.js'
import { sendError } from '../http/errors.js'
import { requireAuth } from '../http/require-auth.js'
import { asyncHandler } from '../http/validate.js'

export const filesRouter: Router = Router()

// Increase body limit specifically for file uploads
filesRouter.use(express.json({ limit: '35mb' }))
filesRouter.use(requireAuth)

function requireUserId(req: Request): string {
  if (typeof req.userId !== 'string') {
    throw new Error('requireAuth must run before this handler')
  }
  return req.userId
}

function verifyMagicBytes(buffer: Buffer, fileType: RepositoryFileType): boolean {
  if (buffer.length < 4) return false

  if (fileType === 'pdf') {
    // '%PDF' = 0x25 0x50 0x44 0x46
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
  }

  if (fileType === 'docx') {
    // 'PK\x03\x04' = 0x50 0x4B 0x03 0x04
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04
  }

  if (fileType === 'doc') {
    // Compound Document = 0xD0 0xCF 0x11 0xE0
    return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0
  }

  return false
}

/**
 * GET /api/files — list cloud files for the authenticated user
 */
filesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response<CloudFileListResponse>) => {
    const userId = requireUserId(req)

    const files = await prisma.cloudFile.findMany({
      where: { userId },
      select: {
        id: true,
        userId: true,
        name: true,
        fileType: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    res.json({
      files: files.map((f) => ({
        id: f.id,
        userId: f.userId,
        name: f.name,
        fileType: f.fileType as RepositoryFileType,
        mimeType: f.mimeType,
        fileSize: f.fileSize,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
    })
  }),
)

/**
 * POST /api/files — upload a new cloud file
 */
filesRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response<UploadCloudFileResponse>) => {
    const userId = requireUserId(req)
    const body = (req.body ?? {}) as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const fileType = typeof body.fileType === 'string' ? body.fileType : ''
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream'
    const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : ''

    if (!name) {
      sendError(res, 'VALIDATION_ERROR', 'File name is required')
      return
    }

    if (fileType !== 'pdf' && fileType !== 'docx' && fileType !== 'doc') {
      sendError(
        res,
        'VALIDATION_ERROR',
        'Unsupported file type. Only PDF, DOCX, and DOC are allowed.',
      )
      return
    }

    if (!dataBase64) {
      sendError(res, 'VALIDATION_ERROR', 'File binary data is required')
      return
    }

    const buffer = Buffer.from(dataBase64, 'base64')
    if (buffer.length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'Uploaded file cannot be empty')
      return
    }

    // Binary signature verification
    const isValid = verifyMagicBytes(buffer, fileType)
    if (!isValid) {
      sendError(
        res,
        'VALIDATION_ERROR',
        `File header did not match standard ${fileType.toUpperCase()} format.`,
      )
      return
    }

    const created = await prisma.cloudFile.create({
      data: {
        userId,
        name,
        fileType,
        mimeType,
        fileSize: buffer.length,
        data: buffer,
      },
      select: {
        id: true,
        userId: true,
        name: true,
        fileType: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.status(201).json({
      file: {
        id: created.id,
        userId: created.userId,
        name: created.name,
        fileType: created.fileType as RepositoryFileType,
        mimeType: created.mimeType,
        fileSize: created.fileSize,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    })
  }),
)

/**
 * GET /api/files/:id/download — download the file binary
 */
filesRouter.get(
  '/:id/download',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req)
    const fileId = req.params.id

    const file = await prisma.cloudFile.findFirst({
      where: { id: fileId, userId },
      select: {
        name: true,
        mimeType: true,
        fileSize: true,
        data: true,
      },
    })

    if (!file) {
      sendError(res, 'NOT_FOUND', 'Cloud file not found or not owned by user')
      return
    }

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    res.setHeader('Content-Length', file.fileSize)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`)

    res.send(Buffer.from(file.data))
  }),
)

/**
 * DELETE /api/files/:id — delete a cloud file
 */
filesRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req)
    const fileId = req.params.id

    const deleted = await prisma.cloudFile.deleteMany({
      where: { id: fileId, userId },
    })

    if (deleted.count === 0) {
      sendError(res, 'NOT_FOUND', 'Cloud file not found')
      return
    }

    res.status(204).end()
  }),
)
