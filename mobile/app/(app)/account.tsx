import { useEffect, useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import {
  ACCOUNT_DELETE_CONFIRMATION,
  PASSWORD_MIN_LENGTH,
  checkPassword,
  type DataExport,
} from '@saulado/shared'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImagePicker from 'expo-image-picker'
import { Button } from '../../components/button'
import { Card } from '../../components/card'
import { Field, FormAlert, FormStack } from '../../components/form'
import { Section } from '../../components/settings-controls'
import { FileTextIcon, TrashIcon, UploadIcon, UserIcon } from '../../components/icons'
import {
  cardKeys,
  flattenPages,
  setKeys,
  useArchiveSet,
  useDeleteSet,
  useSets,
} from '../../hooks/cards'
import {
  useChangeEmail,
  useChangePassword,
  useDeleteAccount,
  useExportData,
  useSettings,
  useUpdateSettings,
} from '../../hooks/settings'
import { useFormErrors } from '../../hooks/useFormErrors'
import {
  importSetsAndCards,
  parseAndValidateJson,
  shareJsonPayload,
} from '../../services/json-transfer'
import { useAuthStore } from '../../stores/auth'
import { useTokenColor } from '../../stores/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const email = user?.email ?? ''

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-5"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 96, 128) }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted-foreground">{`Signed in as ${email}.`}</Text>
        <Button
          label="Log out"
          variant="outline"
          onPress={() => {
            void logout()
          }}
        />
      </View>

      <ProfileSection />
      <ArchivedSetsSection />
      <JsonTransferSection />
      <ChangeEmailSection currentEmail={email} />
      <ChangePasswordSection />
      <DeleteSection />
    </ScrollView>
  )
}

function ArchivedSetsSection(): ReactElement {
  const archivedSets = useSets({ archived: true })
  const archiveSet = useArchiveSet()
  const deleteSet = useDeleteSet()
  const warning = useTokenColor('--warning')
  const [expanded, setExpanded] = useState(false)

  const items = flattenPages(archivedSets.data)

  const handleRestore = (id: string, title: string): void => {
    archiveSet.mutate({ id, archive: false })
    Alert.alert('Set Restored', `"${title}" has been moved back to your Sets tab.`)
  }

  const handleDelete = (id: string, title: string): void => {
    Alert.alert(
      'Delete Permanently?',
      `Are you sure you want to permanently delete "${title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSet.mutate(id)
          },
        },
      ],
    )
  }

  return (
    <Section title="Archived Sets">
      <Card className="gap-4 p-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 gap-1">
            <Text className="text-base font-bold text-foreground">
              {items.length === 1 ? '1 Archived Set' : `${String(items.length)} Archived Sets`}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Sets you archive to keep your library tidy are stored here.
            </Text>
          </View>
          <Button
            label={expanded ? 'Hide' : 'Manage'}
            variant="outline"
            onPress={() => {
              setExpanded(!expanded)
            }}
          />
        </View>

        {expanded && (
          <View className="gap-3 pt-2">
            {archivedSets.isPending ? (
              <ActivityIndicator />
            ) : items.length === 0 ? (
              <Text className="text-sm text-muted-foreground">No archived sets right now.</Text>
            ) : (
              <View className="gap-2">
                {items.map((set) => (
                  <View
                    key={set.id}
                    className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5"
                  >
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-sm font-bold text-foreground">
                        {set.title}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {`${String(set.cardCount)} cards`}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <Button
                        label="Restore"
                        variant="outline"
                        onPress={() => {
                          handleRestore(set.id, set.title)
                        }}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${set.title}`}
                        hitSlop={8}
                        onPress={() => {
                          handleDelete(set.id, set.title)
                        }}
                        className="rounded-full p-2 active:bg-warning/10"
                      >
                        <TrashIcon color={warning} size={18} />
                      </Pressable>
                    </View>
                  </View>
                ))}

                {archivedSets.hasNextPage === true && (
                  <Button
                    label={archivedSets.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    variant="ghost"
                    disabled={archivedSets.isFetchingNextPage}
                    onPress={() => {
                      void archivedSets.fetchNextPage()
                    }}
                  />
                )}
              </View>
            )}
          </View>
        )}
      </Card>
    </Section>
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

  const [savedSuccess, setSavedSuccess] = useState(false)

  const removePhoto = () => {
    setLocalProfileImage(null)
    updateSettings.mutate({ profileImage: null })
  }

  const handleSave = () => {
    Keyboard.dismiss()
    setSavedSuccess(false)
    updateSettings.mutate(
      { nickname: nickname.trim() },
      {
        onSuccess: () => {
          setSavedSuccess(true)
          setTimeout(() => {
            setSavedSuccess(false)
          }, 2500)
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
            onChangeText={(text) => {
              setSavedSuccess(false)
              setLocalNickname(text)
            }}
            hint="Your nickname is displayed on the dashboard welcome banner."
            autoCorrect={false}
            maxLength={30}
          />
          <Button
            label={
              savedSuccess ? 'Saved! ✨' : updateSettings.isPending ? 'Saving…' : 'Save Profile'
            }
            onPress={handleSave}
            disabled={nickname.trim() === storedNickname || updateSettings.isPending}
            loading={updateSettings.isPending}
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
 * The GDPR Art. 20 export.
 *
 * Uses `expo-sharing` to write the JSON to a temp file and hand it to the
 * system share sheet. This bypasses the Android intent payload limit that
 * crashed the old `Share.share({ message })` approach and gives the recipient
 * a proper `.json` file instead of a wall of text.
 */
function JsonTransferSection(): ReactElement {
  const exportData = useExportData()
  const queryClient = useQueryClient()
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importMode, setImportMode] = useState<'file' | 'text'>('file')
  const [selectedFile, setSelectedFile] = useState<{ name: string; size?: number } | null>(null)
  const [jsonText, setJsonText] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')

  const muted = useTokenColor('--muted-foreground')
  const primary = useTokenColor('--primary')

  const parsedResult = jsonText.trim() ? parseAndValidateJson(jsonText.trim()) : null

  function onExport(): void {
    exportData.mutate(undefined, {
      onSuccess: (data: DataExport) => {
        const json = JSON.stringify(data, null, 2)
        const filename = `saulado-export-${data.exportedAt.slice(0, 10)}.json`
        void shareJsonPayload(filename, json)
      },
      onError: () => {
        Alert.alert('Export failed', 'The export could not be built. Try again in a moment.')
      },
    })
  }

  const handlePickFile = async (): Promise<void> => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      })

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0]
        if (file) {
          setSelectedFile({ name: file.name, size: file.size })
          const content = await FileSystem.readAsStringAsync(file.uri)
          setJsonText(content)
        }
      }
    } catch {
      Alert.alert('File Error', 'Could not open or read the selected file.')
    }
  }

  const handleStartImport = async (): Promise<void> => {
    if (!parsedResult || !parsedResult.success) return

    setIsImporting(true)
    setImportProgress('Starting import...')

    try {
      const result = await importSetsAndCards(parsedResult.data, (_current, _total, msg) => {
        setImportProgress(msg)
      })

      void queryClient.invalidateQueries({ queryKey: setKeys.all })
      void queryClient.invalidateQueries({ queryKey: cardKeys.all })

      setImportModalVisible(false)
      setJsonText('')
      setSelectedFile(null)
      const failedNote =
        result.failedCards > 0 ? ` (${String(result.failedCards)} cards could not be imported)` : ''
      Alert.alert(
        'Import Complete! 🎉',
        `Successfully imported ${String(result.importedSets)} ${result.importedSets === 1 ? 'set' : 'sets'} and ${String(result.importedCards)} ${result.importedCards === 1 ? 'card' : 'cards'}${failedNote}.`,
      )
    } catch {
      Alert.alert(
        'Import Failed',
        'An error occurred while creating imported sets and cards. Please try again.',
      )
    } finally {
      setIsImporting(false)
      setImportProgress('')
    }
  }

  return (
    <Section title="JSON Backup & Sharing">
      <Card className="gap-4 p-5">
        <Text className="text-sm text-muted-foreground">
          Export your cards and sets as a portable JSON file to share with classmates, or import
          shared JSON decks into your library.
        </Text>

        <View className="gap-2.5">
          <Button
            label={exportData.isPending ? 'Building JSON…' : 'Share Full Library (JSON)'}
            variant="outline"
            onPress={onExport}
            loading={exportData.isPending}
          />

          <Button
            label="Import Sets & Cards (JSON)"
            variant="outline"
            onPress={() => {
              setImportModalVisible(true)
            }}
          />
        </View>
      </Card>

      {/* Import Modal */}
      {importModalVisible && (
        <Modal
          visible={importModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            if (!isImporting) setImportModalVisible(false)
          }}
        >
          <Pressable
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            className="flex-1 items-center justify-center p-4"
            onPress={() => {
              if (!isImporting) setImportModalVisible(false)
            }}
          >
            <View
              className="max-h-[90%] w-full max-w-md gap-4 rounded-3xl border border-border bg-surface p-6"
              onStartShouldSetResponder={() => true}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-foreground">Import Sets & Cards</Text>
                {!isImporting && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      setImportModalVisible(false)
                    }}
                  >
                    <Text className="font-semibold text-primary">Cancel</Text>
                  </Pressable>
                )}
              </View>

              {/* Mode Switch Tabs */}
              <View className="flex-row rounded-xl bg-surface-muted p-1 border border-border">
                <Pressable
                  disabled={isImporting}
                  onPress={() => {
                    setImportMode('file')
                  }}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${importMode === 'file' ? 'bg-surface' : ''}`}
                >
                  <UploadIcon color={importMode === 'file' ? primary : muted} size={16} />
                  <Text
                    className={`text-xs font-bold ${importMode === 'file' ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    File (.json / .txt)
                  </Text>
                </Pressable>

                <Pressable
                  disabled={isImporting}
                  onPress={() => {
                    setImportMode('text')
                  }}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2 ${importMode === 'text' ? 'bg-surface' : ''}`}
                >
                  <FileTextIcon color={importMode === 'text' ? primary : muted} size={16} />
                  <Text
                    className={`text-xs font-bold ${importMode === 'text' ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    Paste Text
                  </Text>
                </Pressable>
              </View>

              {/* File Mode */}
              {importMode === 'file' ? (
                <View className="gap-3">
                  <Pressable
                    disabled={isImporting}
                    onPress={() => {
                      void handlePickFile()
                    }}
                    className="items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 active:opacity-75"
                  >
                    <UploadIcon color={primary} size={32} />
                    <Text className="text-sm font-bold text-foreground">
                      {selectedFile ? 'Change File' : 'Select .json or .txt File'}
                    </Text>
                    <Text className="text-xs text-muted-foreground text-center">
                      Tap here to choose a JSON backup or shared deck from your device.
                    </Text>
                  </Pressable>

                  {selectedFile && (
                    <View className="flex-row items-center justify-between rounded-xl border border-border bg-background p-3">
                      <View className="flex-1 min-w-0">
                        <Text numberOfLines={1} className="text-xs font-bold text-foreground">
                          {`📄 ${selectedFile.name}`}
                        </Text>
                        {selectedFile.size !== undefined && (
                          <Text className="text-[10px] text-muted-foreground">
                            {`${(selectedFile.size / 1024).toFixed(1)} KB`}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                /* Text Paste Mode */
                <View className="gap-1.5">
                  <Text className="text-xs text-muted-foreground">
                    Paste the JSON data of the sets and cards:
                  </Text>
                  <TextInput
                    value={jsonText}
                    onChangeText={(val) => {
                      setSelectedFile(null)
                      setJsonText(val)
                    }}
                    placeholder="Paste JSON content here..."
                    placeholderTextColor={muted}
                    multiline
                    textAlignVertical="top"
                    editable={!isImporting}
                    className="h-32 rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground"
                  />
                </View>
              )}

              {/* Validation & Preview Card */}
              {parsedResult !== null && (
                <View className="gap-2">
                  {parsedResult.success ? (
                    <View className="gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-3.5">
                      <Text className="text-sm font-bold text-primary">
                        {`✨ Ready to import ${String(parsedResult.data.sets.length)} ${parsedResult.data.sets.length === 1 ? 'set' : 'sets'} (${String(parsedResult.data.totalCards)} cards total)`}
                      </Text>
                      <View className="max-h-24 gap-1">
                        <ScrollView nestedScrollEnabled>
                          {parsedResult.data.sets.map((s, idx) => (
                            <Text
                              key={idx}
                              numberOfLines={1}
                              className="text-xs font-medium text-foreground"
                            >
                              {`• ${s.title} (${String(s.cards.length)} cards)`}
                            </Text>
                          ))}
                        </ScrollView>
                      </View>
                    </View>
                  ) : (
                    <View className="rounded-2xl border border-warning/30 bg-warning/10 p-3">
                      <Text className="text-xs font-semibold text-warning">
                        {`⚠️ ${parsedResult.error}`}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {isImporting && (
                <View className="items-center gap-2 py-2">
                  <ActivityIndicator />
                  <Text className="text-xs font-medium text-muted-foreground">
                    {importProgress}
                  </Text>
                </View>
              )}

              <View className="flex-row justify-end gap-3 pt-2">
                <Button
                  label="Close"
                  variant="ghost"
                  disabled={isImporting}
                  onPress={() => {
                    setImportModalVisible(false)
                  }}
                />
                <Button
                  label={isImporting ? 'Importing…' : 'Import to Library'}
                  disabled={!parsedResult?.success || isImporting}
                  loading={isImporting}
                  onPress={() => {
                    void handleStartImport()
                  }}
                />
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
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
