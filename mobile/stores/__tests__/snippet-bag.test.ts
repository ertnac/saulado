import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
      return Promise.resolve()
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
      return Promise.resolve()
    }),
    clear: vi.fn(() => {
      store.clear()
      return Promise.resolve()
    }),
  },
}))

import { useSnippetBagStore } from '../snippet-bag'

describe('useSnippetBagStore', () => {
  beforeEach(() => {
    useSnippetBagStore.getState().clearBag()
  })

  it('starts with empty bag', () => {
    expect(useSnippetBagStore.getState().snippets).toEqual([])
  })

  it('adds word or paragraph snippet and trims text', () => {
    const item = useSnippetBagStore.getState().addSnippet({
      fileId: 'doc-1',
      fileName: 'Biology.docx',
      fileType: 'docx',
      text: '   Mitochondria is the powerhouse of the cell.   ',
    })

    expect(item.id).toBeTruthy()
    expect(item.text).toBe('Mitochondria is the powerhouse of the cell.')
    expect(useSnippetBagStore.getState().snippets).toHaveLength(1)
    expect(
      useSnippetBagStore
        .getState()
        .hasSnippet('doc-1', 'Mitochondria is the powerhouse of the cell.'),
    ).toBe(true)
  })

  it('deduplicates identical text from the same file', () => {
    const item1 = useSnippetBagStore.getState().addSnippet({
      fileId: 'doc-1',
      fileName: 'Biology.docx',
      fileType: 'docx',
      text: 'Nucleus contains DNA',
    })

    const item2 = useSnippetBagStore.getState().addSnippet({
      fileId: 'doc-1',
      fileName: 'Biology.docx',
      fileType: 'docx',
      text: 'Nucleus contains DNA',
    })

    expect(item1.id).toBe(item2.id)
    expect(useSnippetBagStore.getState().snippets).toHaveLength(1)
  })

  it('updates snippet text', () => {
    const item = useSnippetBagStore.getState().addSnippet({
      fileId: 'doc-1',
      fileName: 'Biology.docx',
      fileType: 'docx',
      text: 'Typo text',
    })

    useSnippetBagStore.getState().updateSnippetText(item.id, 'Fixed text')
    const updated = useSnippetBagStore.getState().snippets.find((s) => s.id === item.id)
    expect(updated?.text).toBe('Fixed text')
  })

  it('removes snippet by id', () => {
    const item1 = useSnippetBagStore.getState().addSnippet({
      fileId: 'doc-1',
      fileName: 'Biology.docx',
      fileType: 'docx',
      text: 'Text 1',
    })
    const item2 = useSnippetBagStore.getState().addSnippet({
      fileId: 'doc-1',
      fileName: 'Biology.docx',
      fileType: 'docx',
      text: 'Text 2',
    })

    expect(useSnippetBagStore.getState().snippets).toHaveLength(2)
    useSnippetBagStore.getState().removeSnippet(item1.id)

    const remaining = useSnippetBagStore.getState().snippets
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.id).toBe(item2.id)
  })

  it('clears all snippets', () => {
    useSnippetBagStore.getState().addSnippet({
      fileId: 'doc-1',
      fileName: 'Biology.docx',
      fileType: 'docx',
      text: 'Text 1',
    })
    useSnippetBagStore.getState().clearBag()
    expect(useSnippetBagStore.getState().snippets).toHaveLength(0)
  })

  it('adds PDF snippet with pageNumber and source', () => {
    const item = useSnippetBagStore.getState().addSnippet({
      fileId: 'pdf-1',
      fileName: 'Physics.pdf',
      fileType: 'pdf',
      source: 'pdf',
      pageNumber: 5,
      startOffset: 120,
      endOffset: 175,
      text: 'Newton third law states for every action there is an equal reaction.',
    })

    expect(item.id).toBeTruthy()
    expect(item.source).toBe('pdf')
    expect(item.fileType).toBe('pdf')
    expect(item.pageNumber).toBe(5)
    expect(item.startOffset).toBe(120)
    expect(item.endOffset).toBe(175)
    expect(useSnippetBagStore.getState().snippets).toHaveLength(1)
    expect(
      useSnippetBagStore
        .getState()
        .hasSnippet(
          'pdf-1',
          'Newton third law states for every action there is an equal reaction.',
          5,
        ),
    ).toBe(true)
  })

  it('allows same text on different pages of a PDF but deduplicates on the same page', () => {
    const itemPage1 = useSnippetBagStore.getState().addSnippet({
      fileId: 'pdf-1',
      fileName: 'Physics.pdf',
      fileType: 'pdf',
      source: 'pdf',
      pageNumber: 1,
      text: 'Introduction to Mechanics',
    })

    const itemPage2 = useSnippetBagStore.getState().addSnippet({
      fileId: 'pdf-1',
      fileName: 'Physics.pdf',
      fileType: 'pdf',
      source: 'pdf',
      pageNumber: 2,
      text: 'Introduction to Mechanics',
    })

    const duplicatePage1 = useSnippetBagStore.getState().addSnippet({
      fileId: 'pdf-1',
      fileName: 'Physics.pdf',
      fileType: 'pdf',
      source: 'pdf',
      pageNumber: 1,
      text: 'Introduction to Mechanics',
    })

    expect(itemPage1.id).not.toBe(itemPage2.id)
    expect(duplicatePage1.id).toBe(itemPage1.id)
    expect(useSnippetBagStore.getState().snippets).toHaveLength(2)
  })

  it('formats document layout with line breaks for bullet points and separates glued words', () => {
    const raw =
      'Lesson Objectives: • Explain IA concepts andCyber Security. • Differentiate CIA Triad.'

    const item = useSnippetBagStore.getState().addSnippet({
      fileId: 'pdf-1',
      fileName: 'Security.pdf',
      fileType: 'pdf',
      source: 'pdf',
      text: raw,
    })

    expect(item.text).toContain('Lesson Objectives:\n• Explain IA concepts and Cyber Security.')
    expect(item.text).toContain('\n• Differentiate CIA Triad.')
  })
})
