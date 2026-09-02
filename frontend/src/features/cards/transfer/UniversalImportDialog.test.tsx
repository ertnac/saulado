import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UniversalImportDialog } from './UniversalImportDialog'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function renderWithClient(ui: React.ReactElement): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('UniversalImportDialog', () => {
  it('renders input state with drop area and textarea', () => {
    renderWithClient(<UniversalImportDialog open={true} onClose={vi.fn()} />)

    expect(screen.getByText(/Import Deck \/ Cards/i)).toBeInTheDocument()
    expect(screen.getByText(/Drop a/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('validates and previews parsed cards', async () => {
    const user = userEvent.setup()

    renderWithClient(<UniversalImportDialog open={true} onClose={vi.fn()} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify([{ text: 'Photosynthesis occurs in [chloroplasts].' }]),
      },
    })

    const parseBtn = screen.getByRole('button', { name: /Parse & Preview/i })
    await user.click(parseBtn)

    expect(screen.getByText(/Review & Confirm Import/i)).toBeInTheDocument()
    expect(screen.getByText(/Found 1 set with 1 cards/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Import 1 Cards/i })).toBeInTheDocument()
  })
})
