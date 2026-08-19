/**
 * Logic for generating multiple choice options.
 */

/**
 * Extracts context words from a paragraph to use as fallback distractors.
 * It normalises the paragraph (removing punctuation, lowercasing) and filters out
 * very short words (e.g. "a", "an", "the", "is") and the correct answers themselves.
 */
export function extractContextWords(paragraph: string, excludeAnswers: string[]): string[] {
  // Simple tokenisation: strip punctuation, lowercase, split by whitespace
  const words = paragraph
    .replace(/[^\w\s-]/g, '')
    .toLowerCase()
    .split(/\s+/)

  // Filter out stop words and short words
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'with',
    'by',
    'of',
    'this',
    'that',
    'it',
  ])
  const excludeSet = new Set(excludeAnswers.map((a) => a.toLowerCase()))

  const candidates = words.filter((word) => {
    return word.length > 2 && !stopWords.has(word) && !excludeSet.has(word)
  })

  // Return unique candidates
  return Array.from(new Set(candidates))
}

/**
 * Shuffles an array in place using Fisher-Yates algorithm.
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = result[i] as T
    result[i] = result[j] as T
    result[j] = temp
  }
  return result
}

/**
 * Generates options for a multiple choice blank.
 *
 * If the pool of unique set answers (excluding correct answers) is less than 3,
 * it will pull fallback distractors from the paragraph's context words instead.
 *
 * @param correctAnswers The correct answer(s) for this blank (usually just 1 primary correct answer)
 * @param allSetAnswers A pool of all answers from the current study set
 * @param paragraph The paragraph text for the current card (used as fallback)
 * @param numOptions Number of options to return (default 4)
 */
export function generateBlankOptions(
  correctAnswers: string[],
  allSetAnswers: string[],
  paragraph: string,
  numOptions = 4,
): string[] {
  // Use the primary correct answer (first one) as the true choice
  const primaryAnswer = correctAnswers[0] || ''

  // Normalise for deduplication
  const normalise = (s: string) => s.toLowerCase().trim()
  const correctNorms = new Set(correctAnswers.map(normalise))

  // Get unique answers from the set, excluding the correct answers for this blank
  const uniquePool = Array.from(new Set(allSetAnswers)).filter(
    (ans) => !correctNorms.has(normalise(ans)),
  )

  let distractors: string[] = []

  // "if the cards from set is 3 cards below the choices should be in th words from the question not on a random distractor"
  // Here we interpret this as: if we don't have at least 3 other distractors from the set, fallback to paragraph context.
  if (uniquePool.length < 3) {
    const contextWords = extractContextWords(paragraph, correctAnswers)
    // We still need numOptions - 1 distractors.
    // Use context words, and if we still fall short, we just use whatever we have.
    distractors = shuffleArray(contextWords)
  } else {
    // Normal case: use answers from other cards
    distractors = shuffleArray(uniquePool)
  }

  // Take the required number of distractors (numOptions - 1 for the correct answer)
  const selectedDistractors = distractors.slice(0, numOptions - 1)

  // Combine with correct answer and shuffle final options
  const finalOptions = shuffleArray([primaryAnswer, ...selectedDistractors])

  return finalOptions
}
