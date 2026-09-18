import { beforeEach, describe, expect, it } from 'vitest'
import { useSnippetBagStore } from './snippet-bag'

describe('useSnippetBagStore', () => {
  beforeEach(() => {
    useSnippetBagStore.getState().clearBag()
  })

  it('starts with an empty bag', () => {
    expect(useSnippetBagStore.getState().snippets).toEqual([])
  })

  it('adds a snippet and normalizes text', () => {
    const added = useSnippetBagStore.getState().addSnippet({
      fileId: 'file-123',
      fileName: 'Lecture_1.pdf',
      fileType: 'pdf',
      text: 'IntroductionLesson to Cybersecurity.Differentiate threat from risk.',
      pageNumber: 2,
    })

    expect(added.id).toBeDefined()
    expect(added.fileId).toBe('file-123')
    expect(added.fileName).toBe('Lecture_1.pdf')
    expect(added.text).toContain('Introduction\n\nLesson to Cybersecurity. Differentiate')
    expect(useSnippetBagStore.getState().snippets).toHaveLength(1)
  })

  it('prevents adding exact duplicate snippet', () => {
    const s1 = useSnippetBagStore.getState().addSnippet({
      fileId: 'file-123',
      fileName: 'Lecture_1.pdf',
      fileType: 'pdf',
      text: 'Unique concept explanation.',
      pageNumber: 1,
    })

    const s2 = useSnippetBagStore.getState().addSnippet({
      fileId: 'file-123',
      fileName: 'Lecture_1.pdf',
      fileType: 'pdf',
      text: 'Unique concept explanation.',
      pageNumber: 1,
    })

    expect(s1.id).toBe(s2.id)
    expect(useSnippetBagStore.getState().snippets).toHaveLength(1)
  })

  it('updates snippet text', () => {
    const snippet = useSnippetBagStore.getState().addSnippet({
      fileId: 'file-1',
      fileName: 'Doc.pdf',
      fileType: 'pdf',
      text: 'Old snippet text',
    })

    useSnippetBagStore.getState().updateSnippetText(snippet.id, 'New customized snippet text')
    const found = useSnippetBagStore.getState().snippets.find((s) => s.id === snippet.id)
    expect(found?.text).toBe('New customized snippet text')
  })

  it('removes a snippet and clears the bag', () => {
    const s1 = useSnippetBagStore.getState().addSnippet({
      fileId: 'file-1',
      fileName: 'Doc.pdf',
      fileType: 'pdf',
      text: 'Snippet One',
    })
    const s2 = useSnippetBagStore.getState().addSnippet({
      fileId: 'file-1',
      fileName: 'Doc.pdf',
      fileType: 'pdf',
      text: 'Snippet Two',
    })

    expect(useSnippetBagStore.getState().snippets).toHaveLength(2)

    useSnippetBagStore.getState().removeSnippet(s1.id)
    expect(useSnippetBagStore.getState().snippets).toHaveLength(1)
    expect(useSnippetBagStore.getState().snippets[0]?.id).toBe(s2.id)

    useSnippetBagStore.getState().clearBag()
    expect(useSnippetBagStore.getState().snippets).toHaveLength(0)
  })

  it('checks hasSnippet correctly', () => {
    useSnippetBagStore.getState().addSnippet({
      fileId: 'file-1',
      fileName: 'Doc.pdf',
      fileType: 'pdf',
      text: 'Special terminology definition',
      pageNumber: 3,
    })

    expect(
      useSnippetBagStore.getState().hasSnippet('file-1', 'Special terminology definition', 3),
    ).toBe(true)
    expect(
      useSnippetBagStore.getState().hasSnippet('file-1', 'Special terminology definition', 4),
    ).toBe(false)
    expect(
      useSnippetBagStore.getState().hasSnippet('file-2', 'Special terminology definition'),
    ).toBe(false)
  })
})
