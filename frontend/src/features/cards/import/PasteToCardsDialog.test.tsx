import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PasteToCardsDialog } from './PasteToCardsDialog'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

const queryClient = new QueryClient()

describe('PasteToCardsDialog', () => {
  it('renders paste textarea and title when open', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PasteToCardsDialog open={true} onClose={vi.fn()} />
        </BrowserRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: /Paste Notes to Cards/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Paste lecture notes, study guides/i)).toBeInTheDocument()
  })
})
