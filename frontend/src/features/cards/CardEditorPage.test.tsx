import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { StudyCard, TagsResponse } from '@saulado/shared'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/services/cards'
import { EditCardPage, NewCardPage } from './CardEditorPage'

/**
 * The card editor's two entry routes.
 *
 * The invariant these exist for: **the client sends offsets and never answer
 * text**. The server slices `answerText` out of the paragraph itself, and a
 * request carrying client-supplied text would defeat the whole offset model. So
 * the create/save assertions check the request body, not the rendered output.
 */

vi.mock('@/services/cards')

const mocked = vi.mocked(api)

const PARAGRAPH = 'The CPU is the brain of the computer'

function card(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    id: 'card-1',
    studySetId: 'set-1',
    title: 'The CPU',
    paragraph: PARAGRAPH,
    answers: [
      { id: 'a1', ordinal: 0, startOffset: 4, endOffset: 7, answerText: 'CPU', altAnswers: [] },
    ],
    tags: ['computing'],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const TAGS: TagsResponse = { tags: [{ tag: 'computing', count: 3 }] }

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderNew(): ReactElement {
  return (
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={['/sets/set-1/cards/new']}>
        <Routes>
          <Route path="/sets/:setId/cards/new" element={<NewCardPage />} />
          <Route path="/sets/:setId" element={<p>Back at the set</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderEdit(): ReactElement {
  return (
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={['/cards/card-1']}>
        <Routes>
          <Route path="/cards/:cardId" element={<EditCardPage />} />
          <Route path="/sets/:setId" element={<p>Back at the set</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.listTags.mockResolvedValue(TAGS)
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('creating a card', () => {
  it('cannot be saved with a title but no paragraph', async () => {
    const user = userEvent.setup()
    render(renderNew())

    await user.type(screen.getByLabelText('Title'), 'The parts of a computer')

    expect(screen.getByRole('button', { name: 'Create card' })).toBeDisabled()
  })

  it('saves a card with no blanks — highlighting can come later', async () => {
    // A paragraph with nothing highlighted is still worth keeping; refusing to
    // save it would lose the typing that is the expensive part.
    const user = userEvent.setup()
    mocked.createCard.mockResolvedValue({ card: card({ answers: [] }) })
    render(renderNew())

    await user.type(screen.getByLabelText('Title'), 'The CPU')
    await user.type(screen.getByLabelText('Paragraph'), PARAGRAPH)
    await user.click(screen.getByRole('button', { name: 'Create card' }))

    await waitFor(() => {
      expect(mocked.createCard).toHaveBeenCalledWith('set-1', {
        title: 'The CPU',
        paragraph: PARAGRAPH,
        answers: [],
        tags: [],
      })
    })
  })

  it('returns to the set after saving', async () => {
    const user = userEvent.setup()
    mocked.createCard.mockResolvedValue({ card: card({ answers: [] }) })
    render(renderNew())

    await user.type(screen.getByLabelText('Title'), 'The CPU')
    await user.type(screen.getByLabelText('Paragraph'), PARAGRAPH)
    await user.click(screen.getByRole('button', { name: 'Create card' }))

    await waitFor(() => {
      expect(screen.getByText('Back at the set')).toBeInTheDocument()
    })
  })

  it('sends the tags the user attached', async () => {
    const user = userEvent.setup()
    mocked.createCard.mockResolvedValue({ card: card({ answers: [] }) })
    render(renderNew())

    await user.type(screen.getByLabelText('Title'), 'The CPU')
    await user.type(screen.getByLabelText('Paragraph'), PARAGRAPH)
    await user.type(screen.getByLabelText('Tags'), 'computing,')
    await user.click(screen.getByRole('button', { name: 'Create card' }))

    await waitFor(() => {
      expect(mocked.createCard).toHaveBeenCalledWith(
        'set-1',
        expect.objectContaining({ tags: ['computing'] }),
      )
    })
  })

  it('keeps the user on the form when the server rejects the card', async () => {
    // Navigating away on failure would discard the paragraph they just wrote.
    const user = userEvent.setup()
    mocked.createCard.mockRejectedValue(new Error('offline'))
    render(renderNew())

    await user.type(screen.getByLabelText('Title'), 'The CPU')
    await user.type(screen.getByLabelText('Paragraph'), PARAGRAPH)
    await user.click(screen.getByRole('button', { name: 'Create card' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server')
    })
    expect(screen.getByLabelText('Title')).toHaveValue('The CPU')
    expect(screen.queryByText('Back at the set')).not.toBeInTheDocument()
  })
})

describe('editing a card', () => {
  it('waits for the card rather than opening an empty editor', () => {
    // Mounting empty and resetting on arrival would discard anything typed in
    // between — the editor seeds its state once, on first render.
    mocked.getCard.mockReturnValue(new Promise(() => undefined))
    render(renderEdit())

    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('opens with the stored card in it', async () => {
    mocked.getCard.mockResolvedValue({ card: card() })
    render(renderEdit())

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('The CPU')
    })
    expect(screen.getByLabelText('Paragraph')).toHaveValue(PARAGRAPH)
    expect(screen.getByRole('heading', { name: 'Edit card', level: 1 })).toBeInTheDocument()
  })

  it('sends offsets and no answer text', async () => {
    // The one assertion this file exists for. `answerText` is the server's to
    // derive; sending it would make the client the source of truth for the
    // answer, which is exactly what the offset model rules out.
    const user = userEvent.setup()
    mocked.getCard.mockResolvedValue({ card: card() })
    mocked.updateCard.mockResolvedValue({ card: card() })
    render(renderEdit())

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('The CPU')
    })
    await user.click(screen.getByRole('button', { name: 'Save card' }))

    await waitFor(() => {
      expect(mocked.updateCard).toHaveBeenCalledWith('card-1', {
        title: 'The CPU',
        paragraph: PARAGRAPH,
        answers: [{ startOffset: 4, endOffset: 7 }],
        tags: ['computing'],
      })
    })
  })

  it('explains a card that could not be loaded', async () => {
    mocked.getCard.mockRejectedValue(new Error('gone'))
    render(renderEdit())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('That card could not be loaded')
    })
  })

  it('does not restore a stale draft over a saved card', async () => {
    // Draft restore is for create only. Reopening a saved card must show what is
    // stored, not a week-old draft of it.
    localStorage.setItem(
      'saulado-card-draft:card:card-1',
      JSON.stringify({
        paragraph: 'A draft that should not appear',
        answers: [],
        title: 'Draft title',
        tags: [],
        savedAt: Date.now(),
      }),
    )
    mocked.getCard.mockResolvedValue({ card: card() })
    render(renderEdit())

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('The CPU')
    })
    expect(screen.getByLabelText('Paragraph')).toHaveValue(PARAGRAPH)
  })
})
