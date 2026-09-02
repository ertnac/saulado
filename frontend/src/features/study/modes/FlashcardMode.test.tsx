import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SessionCard } from '@saulado/shared'
import { describe, expect, it, vi } from 'vitest'
import { FlashcardMode } from './FlashcardMode'

function mockCard(overrides: Partial<SessionCard> = {}): SessionCard {
  return {
    cardId: 'card-1',
    studySetId: 'set-1',
    segments: [
      { kind: 'text', text: 'The powerhouse of the cell is ' },
      { kind: 'blank', ordinal: 0, answerLength: 12 },
      { kind: 'text', text: '.' },
    ],
    blankCount: 1,
    blankAnswers: ['mitochondria'],
    tags: ['biology'],
    isNew: false,
    isLeech: false,
    ...overrides,
  }
}

describe('FlashcardMode', () => {
  it('renders front face with question prompt and reveal button', () => {
    render(<FlashcardMode card={mockCard()} results={null} disabled={false} onSubmit={vi.fn()} />)

    expect(screen.getAllByText(/The powerhouse of the cell is/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Reveal Answer/ })).toBeInTheDocument()
    expect(screen.getByText('Question')).toBeInTheDocument()
  })

  it('flips to back face on button click and reveals answer', async () => {
    const user = userEvent.setup()

    render(<FlashcardMode card={mockCard()} results={null} disabled={false} onSubmit={vi.fn()} />)

    const revealBtn = screen.getByRole('button', { name: /Reveal Answer/ })
    await user.click(revealBtn)

    expect(screen.getByText('mitochondria')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Correct/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Wrong/ })).toBeInTheDocument()
  })

  it('flips on Space key and rates on 1/2 keys', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<FlashcardMode card={mockCard()} results={null} disabled={false} onSubmit={onSubmit} />)

    // Flip using Space
    await user.keyboard(' ')

    expect(screen.getByText('mitochondria')).toBeInTheDocument()

    // Rate Correct using '2'
    await user.keyboard('2')

    expect(onSubmit).toHaveBeenCalledWith({ 0: 'mitochondria' })
  })

  it('submits empty string on Wrong button click', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<FlashcardMode card={mockCard()} results={null} disabled={false} onSubmit={onSubmit} />)

    const revealBtn = screen.getByRole('button', { name: /Reveal Answer/ })
    await user.click(revealBtn)

    const wrongBtn = screen.getByRole('button', { name: /Wrong/ })
    await user.click(wrongBtn)

    expect(onSubmit).toHaveBeenCalledWith({ 0: '' })
  })

  it('submits correct blank answers on Correct button click', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<FlashcardMode card={mockCard()} results={null} disabled={false} onSubmit={onSubmit} />)

    const revealBtn = screen.getByRole('button', { name: /Reveal Answer/ })
    await user.click(revealBtn)

    const correctBtn = screen.getByRole('button', { name: /Correct/ })
    await user.click(correctBtn)

    expect(onSubmit).toHaveBeenCalledWith({ 0: 'mitochondria' })
  })
})
