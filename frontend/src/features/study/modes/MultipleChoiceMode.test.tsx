import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BlankResult, SessionCard } from '@saulado/shared'
import { describe, expect, it, vi } from 'vitest'
import { MultipleChoiceMode } from './MultipleChoiceMode'

function mockCard(overrides: Partial<SessionCard> = {}): SessionCard {
  return {
    cardId: 'card-1',
    studySetId: 'set-1',
    segments: [
      { kind: 'text', text: 'The capital of France is ' },
      { kind: 'blank', ordinal: 0, answerLength: 5 },
      { kind: 'text', text: '.' },
    ],
    blankCount: 1,
    blankOptions: [['Paris', 'London', 'Berlin', 'Madrid']],
    tags: ['geography'],
    isNew: false,
    isLeech: false,
    ...overrides,
  }
}

describe('MultipleChoiceMode', () => {
  it('renders all options with A, B, C, D badges', () => {
    render(
      <MultipleChoiceMode
        card={mockCard()}
        values={{}}
        results={null}
        disabled={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Option A: Paris' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Option B: London' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Option C: Berlin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Option D: Madrid' })).toBeInTheDocument()
  })

  it('selects an option on click and calls onChange and onSubmit on single blank', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <MultipleChoiceMode
        card={mockCard()}
        values={{}}
        results={null}
        disabled={false}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    )

    const optionA = screen.getByRole('button', { name: 'Option A: Paris' })
    await user.click(optionA)

    expect(onChange).toHaveBeenCalledWith(0, 'Paris')
    expect(onSubmit).toHaveBeenCalledWith({ 0: 'Paris' })
  })

  it('selects option via keyboard shortcut 1-4', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <MultipleChoiceMode
        card={mockCard()}
        values={{}}
        results={null}
        disabled={false}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    )

    await user.keyboard('2')

    expect(onChange).toHaveBeenCalledWith(0, 'London')
    expect(onSubmit).toHaveBeenCalledWith({ 0: 'London' })
  })

  it('selects option via keyboard shortcut A-D', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <MultipleChoiceMode
        card={mockCard()}
        values={{}}
        results={null}
        disabled={false}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    )

    await user.keyboard('c')

    expect(onChange).toHaveBeenCalledWith(0, 'Berlin')
    expect(onSubmit).toHaveBeenCalledWith({ 0: 'Berlin' })
  })

  it('renders correct visual feedback when graded', () => {
    const results: BlankResult[] = [
      {
        ordinal: 0,
        submitted: 'London',
        correct: false,
        matchType: 'wrong',
        canonical: 'Paris',
      },
    ]

    render(
      <MultipleChoiceMode
        card={mockCard()}
        values={{ 0: 'London' }}
        results={results}
        disabled={true}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const optionA = screen.getByRole('button', { name: 'Option A: Paris' })
    const optionB = screen.getByRole('button', { name: 'Option B: London' })

    expect(optionA).toBeDisabled()
    expect(optionB).toBeDisabled()
    expect(optionA.className).toContain('text-success')
    expect(optionB.className).toContain('text-danger')
  })
})
