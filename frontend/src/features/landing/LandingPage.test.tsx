import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LandingPage } from './LandingPage'

function renderLandingPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  it('renders hero headline, brand title and key value propositions', () => {
    renderLandingPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Remember what you learn/i)
    expect(screen.getByText('Saulado')).toBeInTheDocument()
    expect(screen.getByText(/Triple Answering Engine/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Interactive Sandbox/i).length).toBeGreaterThan(0)
  })

  it('interacts with the hero cloze input and reveals answer', async () => {
    const user = userEvent.setup()
    renderLandingPage()

    const input = screen.getByPlaceholderText(/type here/i)
    await user.type(input, 'time')

    expect(screen.getByText(/Correct recall/i)).toBeInTheDocument()

    const revealBtn = screen.getByRole('button', { name: /reveal answer/i })
    await user.click(revealBtn)
    expect(screen.getByText('time')).toBeInTheDocument()
  })

  it('switches between answering mode tabs', async () => {
    const user = userEvent.setup()
    renderLandingPage()

    const quizTab = screen.getByRole('button', { name: /Multiple Choice/i })
    await user.click(quizTab)

    expect(screen.getByText(/Smart Contextual Distractors/i)).toBeInTheDocument()

    const flashcardTab = screen.getByRole('button', { name: /Flashcards/i })
    await user.click(flashcardTab)

    expect(screen.getByText(/3D Flip with SM-2 Grading/i)).toBeInTheDocument()
  })
})
