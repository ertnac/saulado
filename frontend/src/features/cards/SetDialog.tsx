import { useState, type ReactElement } from 'react'
import {
  DEFAULT_SET_COLOR,
  SET_COLORS,
  SET_DESCRIPTION_MAX_LENGTH,
  SET_TITLE_MAX_LENGTH,
  type SetColor,
  type StudySet,
} from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { AlertIcon } from '@/components/ui/icons'
import { useFormErrors } from '@/hooks/useFormErrors'
import { cn } from '@/lib/utils'
import { setColorClass } from './colors'

/**
 * Create and edit a set through one form.
 *
 * One component for both because the fields are identical and the only real
 * difference is which mutation runs — two near-copies would drift, and the
 * drifting half is always validation.
 *
 * The dialog is keyed by the set it is editing at the call site, so switching
 * from editing one set to another remounts it. Without that, `useState` below
 * would hold the previous set's title.
 */

interface SetDialogProps {
  open: boolean
  onClose: () => void
  /** Absent means create. */
  set?: StudySet
  onSubmit: (values: {
    title: string
    description: string | null
    color: SetColor
  }) => Promise<void>
  pending: boolean
}

export function SetDialog({ open, onClose, set, onSubmit, pending }: SetDialogProps): ReactElement {
  const [title, setTitle] = useState(set?.title ?? '')
  const [description, setDescription] = useState(set?.description ?? '')
  const [color, setColor] = useState<SetColor>(set?.color ?? DEFAULT_SET_COLOR)
  const { errors, setFromError, clear } = useFormErrors()

  const editing = set !== undefined
  const trimmed = title.trim()

  const submit = async (): Promise<void> => {
    clear()
    try {
      await onSubmit({
        title: trimmed,
        // Empty string is not a description — sending `null` is what actually
        // clears one, and the API treats the two differently on purpose.
        description: description.trim().length > 0 ? description.trim() : null,
        color,
      })
      onClose()
    } catch (error) {
      // Left open on failure, with the user's text still in it. Closing would
      // discard what they wrote to show them an error about it.
      setFromError(error)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit set' : 'New set'}
      description={
        editing ? undefined : 'A set groups cards on one subject — a chapter, a lecture, a topic.'
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {errors.general && (
          <p role="alert" className="flex items-start gap-1.5 text-sm text-warning">
            <AlertIcon className="mt-0.5 h-[1em] w-[1em]" />
            {errors.general}
          </p>
        )}

        <FormField
          label="Title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
          }}
          maxLength={SET_TITLE_MAX_LENGTH}
          error={errors.fields.title}
          autoComplete="off"
          placeholder="Cell Biology"
        />

        <FormField
          label="Description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
          }}
          maxLength={SET_DESCRIPTION_MAX_LENGTH}
          error={errors.fields.description}
          hint="Optional."
          autoComplete="off"
        />

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {SET_COLORS.map((option) => (
              <label
                key={option}
                className={cn(
                  'flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2',
                  'transition-colors duration-150',
                  // `foreground` rather than `primary` for the selected ring: the
                  // palette contains a green swatch, and a green ring around it
                  // would be the one selection the user cannot see.
                  color === option ? 'border-foreground' : 'border-transparent hover:border-border',
                )}
              >
                {/*
                  A real radio, visually hidden rather than replaced by a div:
                  arrow-key navigation within the group and the announced
                  "3 of 8" both come free, and neither is worth reimplementing.
                */}
                <input
                  type="radio"
                  name="set-color"
                  value={option}
                  checked={color === option}
                  onChange={() => {
                    setColor(option)
                  }}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn('h-7 w-7 rounded-full shadow-soft', setColorClass(option))}
                />
                <span className="sr-only">{option}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || trimmed.length === 0}>
            {pending ? 'Saving…' : editing ? 'Save' : 'Create set'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
