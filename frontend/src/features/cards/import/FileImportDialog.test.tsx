import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileImportDialog } from './FileImportDialog'

describe('FileImportDialog', () => {
  it('renders drop zone and browse button in idle state', () => {
    render(<FileImportDialog open={true} onClose={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByText(/Drop your file here, or browse/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Supports Images \(PNG, JPG, WEBP\) and Documents \(PDF, TXT, MD\)/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose File/i })).toBeInTheDocument()
  })

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<FileImportDialog open={true} onClose={onClose} onImport={vi.fn()} />)

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
    await user.click(cancelBtn)

    expect(onClose).toHaveBeenCalled()
  })
})
