import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CardHighlightEditor } from './CardHighlightEditor'

describe('CardHighlightEditor', () => {
  it('renders paragraph card drafts with highlight instructions', () => {
    const paragraphs = [
      'Photosynthesis occurs in chloroplasts of plant cells.',
      'The mitochondria is the powerhouse of the cell.',
    ]

    render(<CardHighlightEditor paragraphs={paragraphs} cards={{}} onUpdateAnswers={vi.fn()} />)

    expect(screen.getByText(/How to create cards/i)).toBeInTheDocument()
    expect(screen.getByText('Card Paragraph #1')).toBeInTheDocument()
    expect(screen.getByText('Card Paragraph #2')).toBeInTheDocument()
    expect(screen.getByText(/Photosynthesis occurs in/i)).toBeInTheDocument()
    expect(screen.getByText(/powerhouse of the cell/i)).toBeInTheDocument()
  })

  it('renders blank chips when cards have answers', () => {
    const paragraphs = ['The capital of France is Paris.']
    const cards = {
      0: [
        {
          startOffset: 25,
          endOffset: 30,
          answerText: 'Paris',
          altAnswers: [],
        },
      ],
    }

    render(<CardHighlightEditor paragraphs={paragraphs} cards={cards} onUpdateAnswers={vi.fn()} />)

    expect(screen.getByText('1. Paris')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove blank Paris/i })).toBeInTheDocument()
  })
})
