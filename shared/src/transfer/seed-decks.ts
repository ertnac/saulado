import type { ParsedImportResult } from './json-parser.js'
import { parseAndValidateJson } from './json-parser.js'

export const SEED_DECKS_RAW = {
  formatVersion: 2,
  exportedAt: '2026-08-18T07:41:26.292Z',
  sets: [
    {
      title: 'Computer Science & Algorithms',
      color: 'teal',
      cards: [
        {
          paragraph:
            'Binary search operates in O(log n) time on sorted arrays by repeatedly dividing the search interval in half.',
          answers: [
            {
              startOffset: 0,
              endOffset: 13,
              answerText: 'Binary search',
            },
          ],
        },
        {
          paragraph:
            'A hash table uses a hashing function to map keys to bucket indices for fast average O(1) lookups.',
          answers: [
            {
              startOffset: 2,
              endOffset: 12,
              answerText: 'hash table',
            },
          ],
        },
        {
          paragraph:
            'The stack data structure follows the Last-In First-Out (LIFO) principle for insertions and deletions.',
          answers: [
            {
              startOffset: 4,
              endOffset: 9,
              answerText: 'stack',
            },
          ],
        },
        {
          paragraph: 'A queue operates under the First-In First-Out (FIFO) ordering pattern.',
          answers: [
            {
              startOffset: 27,
              endOffset: 45,
              answerText: 'First-In First-Out',
            },
          ],
        },
        {
          paragraph:
            'QuickSort is a divide-and-conquer algorithm that selects a pivot element to partition the array.',
          answers: [
            {
              startOffset: 0,
              endOffset: 9,
              answerText: 'QuickSort',
            },
          ],
        },
        {
          paragraph:
            'In a binary search tree, all nodes in the left subtree have values less than the root node.',
          answers: [
            {
              startOffset: 42,
              endOffset: 54,
              answerText: 'left subtree',
            },
          ],
        },
        {
          paragraph:
            'Dijkstra algorithm finds the shortest path between nodes in a weighted graph with non-negative edge weights.',
          answers: [
            {
              startOffset: 29,
              endOffset: 42,
              answerText: 'shortest path',
            },
          ],
        },
        {
          paragraph:
            'Recursion is a programming technique where a function calls itself to solve smaller subproblems.',
          answers: [
            {
              startOffset: 0,
              endOffset: 9,
              answerText: 'Recursion',
            },
          ],
        },
        {
          paragraph: 'A graph without any cycles is formally known as an acyclic graph.',
          answers: [
            {
              startOffset: 51,
              endOffset: 58,
              answerText: 'acyclic',
            },
          ],
        },
        {
          paragraph:
            'Dynamic programming solves complex problems by breaking them into overlapping subproblems with memoization.',
          answers: [
            {
              startOffset: 0,
              endOffset: 19,
              answerText: 'Dynamic programming',
            },
          ],
        },
      ],
    },
    {
      title: 'World History & Civilizations',
      color: 'amber',
      cards: [
        {
          paragraph:
            'The Renaissance began in 14th-century Italy and marked a cultural rebirth of art and humanism.',
          answers: [
            {
              startOffset: 4,
              endOffset: 15,
              answerText: 'Renaissance',
            },
          ],
        },
        {
          paragraph:
            'The Industrial Revolution began in Great Britain during the 18th century with the rise of steam power.',
          answers: [
            {
              startOffset: 4,
              endOffset: 25,
              answerText: 'Industrial Revolution',
            },
          ],
        },
        {
          paragraph:
            'The French Revolution broke out in 1789 with the storming of the Bastille fortress.',
          answers: [
            {
              startOffset: 35,
              endOffset: 39,
              answerText: '1789',
            },
          ],
        },
        {
          paragraph:
            'The Magna Carta was signed in 1215 to limit the power of the English monarch.',
          answers: [
            {
              startOffset: 4,
              endOffset: 15,
              answerText: 'Magna Carta',
            },
          ],
        },
        {
          paragraph:
            'The Silk Road was an ancient network of trade routes connecting China and the Mediterranean world.',
          answers: [
            {
              startOffset: 4,
              endOffset: 13,
              answerText: 'Silk Road',
            },
          ],
        },
        {
          paragraph:
            'The Roman Empire reached its greatest territorial extent under the reign of Emperor Trajan.',
          answers: [
            {
              startOffset: 4,
              endOffset: 16,
              answerText: 'Roman Empire',
            },
          ],
        },
        {
          paragraph:
            'Johannes Gutenberg invented the movable type printing press around 1440 in Germany.',
          answers: [
            {
              startOffset: 45,
              endOffset: 59,
              answerText: 'printing press',
            },
          ],
        },
        {
          paragraph:
            'The Cold War was a geopolitical tension period primarily between the United States and the Soviet Union.',
          answers: [
            {
              startOffset: 4,
              endOffset: 12,
              answerText: 'Cold War',
            },
          ],
        },
        {
          paragraph:
            'Ancient Mesopotamia is widely regarded as the cradle of civilization between the Tigris and Euphrates rivers.',
          answers: [
            {
              startOffset: 8,
              endOffset: 19,
              answerText: 'Mesopotamia',
            },
          ],
        },
        {
          paragraph:
            'The Rosetta Stone discovered in Egypt provided the key to deciphering ancient Egyptian hieroglyphics.',
          answers: [
            {
              startOffset: 4,
              endOffset: 17,
              answerText: 'Rosetta Stone',
            },
          ],
        },
      ],
    },
    {
      title: 'Human Biology & Physiology',
      color: 'blue',
      cards: [
        {
          paragraph:
            'Mitochondria generate most of the chemical energy needed by the cell in the form of ATP.',
          answers: [
            {
              startOffset: 0,
              endOffset: 12,
              answerText: 'Mitochondria',
            },
          ],
        },
        {
          paragraph: 'The human heart has four chambers: two atria and two ventricles.',
          answers: [
            {
              startOffset: 20,
              endOffset: 33,
              answerText: 'four chambers',
            },
          ],
        },
        {
          paragraph:
            'Hemoglobin is an iron-containing protein in red blood cells that transports oxygen throughout the body.',
          answers: [
            {
              startOffset: 0,
              endOffset: 10,
              answerText: 'Hemoglobin',
            },
          ],
        },
        {
          paragraph: 'The central nervous system consists of the brain and the spinal cord.',
          answers: [
            {
              startOffset: 57,
              endOffset: 68,
              answerText: 'spinal cord',
            },
          ],
        },
        {
          paragraph:
            'Insulin is a hormone produced by the pancreas to regulate blood glucose levels.',
          answers: [
            {
              startOffset: 37,
              endOffset: 45,
              answerText: 'pancreas',
            },
          ],
        },
        {
          paragraph:
            'DNA stores genetic information in a double helix structure composed of four nucleotide bases.',
          answers: [
            {
              startOffset: 36,
              endOffset: 48,
              answerText: 'double helix',
            },
          ],
        },
        {
          paragraph:
            'The alveoli in the lungs are microscopic air sacs responsible for gas exchange.',
          answers: [
            {
              startOffset: 4,
              endOffset: 11,
              answerText: 'alveoli',
            },
          ],
        },
        {
          paragraph: 'The skeletal system consists of 206 bones in an adult human body.',
          answers: [
            {
              startOffset: 32,
              endOffset: 35,
              answerText: '206',
            },
          ],
        },
        {
          paragraph:
            'Neurons transmit electrical and chemical signals across specialized junctions called synapses.',
          answers: [
            {
              startOffset: 85,
              endOffset: 93,
              answerText: 'synapses',
            },
          ],
        },
        {
          paragraph:
            'The kidneys filter metabolic waste and excess fluids from blood to produce urine.',
          answers: [
            {
              startOffset: 4,
              endOffset: 11,
              answerText: 'kidneys',
            },
          ],
        },
      ],
    },
  ],
} as const

/**
 * Validates and retrieves the bundled starter/seed decks using the standard JSON parser.
 */
export function getSeedDecks(): ParsedImportResult {
  const result = parseAndValidateJson(JSON.stringify(SEED_DECKS_RAW))
  if (!result.success) {
    throw new Error(`Failed to validate seed decks: ${result.error}`)
  }
  return result.data
}
