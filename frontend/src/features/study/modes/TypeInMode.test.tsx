import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SessionCard } from '@saulado/shared'
import { describe, expect, it, vi } from 'vitest'
import { TypeInMode } from './TypeInMode'

function mockCard(overrides: Partial<SessionCard> = {}): SessionCard {
  return {
    cardId: 'card-1',
    studySetId: 'set-1',
    segments: [
      { kind: 'text', text: 'Photosynthesis occurs in ' },
      { kind: 'blank', ordinal: 0, answerLength: 11 },
      { kind: 'text', text: ' of plant cells.' },
    ],
    blankCount: 1,
    tags: ['biology'],
    isNew: false,
    isLeech: false,
    ...overrides,
  }
}

describe('TypeInMode', () => {
  it('renders segments with interactive BlankSlot inputs', () => {
    render(
      <TypeInMode
        card={mockCard()}
        values={{}}
        results={null}
        disabled={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText(/Photosynthesis occurs in/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Blank 1 of 1' })).toBeInTheDocument()
    expect(screen.getByText(/of plant cells\./)).toBeInTheDocument()
  })

  it('calls onChange when user types in the slot', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <TypeInMode
        card={mockCard()}
        values={{}}
        results={null}
        disabled={false}
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Blank 1 of 1' })
    await user.type(input, 'chloroplast')

    expect(onChange).toHaveBeenCalledWith(0, 'c')
  })

  it('triggers onSubmit on Enter in single/last blank', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <TypeInMode
        card={mockCard()}
        values={{ 0: 'chloroplast' }}
        results={null}
        disabled={false}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Blank 1 of 1' })
    await user.type(input, '{Enter}')

    expect(onSubmit).toHaveBeenCalled()
  })
})
