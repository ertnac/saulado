import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StudyModeSwitcher } from './StudyModeSwitcher'

describe('StudyModeSwitcher', () => {
  it('renders all three modes with accessible labels', () => {
    render(<StudyModeSwitcher value="identification" onChange={vi.fn()} />)

    expect(screen.getByRole('radiogroup', { name: 'Study mode' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Type-In' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Multiple Choice' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Flashcards' })).toBeInTheDocument()
  })

  it('semantically indicates the active mode', () => {
    const { rerender } = render(<StudyModeSwitcher value="identification" onChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: 'Type-In' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Multiple Choice' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Flashcards' })).not.toBeChecked()

    rerender(<StudyModeSwitcher value="multiple-choice" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Multiple Choice' })).toBeChecked()

    rerender(<StudyModeSwitcher value="flashcard" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Flashcards' })).toBeChecked()
  })

  it('triggers onChange with the selected mode on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<StudyModeSwitcher value="identification" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'Multiple Choice' }))
    expect(onChange).toHaveBeenCalledWith('multiple-choice')

    await user.click(screen.getByRole('radio', { name: 'Flashcards' }))
    expect(onChange).toHaveBeenCalledWith('flashcard')

    await user.click(screen.getByRole('radio', { name: 'Type-In' }))
    expect(onChange).toHaveBeenCalledWith('identification')
  })

  it('navigates with arrow keys adhering to radiogroup pattern', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<StudyModeSwitcher value="identification" onChange={onChange} />)

    const activeRadio = screen.getByRole('radio', { name: 'Type-In' })
    activeRadio.focus()

    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('multiple-choice')

    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenCalledWith('flashcard')
  })

  it('disables all buttons and interactions when disabled=true', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<StudyModeSwitcher value="identification" onChange={onChange} disabled />)

    const multipleChoiceBtn = screen.getByRole('radio', { name: 'Multiple Choice' })
    expect(multipleChoiceBtn).toBeDisabled()

    await user.click(multipleChoiceBtn)
    expect(onChange).not.toHaveBeenCalled()
  })
})
