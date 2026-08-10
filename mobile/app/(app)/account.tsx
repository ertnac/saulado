import { useEffect, useState, type ReactElement } from 'react'
import { Alert, Image, ScrollView, Share, Text, View } from 'react-native'
import {
  ACCOUNT_DELETE_CONFIRMATION,
  PASSWORD_MIN_LENGTH,
  checkPassword,
  type DataExport,
} from '@saulado/shared'
import * as ImagePicker from 'expo-image-picker'
import { Button } from '../../components/button'
import { Card } from '../../components/card'
import { Field, FormAlert, FormStack } from '../../components/form'
import { Section } from '../../components/settings-controls'
import { UserIcon } from '../../components/icons'
import {
  useChangeEmail,
  useChangePassword,
  useDeleteAccount,
  useExportData,
  useSettings,
  useUpdateSettings,
} from '../../hooks/settings'
import { useFormErrors } from '../../hooks/useFormErrors'
import { useAuthStore } from '../../stores/auth'
import { useTokenColor } from '../../stores/theme'

/**
 * Account and data — a port of `frontend/src/features/account/AccountPage.tsx`.
 *
 * Every action here asks for the current password again, even though the caller
 * already holds a valid access token. That is deliberate and matches the server:
 * a token proves someone authenticated at some point in the last fifteen minutes,
 * not that the person holding the phone right now owns the account. Email is the
 * password-reset channel, so changing it is account takeover; deleting is
 * irreversible. Both are worth one more prompt — more so here, where an unlocked
 * phone is routinely in someone else's hand.
 *
 * Neither of the two session-ending flows navigates. `useChangePassword` and
 * `useDeleteAccount` mark the store anonymous, and the guard in `(app)/_layout`
 * redirects on that alone — a `router.replace('/login')` racing it would be a
 * second navigation for the same event.
 */
export default function AccountScreen(): ReactElement {
  const user = useAuthStore((s) => s.user)
  const email = user?.email ?? ''

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-5 pb-32"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-sm text-muted-foreground">{`Signed in as ${email}.`}</Text>

      <ProfileSection />
      <ChangeEmailSection currentEmail={email} />
      <ChangePasswordSection />
      <ExportSection />
      <DeleteSection />
    </ScrollView>
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
  const primary = useTokenColor('--primary')

  // Keep local state in sync when store loads
  useEffect(() => {
    if (settings) {
      setLocalNickname(settings.nickname)
      setLocalProfileImage(settings.profileImage)
    }
  }, [settings])

  const selectPhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permissionResult.granted) {
      Alert.alert(
        'Permission denied',
        'We need photo library permissions to change your profile picture.',
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0]) {
      const selectedUri = result.assets[0].uri
      setLocalProfileImage(selectedUri)
      updateSettings.mutate({ profileImage: selectedUri })
    }
  }

  const removePhoto = () => {
    setLocalProfileImage(null)
    updateSettings.mutate({ profileImage: null })
  }

  const handleSave = () => {
    updateSettings.mutate(
      { nickname: nickname.trim() },
      {
        onSuccess: () => {
          Alert.alert('Saved', 'Profile details updated successfully.')
        },
      },
    )
  }

  if (settingsQuery.isPending) {
    return (
      <Section title="Profile">
        <Text className="text-sm text-muted-foreground">Loading profile...</Text>
      </Section>
    )
  }

  return (
    <Section title="Profile">
      <View className="items-center gap-4 py-2">
        {profileImage ? (
          <Image
            source={{ uri: profileImage }}
            style={{ width: 80, height: 80, borderRadius: 40 }}
            className="border border-border"
          />
        ) : (
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center border border-primary/20">
            <UserIcon color={primary} size={36} />
          </View>
        )}

        <View className="flex-row gap-2">
          <Button
            label="Change photo"
            variant="outline"
            onPress={() => {
              void selectPhoto()
            }}
          />
          {profileImage && <Button label="Remove" variant="ghost" onPress={removePhoto} />}
        </View>
      </View>

      <View className="mt-2">
        <FormStack>
          <Field
            label="Nickname"
            value={nickname}
            onChangeText={setLocalNickname}
            hint="Your nickname is displayed on the dashboard welcome banner."
            autoCorrect={false}
            maxLength={30}
          />
          <Button
            label="Save Profile"
            onPress={handleSave}
            disabled={nickname.trim() === storedNickname || updateSettings.isPending}
          />
        </FormStack>
      </View>
    </Section>
  )
}

function ChangeEmailSection({ currentEmail }: { currentEmail: string }): ReactElement {
  const changeEmail = useChangeEmail()
  const { errors, setFromError, clear } = useFormErrors()

  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [sent, setSent] = useState<string | null>(null)

  function onSubmit(): void {
    clear()
    changeEmail.mutate(
      { email, currentPassword },
      {
        onSuccess: () => {
          setSent(email)
          setEmail('')
          setCurrentPassword('')
        },
        onError: setFromError,
      },
    )
  }

  /**
   * The success state replaces the form rather than sitting above it.
   *
   * Nothing has changed yet — the address only moves when the link in the new
   * inbox is opened — and leaving a filled-in form on screen invites a second
   * submission from someone who did not realise the first one worked.
   */
  if (sent) {
    return (
      <Section title="Email">
        <Text className="text-sm text-foreground">
          {`Check ${sent} for a confirmation link. Your address stays ${currentEmail} until you open it.`}
        </Text>
        <Button
          label="Change a different address"
          variant="outline"
          onPress={() => {
            setSent(null)
          }}
        />
      </Section>
    )
  }

  return (
    <Section title="Email">
      {errors.general !== null && <FormAlert message={errors.general} />}

      <FormStack>
        <Field
          label="New email address"
          value={email}
          onChangeText={setEmail}
          error={errors.fields.email}
          hint="We send a link there to confirm it before anything changes."
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
        />

        <Field
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          error={errors.fields.currentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
        />

        <Button
          label={changeEmail.isPending ? 'Sending…' : 'Send confirmation link'}
          onPress={onSubmit}
          loading={changeEmail.isPending}
        />
      </FormStack>
    </Section>
  )
}

function ChangePasswordSection(): ReactElement {
  const changePassword = useChangePassword()
  const { errors, setFromError, clear } = useFormErrors()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  function onSubmit(): void {
    clear()
    setLocalError(null)

    // Checked client-side first only to save a round trip on an obvious miss;
    // the server applies the same rule and is what actually enforces it.
    const problem = checkPassword(newPassword)
    if (problem) {
      setLocalError(problem.message)
      return
    }

    changePassword.mutate(
      { currentPassword, newPassword },
      {
        /*
          No success message and no navigation. The server revoked every session
          including this one — that is the point of changing a password — so
          `useChangePassword` has already marked the store anonymous, and the
          guard in `(app)/_layout` is what moves the user to the sign-in form.
          Signing in with the new password is their own proof it took.
        */
        onError: setFromError,
      },
    )
  }

  return (
    <Section title="Password">
      {errors.general !== null && <FormAlert message={errors.general} />}

      <FormStack>
        <Field
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          error={errors.fields.currentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
        />

        <Field
          label="New password"
          value={newPassword}
          onChangeText={(next) => {
            setNewPassword(next)
            if (localError) setLocalError(null)
          }}
          error={localError ?? errors.fields.newPassword}
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters. This signs you out everywhere.`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />

        <Button
          label={changePassword.isPending ? 'Updating…' : 'Update password'}
          onPress={onSubmit}
          loading={changePassword.isPending}
        />
      </FormStack>
    </Section>
  )
}

/**
 * Android refuses an intent payload much over a megabyte, and the failure is a
 * crash in the OS rather than a rejected promise. Half of that is the cut, since
 * the JSON is UTF-16 in memory and other extras ride along.
 */
const SHARE_MAX_CHARS = 512_000

/**
 * The GDPR Art. 20 export.
 *
 * `Share.share` is the sink — rung 4 of the ladder, the platform's own sheet,
 * which already reaches Files, Drive, Mail and everything else the user has
 * installed. `expo-file-system` plus `expo-sharing` would write a real `.json`
 * and hand it over as a file, but that is two dependencies for a button most
 * users press once.
 *
 * ponytail: text through the share sheet, so a large library exceeds what an
 * intent can carry and is refused with a pointer at the web. Add
 * `expo-file-system` + `expo-sharing` and write the JSON to
 * `cacheDirectory` when someone actually hits that.
 */
function ExportSection(): ReactElement {
  const exportData = useExportData()

  function onExport(): void {
    exportData.mutate(undefined, {
      onSuccess: (data: DataExport) => {
        const json = JSON.stringify(data, null, 2)

        if (json.length > SHARE_MAX_CHARS) {
          Alert.alert(
            'Too large to share here',
            'Your library is bigger than this phone can hand to another app. Export from the web app instead — same file, no size limit.',
          )
          return
        }

        void Share.share({
          message: json,
          title: `saulado-export-${data.exportedAt.slice(0, 10)}.json`,
        }).catch(() => {
          Alert.alert('Could not share', 'Nothing on this phone accepted the file.')
        })
      },
      onError: () => {
        Alert.alert('Export failed', 'The export could not be built. Try again in a moment.')
      },
    })
  }

  return (
    <Section title="Your data">
      <Text className="text-sm text-muted-foreground">
        Everything you have written — sets, cards, answers, schedules and your review history — as
        one JSON file. Credentials are not included.
      </Text>
      <Button
        label={exportData.isPending ? 'Building…' : 'Export my data'}
        variant="outline"
        onPress={onExport}
        loading={exportData.isPending}
      />
    </Section>
  )
}

/**
 * Deletion — the one irreversible action in the product.
 *
 * Three gates, and each one is doing separate work. The disclosure means it
 * cannot be reached by a stray tap on a screen people open to change their
 * password. The typed word interrupts muscle memory, which a confirm dialog does
 * not — and on a phone, where the whole panel sits under one thumb, that matters
 * more than it does behind a mouse. The password proves who is asking. All three
 * are re-checked server-side; the client versions only save a round trip.
 */
function DeleteSection(): ReactElement {
  const deleteAccount = useDeleteAccount()
  const { errors, setFromError, clear } = useFormErrors()

  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const confirmed = confirmation === ACCOUNT_DELETE_CONFIRMATION

  function onSubmit(): void {
    clear()
    // No success handler. The account is gone and so is the session;
    // `useDeleteAccount` marked the store anonymous and the guard in
    // `(app)/_layout` takes it from there. A cheerful acknowledgement floating
    // over the sign-in screen would be the wrong note anyway.
    deleteAccount.mutate({ currentPassword, confirmation }, { onError: setFromError })
  }

  return (
    <Card tone="danger" className="gap-4">
      <Text className="text-base font-semibold tracking-tight text-danger">Delete account</Text>

      <Text className="text-sm text-muted-foreground">
        Permanently removes your account and every set, card, answer and review with it. This cannot
        be undone and there is no backup to restore from — export your data first if you want a
        copy.
      </Text>

      {!open ? (
        <Button
          // Outline, not filled danger. This button only *opens* the disclosure;
          // the filled one below is the button that actually deletes, and two
          // solid red buttons in one panel is how the wrong one gets hit.
          label="Delete my account"
          variant="outline"
          onPress={() => {
            setOpen(true)
          }}
        />
      ) : (
        <FormStack>
          {errors.general !== null && <FormAlert message={errors.general} />}

          <Field
            label="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            error={errors.fields.currentPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            autoFocus
          />

          <Field
            label={`Type ${ACCOUNT_DELETE_CONFIRMATION} to confirm`}
            value={confirmation}
            onChangeText={setConfirmation}
            error={errors.fields.confirmation}
            /*
              Autocorrect and spellcheck off: a keyboard that "fixes" the word
              turns a deliberate confirmation into a form the user cannot submit
              and cannot see why. Capitalisation goes the other way from the
              web's `none` — the server compares case-sensitively against an
              uppercase word, and making someone hold shift for six letters on a
              phone keyboard is friction with no safety in it. Typing the word at
              all is the interruption; the shift key is not.
            */
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
          />

          <View className="flex-row gap-2">
            <Button
              label={deleteAccount.isPending ? 'Deleting…' : 'Delete permanently'}
              variant="danger"
              onPress={onSubmit}
              disabled={!confirmed}
              loading={deleteAccount.isPending}
            />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setOpen(false)
                setCurrentPassword('')
                setConfirmation('')
                clear()
              }}
            />
          </View>
        </FormStack>
      )}
    </Card>
  )
}
