import { generateBlankOptions, renderCloze } from '@saulado/shared'
import type { SessionCard, StartableMode, StudyCard, StudySession } from '@saulado/shared'

function shuffle<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = array[i] as T
    array[i] = array[j] as T
    array[j] = temp
  }
}

export function generateOfflineSession(
  setId: string,
  mode: StartableMode,
  cards: StudyCard[],
): StudySession {
  // Extract all answers across the set for distractor generation
  const allSetAnswers: string[] = []
  for (const card of cards) {
    for (const ans of card.answers) {
      allSetAnswers.push(ans.answerText)
      if (ans.altAnswers && ans.altAnswers.length > 0) {
        allSetAnswers.push(...ans.altAnswers)
      }
    }
  }

  // Map StudyCards to SessionCards locally
  const sessionCards: SessionCard[] = cards.map((card) => {
    // We assume the user wants flashcard or multiple choice?
    // Usually they want standard cloze text based on the card itself.
    const isFlashcard = card.answers.length === 0

    // Sort answers by ordinal if needed, though they already have startOffset/endOffset.
    // The renderCloze expects AnswerInput with offsets.
    const segments = renderCloze(card.paragraph, card.answers)

    // Local evaluation requires cardAnswers
    const cardAnswers = card.answers.map((a) => ({
      answerText: a.answerText,
      altAnswers: a.altAnswers || [],
    }))

    const blankAnswers = isFlashcard ? undefined : card.answers.map((a) => a.answerText)

    const blankOptions = card.answers.map((ans) =>
      generateBlankOptions(
        [ans.answerText, ...(ans.altAnswers || [])],
        allSetAnswers,
        card.paragraph,
      ),
    )

    return {
      cardId: card.id,
      studySetId: card.studySetId,
      segments,
      blankCount: card.answers.length,
      tags: card.tags || [],
      isNew: false, // In offline mode, treat as review if not known
      isLeech: false,
      blankOptions,
      blankAnswers,
      cardAnswers,
    }
  })

  // Order based on mode
  if (mode === 'shuffled') {
    shuffle(sessionCards)
  }

  // Create a local session ID
  const sessionId = `offline-session-${Date.now()}-${Math.random().toString(36).slice(2)}`

  return {
    id: sessionId,
    studySetId: setId,
    mode,
    startedAt: new Date().toISOString(),
    completedAt: null,
    progress: {
      answered: 0,
      total: sessionCards.length,
      correct: 0,
    },
    queue: sessionCards,
  }
}
