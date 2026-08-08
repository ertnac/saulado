import { useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { normalizeTag, TAG_MAX_LENGTH, TAGS_MAX_PER_CARD } from '@saulado/shared'
import { Input } from '@/components/ui/input'

/**
 * Tag entry as chips.
 *
 * Canonicalisation runs through `normalizeTag` from the shared package, the same
 * function the API applies on write. Doing it here as well is not redundancy for
 * its own sake: without it the chip says "Cell Biology" and the server stores
 * "cell biology", so the tag the user just added does not match the filter they
 * then click.
 *
 * Backspace-to-remove is deliberate and is why the input keeps its own value in
 * state rather than reading it on submit — the handler needs to know the field is
 * empty to decide whether Backspace means "delete a character" or "delete the
 * last chip".
 */

interface TagInputProps {
  value: readonly string[]
  onChange: (tags: string[]) => void
  /** Tags the user already has elsewhere, offered as a datalist. */
  suggestions?: readonly string[]
  label?: string
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  label = 'Tags',
}: TagInputProps): ReactElement {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const listId = `${id}-suggestions`

  const atLimit = value.length >= TAGS_MAX_PER_CARD

  const add = (raw: string): void => {
    const tag = normalizeTag(raw)
    // A duplicate is not an error worth a message — the tag is already there, so
    // clearing the field is the whole of the correct response.
    if (tag.length === 0 || value.includes(tag) || atLimit) {
      setDraft('')
      return
    }

    onChange([...value, tag.slice(0, TAG_MAX_LENGTH)])
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // Comma commits too: pasting "algebra, calculus" is a common way to arrive
    // here, and treating the comma as text produces one tag named "algebra,".
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(draft)
      return
    }

    if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const unused = suggestions.filter((tag) => !value.includes(tag))

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected tags">
          {value.map((tag) => (
            <li key={tag}>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-sm">
                {tag}
                <button
                  type="button"
                  onClick={() => {
                    onChange(value.filter((item) => item !== tag))
                    // Focus would otherwise land on the body once the chip's own
                    // button unmounts, losing the user's place in the form.
                    inputRef.current?.focus()
                  }}
                  // Named rather than "Remove", so a screen reader user hearing a
                  // list of six buttons can tell which is which.
                  aria-label={`Remove tag ${tag}`}
                  className="rounded-full px-0.5 text-muted-foreground hover:text-foreground"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Input
        id={id}
        ref={inputRef}
        list={unused.length > 0 ? listId : undefined}
        value={draft}
        maxLength={TAG_MAX_LENGTH}
        disabled={atLimit}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onKeyDown={onKeyDown}
        // Commits on blur, so a user who types a tag and clicks Save directly
        // does not silently lose it.
        onBlur={() => {
          add(draft)
        }}
        placeholder={atLimit ? `Limit of ${String(TAGS_MAX_PER_CARD)} tags reached` : 'Add a tag…'}
        aria-describedby={`${id}-hint`}
      />

      {unused.length > 0 && (
        <datalist id={listId}>
          {unused.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      )}

      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Enter or comma to add. Backspace removes the last one.
      </p>
    </div>
  )
}
