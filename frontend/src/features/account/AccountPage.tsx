import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ACCOUNT_DELETE_CONFIRMATION, PASSWORD_MIN_LENGTH, checkPassword } from '@saulado/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { PageHeader } from '@/components/layout/PageHeader'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/stores/toast'
import {
  useChangeEmail,
  useChangePassword,
  useDeleteAccount,
  useExportData,
  useSettings,
  useUpdateSettings,
} from './queries'
import { Section } from './SettingsControls'
import { ArchivedSetsSection } from './ArchivedSetsSection'

/**
 * Account and data (plan §6.5).
 *
 * Every action here asks for the current password again, even though the caller
 * already holds a valid access token. That is deliberate and matches the server:
 * a token proves someone authenticated at some point in the last fifteen
 * minutes, not that the person at the keyboard right now owns the account. Email
 * is the password-reset channel, so changing it is account takeover; deleting is
 * irreversible. Both are worth one more prompt.
 */
export function AccountPage(): ReactElement {
  const email = useAuthStore((s) => s.user?.email ?? '')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description={
          <>
            Signed in as {email}.{' '}
            <Link to="/settings" className="font-medium text-foreground underline">
              Study settings
            </Link>
          </>
        }
        className="mb-0"
      />

      <ProfileSection />
      <ArchivedSetsSection />
      <ChangeEmailSection currentEmail={email} />
      <ChangePasswordSection />
      <ExportSection />
      <DeleteSection />
    </div>
  )
}

function ProfileSection(): ReactElement {
  const settingsQuery = useSettings()
  const updateSettings = useUpdateSettings()

  const settings = settingsQuery.data?.settings
  const storedNickname = settings?.nickname ?? ''
  const storedProfileImage = settings?.profileImage ?? null

  const [nickname, setLocalNickname] = useState(storedNickname)
  const [profileImage, setLocalProfileImage] = useState<string | null>(storedProfileImage)

  // Sync state when data is loaded from query
  useEffect(() => {
    if (settings) {
      setLocalNickname(settings.nickname)
      setLocalProfileImage(settings.profileImage)
    }
  }, [settings])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64String = reader.result as string
      setLocalProfileImage(base64String)
      updateSettings.mutate({ profileImage: base64String })
    }
    reader.readAsDataURL(file)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateSettings.mutate(
      { nickname: nickname.trim() },
      {
        onSuccess: () => {
          toast.success('Nickname updated.')
        },
      },
    )
  }

  const handleRemovePhoto = () => {
    setLocalProfileImage(null)
    updateSettings.mutate({ profileImage: null })
  }

  if (settingsQuery.isPending) {
    return (
      <Section title="Profile">
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      </Section>
    )
  }

  return (
    <Section title="Profile">
      <div className="flex flex-col items-center gap-4 py-2 sm:flex-row sm:items-start">
        <div className="relative">
          {profileImage ? (
            <img
              src={profileImage}
              alt="Profile"
              className="h-20 w-20 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary text-xl font-semibold">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 justify-center pt-2">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-muted transition-colors">
            Change photo
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
          {profileImage && (
            <Button variant="ghost" onClick={handleRemovePhoto}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4 mt-4">
        <FormField
          label="Nickname"
          type="text"
          value={nickname}
          onChange={(e) => {
            setLocalNickname(e.target.value)
          }}
          hint="Your nickname is displayed on the dashboard welcome banner."
          maxLength={30}
        />

        <Button
          type="submit"
          disabled={nickname.trim() === storedNickname || updateSettings.isPending}
        >
          Save Profile
        </Button>
      </form>
    </Section>
  )
}

function ChangeEmailSection({ currentEmail }: { currentEmail: string }): ReactElement {
  const changeEmail = useChangeEmail()
  const { errors, setFromError, clear } = useFormErrors()

  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    clear()

    try {
      await changeEmail.mutateAsync({ email, currentPassword })
      setSent(email)
      setEmail('')
      setCurrentPassword('')
    } catch (err) {
      setFromError(err)
    }
  }

  /**
   * The success state replaces the form rather than sitting above it.
   *
   * Nothing has changed yet — the address only moves when the link in the new
   * inbox is opened — and leaving a filled-in form on screen invites a second
   * submission from a user who did not realise the first one worked.
   */
  if (sent) {
    return (
      <Section title="Email">
        <p className="text-sm">
          Check <span className="font-medium">{sent}</span> for a confirmation link. Your address
          stays <span className="font-medium">{currentEmail}</span> until you open it.
        </p>
        <Button
          variant="soft"
          onClick={() => {
            setSent(null)
          }}
        >
          Change a different address
        </Button>
      </Section>
    )
  }

  return (
    <Section title="Email">
      {errors.general && (
        <p role="alert" className="text-sm text-warning">
          {errors.general}
        </p>
      )}

      <form
        onSubmit={(e) => {
          void onSubmit(e)
        }}
        noValidate
        className="space-y-4"
      >
        <FormField
          label="New email address"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
          }}
          error={errors.fields.email}
          hint="We send a link there to confirm it before anything changes."
          autoComplete="email"
          required
        />

        <FormField
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value)
          }}
          error={errors.fields.currentPassword}
          autoComplete="current-password"
          required
        />

        <Button type="submit" disabled={changeEmail.isPending}>
          {changeEmail.isPending ? 'Sending…' : 'Send confirmation link'}
        </Button>
      </form>
    </Section>
  )
}

function ChangePasswordSection(): ReactElement {
  const changePassword = useChangePassword()
  const navigate = useNavigate()
  const { errors, setFromError, clear } = useFormErrors()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    clear()
    setLocalError(null)

    // Checked client-side first only to save a round trip on an obvious miss;
    // the server applies the same rule and is what actually enforces it.
    const problem = checkPassword(newPassword)
    if (problem) {
      setLocalError(problem.message)
      return
    }

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword })
      /**
       * Straight to login. The server revoked every session including this
       * one — that is the point of changing a password — so there is nothing to
       * return to, and signing in with the new one is the user's own proof it
       * took. `useChangePassword` has already cleared the client session.
       */
      toast.success('Password updated. Sign in with your new password.')
      void navigate('/login', { replace: true })
    } catch (err) {
      setFromError(err)
    }
  }

  return (
    <Section title="Password">
      {errors.general && (
        <p role="alert" className="text-sm text-warning">
          {errors.general}
        </p>
      )}

      <form
        onSubmit={(e) => {
          void onSubmit(e)
        }}
        noValidate
        className="space-y-4"
      >
        <FormField
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value)
          }}
          error={errors.fields.currentPassword}
          autoComplete="current-password"
          required
        />

        <FormField
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value)
            if (localError) setLocalError(null)
          }}
          error={localError ?? errors.fields.newPassword}
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. This signs you out everywhere.`}
          autoComplete="new-password"
          required
        />

        <Button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </Section>
  )
}

/**
 * The GDPR Art. 20 export.
 *
 * Built into a Blob and downloaded through an object URL rather than pointed at
 * by an `<a href>`: the endpoint needs an `Authorization` header, and a plain
 * link cannot carry one. Navigating to it would send the request unauthenticated
 * and download a 401 body as a file.
 */
function ExportSection(): ReactElement {
  const exportData = useExportData()

  function onExport(): void {
    exportData.mutate(undefined, {
      onSuccess: (data) => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
        )
        const link = document.createElement('a')
        link.href = url
        link.download = `saulado-export-${data.exportedAt.slice(0, 10)}.json`
        link.click()
        // Released immediately — the blob is the user's entire library, and an
        // object URL keeps it alive in memory for as long as the document lives.
        URL.revokeObjectURL(url)
        toast.success('Export downloaded.')
      },
      onError: () => {
        toast.error('The export could not be built. Try again in a moment.')
      },
    })
  }

  return (
    <Section title="Your data">
      <p className="text-sm text-muted-foreground">
        Everything you have written — sets, cards, answers, schedules and your review history — as
        one JSON file. Credentials are not included.
      </p>
      <Button variant="soft" onClick={onExport} disabled={exportData.isPending}>
        {exportData.isPending ? 'Building…' : 'Download my data'}
      </Button>
    </Section>
  )
}

/**
 * Deletion — the one irreversible action in the product.
 *
 * Three gates, and each one is doing separate work. The disclosure means it
 * cannot be reached by a stray click on a page people visit to change their
 * password. The typed word interrupts muscle memory, which a confirm dialog does
 * not. The password proves who is asking. All three are re-checked server-side;
 * the client versions only save a round trip.
 */
function DeleteSection(): ReactElement {
  const deleteAccount = useDeleteAccount()
  const navigate = useNavigate()
  const { errors, setFromError, clear } = useFormErrors()

  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const confirmed = confirmation === ACCOUNT_DELETE_CONFIRMATION

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    clear()

    try {
      await deleteAccount.mutateAsync({ currentPassword, confirmation })
      // No toast. The account is gone and so is the session; a cheerful
      // acknowledgement floating over the login page is the wrong note, and the
      // empty signed-out state is confirmation enough.
      void navigate('/login', { replace: true })
    } catch (err) {
      setFromError(err)
    }
  }

  return (
    /*
      `--danger`, and the only place in the app that uses it as a *border*. Every
      other error in the product is something you retype; this one is the single
      irreversible action, so it gets the loudest treatment available and nothing
      else is allowed to borrow it.
    */
    <Card as="section" tone="danger" className="space-y-4 p-5 sm:p-6">
      <h2 className="text-base font-semibold tracking-tight text-danger">Delete account</h2>

      <p className="text-sm text-muted-foreground">
        Permanently removes your account and every set, card, answer and review with it. This cannot
        be undone and there is no backup to restore from — download your data first if you want a
        copy.
      </p>

      {!open ? (
        <Button
          // Outline, not filled danger. This button only *opens* the disclosure;
          // the filled one below is the button that actually deletes, and two
          // solid red buttons in the same panel is how the wrong one gets hit.
          variant="outline"
          onClick={() => {
            setOpen(true)
          }}
        >
          Delete my account
        </Button>
      ) : (
        <form
          onSubmit={(e) => {
            void onSubmit(e)
          }}
          noValidate
          className="space-y-4"
        >
          {errors.general && (
            <p role="alert" className="text-sm text-warning">
              {errors.general}
            </p>
          )}

          <FormField
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value)
            }}
            error={errors.fields.currentPassword}
            autoComplete="current-password"
            required
            autoFocus
          />

          <FormField
            label={`Type ${ACCOUNT_DELETE_CONFIRMATION} to confirm`}
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value)
            }}
            error={errors.fields.confirmation}
            // Autocomplete and autocorrect off, because a keyboard that
            // capitalises or "fixes" the word turns a deliberate confirmation
            // into a form the user cannot submit and cannot see why.
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />

          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={!confirmed || deleteAccount.isPending}>
              {deleteAccount.isPending ? 'Deleting…' : 'Delete permanently'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false)
                setCurrentPassword('')
                setConfirmation('')
                clear()
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
