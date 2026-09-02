import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OcrReviewEditor } from './OcrReviewEditor'

describe('OcrReviewEditor', () => {
  it('renders initial text and switches between edit and highlight modes', async () => {
    const user = userEvent.setup()
    const text =
      'Photosynthesis converts light into chemical energy.\n\nCellular respiration produces ATP.'

    render(<OcrReviewEditor initialText={text} onCommitCards={vi.fn()} onCancel={vi.fn()} />)

    // Starts in Highlight mode
    expect(screen.getByText('Card Paragraph #1')).toBeInTheDocument()
    expect(screen.getByText('Card Paragraph #2')).toBeInTheDocument()

    // Switch to Edit Mode
    const editRadio = screen.getByRole('radio', { name: /Edit text mode/i })
    await user.click(editRadio)

    expect(screen.getByRole('textbox', { name: /Document Text/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Document Text/i })).toHaveValue(text)
  })

  it('allows editing text in edit mode and updates words/paragraphs count', async () => {
    const user = userEvent.setup()

    render(
      <OcrReviewEditor initialText="Original text." onCommitCards={vi.fn()} onCancel={vi.fn()} />,
    )

    await user.click(screen.getByRole('radio', { name: /Edit text mode/i }))

    const textarea = screen.getByRole('textbox', { name: /Document Text/i })
    await user.clear(textarea)
    await user.type(textarea, 'First question.\n\nSecond question.')

    expect(screen.getByText('4 words')).toBeInTheDocument()
    expect(screen.getByText('2 card paragraphs')).toBeInTheDocument()
  })

  it('commits cards when import button is clicked', () => {
    const onCommitCards = vi.fn()
    const text = 'The capital of France is Paris.'

    render(<OcrReviewEditor initialText={text} onCommitCards={onCommitCards} onCancel={vi.fn()} />)

    // Initially import button is disabled because no highlights yet
    const importBtn = screen.getByRole('button', { name: /Import 0 Cards/i })
    expect(importBtn).toBeDisabled()
  })
})
