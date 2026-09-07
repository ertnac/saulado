import { useMemo, useState, type ReactElement } from 'react'
import { SET_DEPTH_MAX, type StudySet } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAllSets, useCreateSet, useUpdateSet } from './queries'

interface MoveSetDialogProps {
  open: boolean
  onClose: () => void
  set: StudySet | null
}

export function MoveSetDialog({ open, onClose, set }: MoveSetDialogProps): ReactElement | null {
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const allSets = useAllSets()
  const updateSet = useUpdateSet()
  const createSet = useCreateSet()

  const sets = allSets.data ?? []

  const { descendantIds, movingSetHeight, parentMap } = useMemo(() => {
    const childrenMap = new Map<string | null, string[]>()
    const pMap = new Map<string, string | null>()

    for (const s of sets) {
      pMap.set(s.id, s.parentId ?? null)
      const p = s.parentId ?? null
      const list = childrenMap.get(p) ?? []
      list.push(s.id)
      childrenMap.set(p, list)
    }

    if (!set) {
      return {
        descendantIds: new Set<string>(),
        movingSetHeight: 1,
        parentMap: pMap,
      }
    }

    const desc = new Set<string>()
    const queue = [set.id]
    while (queue.length > 0) {
      const curr = queue.shift()!
      const kids = childrenMap.get(curr) ?? []
      for (const kid of kids) {
        if (!desc.has(kid)) {
          desc.add(kid)
          queue.push(kid)
        }
      }
    }

    let height = 0
    let frontier = [set.id]
    const visited = new Set<string>()
    while (frontier.length > 0) {
      height++
      const next: string[] = []
      for (const id of frontier) {
        if (visited.has(id)) continue
        visited.add(id)
        const kids = childrenMap.get(id) ?? []
        next.push(...kids)
      }
      frontier = next
    }

    return {
      descendantIds: desc,
      movingSetHeight: Math.max(1, height),
      parentMap: pMap,
    }
  }, [sets, set])

  if (!set) return null

  const getTargetDepth = (targetId: string | null): number => {
    let depth = 0
    let curr = targetId
    const visited = new Set<string>()
    while (curr !== null && !visited.has(curr)) {
      visited.add(curr)
      depth++
      curr = parentMap.get(curr) ?? null
    }
    return depth
  }

  const handleMoveTo = async (newParentId: string | null): Promise<void> => {
    if (set.parentId === newParentId) return
    await updateSet.mutateAsync({ id: set.id, body: { parentId: newParentId } })
    onClose()
  }

  const handleCreateParentAndMove = async (): Promise<void> => {
    const title = newTitle.trim()
    if (!title) return
    const res = await createSet.mutateAsync({ title })
    if (res?.set?.id) {
      await updateSet.mutateAsync({ id: set.id, body: { parentId: res.set.id } })
      onClose()
    }
  }

  const isAlreadyRoot = set.parentId === null
  const filteredSets = sets.filter(
    (s) => s.id !== set.id && s.title.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const pending = updateSet.isPending || createSet.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Move study set"
      description={`Moving: "${set.title}"`}
    >
      <div className="space-y-4">
        {/* Option 1: Root Library */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Top Level
          </p>
          <button
            type="button"
            disabled={isAlreadyRoot || pending}
            onClick={() => void handleMoveTo(null)}
            className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-colors ${
              isAlreadyRoot
                ? 'opacity-60 cursor-not-allowed bg-muted/40 border-muted'
                : 'hover:bg-muted/30 cursor-pointer border-border active:bg-muted/50'
            }`}
          >
            <div>
              <p className="font-semibold text-sm">Root Library</p>
              <p className="text-xs text-muted-foreground">Top-level set (no parent)</p>
            </div>
            {isAlreadyRoot ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Current Level
              </span>
            ) : (
              <span className="text-xs text-primary font-medium">Move to Root →</span>
            )}
          </button>
        </div>

        {/* Option 2: Move into another set */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Or Nest Inside Set
          </p>

          {creating ? (
            <div className="space-y-3 rounded-2xl border p-4 bg-muted/30">
              <h4 className="text-sm font-semibold">Create new parent set & move inside</h4>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Parent set title..."
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreating(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void handleCreateParentAndMove()}
                  disabled={pending || !newTitle.trim()}
                >
                  {pending ? 'Moving…' : 'Create & Nest'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search parent sets..."
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewTitle(search)
                  setCreating(true)
                }}
              >
                + New Parent Set
              </Button>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
            {allSets.isLoading ? (
              <p className="text-center py-6 text-sm text-muted-foreground">Loading parent sets…</p>
            ) : filteredSets.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <p className="text-sm text-muted-foreground">
                  {sets.length <= 1
                    ? 'No other sets available to nest inside. Create another study set first.'
                    : `No study sets matching "${search}".`}
                </p>
                {!creating && (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      setNewTitle(search.trim())
                      setCreating(true)
                    }}
                  >
                    Create "{search || 'Parent Set'}" & Move
                  </Button>
                )}
              </div>
            ) : (
              filteredSets.map((target) => {
                const isCurrentParent = set.parentId === target.id
                const isDescendant = descendantIds.has(target.id)
                const targetDepth = getTargetDepth(target.id)
                const wouldExceedDepth = targetDepth + movingSetHeight > SET_DEPTH_MAX

                let disabledReason = ''
                if (isCurrentParent) disabledReason = 'Current parent'
                else if (isDescendant) disabledReason = 'Sub-set of this'
                else if (wouldExceedDepth) disabledReason = 'Depth limit (max 3)'

                const isDisabled = Boolean(disabledReason) || pending

                return (
                  <button
                    key={target.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => void handleMoveTo(target.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                      isDisabled
                        ? 'opacity-50 cursor-not-allowed bg-muted/40 border-muted'
                        : 'hover:bg-muted/30 cursor-pointer border-border active:bg-muted/50'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-sm">{target.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {target.cardCount} {target.cardCount === 1 ? 'card' : 'cards'}
                        {target.parentId ? ' · sub-set' : ''}
                      </p>
                    </div>
                    {disabledReason ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {disabledReason}
                      </span>
                    ) : (
                      <span className="text-xs text-primary font-medium">Nest inside →</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  )
}
