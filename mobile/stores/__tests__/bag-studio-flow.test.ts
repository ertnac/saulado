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

describe('Bag Studio Card Workflow & Snippet State Transitions', () => {
  beforeEach(() => {
    useSnippetBagStore.getState().clearBag()
  })

  it('supports initial card creation and subsequent reviewer bagging without stale state', () => {
    // Step 1: User bags first reviewer snippet
    const snippet1 = useSnippetBagStore.getState().addSnippet({
      fileId: 'rev-1',
      fileName: 'Cardiology Reviewer.pdf',
      fileType: 'pdf',
      source: 'pdf',
      pageNumber: 3,
      text: 'Myocardium is the muscular middle layer of the wall of the heart.',
    })

    expect(useSnippetBagStore.getState().snippets).toHaveLength(1)
    expect(useSnippetBagStore.getState().snippets[0]?.id).toBe(snippet1.id)

    // Step 2: Simulating card creation in bag studio -> saves card and removes snippet
    useSnippetBagStore.getState().removeSnippet(snippet1.id)
    expect(useSnippetBagStore.getState().snippets).toHaveLength(0)

    // Step 3: User bags another reviewer snippet
    const snippet2 = useSnippetBagStore.getState().addSnippet({
      fileId: 'rev-2',
      fileName: 'Neurology Reviewer.pdf',
      fileType: 'pdf',
      source: 'pdf',
      pageNumber: 7,
      text: 'Action potential propagates along the axon via saltatory conduction.',
    })

    // Verify the bag contains only the new snippet ready for next card creation
    const currentSnippets = useSnippetBagStore.getState().snippets
    expect(currentSnippets).toHaveLength(1)
    expect(currentSnippets[0]?.id).toBe(snippet2.id)
    expect(currentSnippets[0]?.text).toBe(
      'Action potential propagates along the axon via saltatory conduction.',
    )
    expect(currentSnippets[0]?.fileName).toBe('Neurology Reviewer.pdf')
  })

  it('correctly manages sequential card creations across different sets', () => {
    const s1 = useSnippetBagStore.getState().addSnippet({
      fileId: 'doc-1',
      fileName: 'Pathology.pdf',
      fileType: 'pdf',
      text: 'Hypertrophy is an increase in the size of cells.',
    })

    // Simulate saving to Set A
    const setAId = 'set-pathology-a'
    const createdCardsSetA: { targetSetId: string; snippetId: string }[] = []
    createdCardsSetA.push({ targetSetId: setAId, snippetId: s1.id })
    useSnippetBagStore.getState().removeSnippet(s1.id)

    expect(useSnippetBagStore.getState().snippets).toHaveLength(0)
    expect(createdCardsSetA[0]?.targetSetId).toBe('set-pathology-a')

    // Now user bags another reviewer for Set B
    const s2 = useSnippetBagStore.getState().addSnippet({
      fileId: 'doc-2',
      fileName: 'Pharmacology.pdf',
      fileType: 'pdf',
      text: 'Agonists activate receptors to produce the desired biological response.',
    })

    const setBId = 'set-pharm-b'
    const createdCardsSetB: { targetSetId: string; snippetId: string }[] = []
    createdCardsSetB.push({ targetSetId: setBId, snippetId: s2.id })
    useSnippetBagStore.getState().removeSnippet(s2.id)

    expect(useSnippetBagStore.getState().snippets).toHaveLength(0)
    expect(createdCardsSetB[0]?.targetSetId).toBe('set-pharm-b')
    expect(createdCardsSetB[0]?.targetSetId).not.toBe(createdCardsSetA[0]?.targetSetId)
  })
})
