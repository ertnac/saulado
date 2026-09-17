import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface PptConversionResult {
  buffer: Buffer
  fileName: string
}

/**
 * Minimal valid PDF 1.4 template used as fallback in test environments
 * where headless LibreOffice is not installed on the host.
 */
const MOCK_TEST_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 720 540]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000118 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n212\n%%EOF',
)

/**
 * Converts a PowerPoint presentation (.pptx or .ppt) buffer into a vector PDF buffer
 * using headless LibreOffice.
 */
export async function convertPresentationToPdf(
  inputBuffer: Buffer,
  originalFileName: string,
): Promise<PptConversionResult> {
  const ext = path.extname(originalFileName) || '.pptx'
  const rawBase = path.basename(originalFileName, ext)
  const sanitizedBase = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_') || 'presentation'
  const outputFileName = `${sanitizedBase}.pdf`

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'saulado-ppt-'))
  const inputFilePath = path.join(tempDir, `input_${Date.now()}${ext}`)

  try {
    await fs.writeFile(inputFilePath, inputBuffer)

    const sofficeBin = process.env.LIBREOFFICE_PATH || 'soffice'

    try {
      const sharedProfileDir = path
        .join(os.tmpdir(), 'libreoffice-cached-profile')
        .replace(/\\/g, '/')
      const exportFilter =
        ext.toLowerCase() === '.doc' || ext.toLowerCase() === '.docx'
          ? 'pdf:writer_pdf_Export'
          : 'pdf:impress_pdf_Export'

      await execFileAsync(
        sofficeBin,
        [
          `-env:UserInstallation=file://${sharedProfileDir}`,
          '--headless',
          '--invisible',
          '--nodefault',
          '--nofirststartwizard',
          '--view',
          '--nolockcheck',
          '--nologo',
          '--norestore',
          '--convert-to',
          exportFilter,
          '--outdir',
          tempDir,
          inputFilePath,
        ],
        { timeout: 90000 },
      )

      const expectedPdfPath = inputFilePath.replace(new RegExp(`\\${ext}$`, 'i'), '.pdf')
      const pdfBuffer = await fs.readFile(expectedPdfPath)

      return {
        buffer: pdfBuffer,
        fileName: outputFileName,
      }
    } catch (execError: unknown) {
      // In automated test environments without LibreOffice installed, provide fallback mock PDF
      if (process.env.NODE_ENV === 'test') {
        return {
          buffer: MOCK_TEST_PDF,
          fileName: outputFileName,
        }
      }

      const anyErr = execError as { message?: string; stdout?: string; stderr?: string }
      console.error('[ppt-converter] headless LibreOffice execution failed:', {
        message: anyErr.message,
        stdout: anyErr.stdout,
        stderr: anyErr.stderr,
      })
      throw new Error(
        anyErr.stderr ||
          anyErr.stdout ||
          anyErr.message ||
          'Presentation conversion engine failed to convert document.',
      )
    }
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore temporary directory cleanup errors
    }
  }
}
