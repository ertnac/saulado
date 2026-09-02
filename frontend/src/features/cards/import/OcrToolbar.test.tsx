import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OcrToolbar } from './OcrToolbar'

describe('OcrToolbar', () => {
  it('renders mode switchers and word counts', () => {
    render(
      <OcrToolbar
        mode="edit"
        onModeChange={vi.fn()}
        onInsertSymbol={vi.fn()}
        onAutoClean={vi.fn()}
        onReset={vi.fn()}
        wordCount={42}
        paragraphCount={3}
      />,
    )

    expect(screen.getByRole('radio', { name: /Edit text mode/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Highlight cards mode/i })).toBeInTheDocument()
    expect(screen.getByText('42 words')).toBeInTheDocument()
  })

  it('inserts symbols when clicked in edit mode', async () => {
    const user = userEvent.setup()
    const onInsertSymbol = vi.fn()

    render(
      <OcrToolbar
        mode="edit"
        onModeChange={vi.fn()}
        onInsertSymbol={onInsertSymbol}
        onAutoClean={vi.fn()}
        onReset={vi.fn()}
        wordCount={10}
        paragraphCount={1}
      />,
    )

    const arrowBtn = screen.getByRole('button', { name: /Insert Arrow symbol/i })
    await user.click(arrowBtn)

    expect(onInsertSymbol).toHaveBeenCalledWith('→')
  })

  it('calls onAutoClean when Auto-Clean OCR button is clicked', async () => {
    const user = userEvent.setup()
    const onAutoClean = vi.fn()

    render(
      <OcrToolbar
        mode="highlight"
        onModeChange={vi.fn()}
        onInsertSymbol={vi.fn()}
        onAutoClean={onAutoClean}
        onReset={vi.fn()}
        wordCount={10}
        paragraphCount={1}
      />,
    )

    const cleanBtn = screen.getByRole('button', { name: /Auto-Clean OCR/i })
    await user.click(cleanBtn)

    expect(onAutoClean).toHaveBeenCalled()
  })
})
