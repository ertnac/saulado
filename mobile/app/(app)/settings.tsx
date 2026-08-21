import { useEffect, type ReactElement } from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import {
  BLANK_WIDTH_MODES,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  NEW_CARDS_PER_DAY_MAX,
  NEW_CARDS_PER_DAY_MIN,
  type BlankWidthMode,
  type UpdateSettingsRequest,
} from '@saulado/shared'
import { Card } from '../../components/card'
import {
  ChoiceSetting,
  NumberSetting,
  Section,
  TimezoneSetting,
  Toggle,
} from '../../components/settings-controls'
import { useSettings, useUpdateSettings } from '../../hooks/settings'
import { useTheme, useThemeStore } from '../../stores/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Settings — a port of `frontend/src/features/account/SettingsPage.tsx`.
 *
 * Every control saves on change rather than through a Save button. These are
 * independent preferences, not a form with a transaction — batching them behind a
 * submit means a user who toggles one thing and leaves the screen loses it, and
 * "did that save?" is a question a settings screen should never raise. Each patch
 * is optimistic, so the control moves immediately and a failure rolls it back.
 *
 * The web reports that failure with a toast. There is none here, so it is an
 * `Alert` — rung 4 of the ladder, the platform's own dialog, rather than adding a
 * toast library for one message.
 */

const BLANK_WIDTH_LABELS: Record<BlankWidthMode, string> = {
  fixed: 'Fixed',
  proportional: 'Proportional',
}

export default function SettingsScreen(): ReactElement {
  const insets = useSafeAreaInsets()
  const { data, isPending, isError } = useSettings()
  const update = useUpdateSettings()
  const theme = useTheme()
  const hydrated = useThemeStore((s) => s.hydrated)
  const stored = useThemeStore((s) => s.stored)

  const settings = data?.settings

  /**
   * Seeds this device's theme from the server, once, and only if the device has
   * never been told otherwise.
   *
   * The two sources genuinely disagree in shape: the store has three states and
   * lives in AsyncStorage, the server has a `darkMode` boolean shared across
   * devices. Rather than force one to be a lie, the device-local choice wins where
   * it exists — a user who set dark on their phone did so *about their phone* —
   * and the server fills in a device with no opinion yet.
   *
   * `hydrated` is the guard the web does not need: before the AsyncStorage read
   * answers, `stored === null` means "not known yet" rather than "nothing stored",
   * and seeding in that window would clobber the choice about to arrive.
   */
  useEffect(() => {
    if (!settings) return
    if (!hydrated || stored !== null) return
    theme.setTheme(settings.darkMode ? 'dark' : 'light')
  }, [settings, hydrated, stored, theme])

  function save(patch: UpdateSettingsRequest, extra: { onSuccess?: () => void } = {}): void {
    update.mutate(patch, {
      onSuccess: () => {
        extra.onSuccess?.()
      },
      onError: () => {
        Alert.alert('Not saved', 'That change could not be saved.')
      },
    })
  }

  /**
   * The palette follows the server's acceptance, not the switch's.
   *
   * Flipping the switch is instant (optimistic cache). Recolouring the app waits
   * for the round trip: if the save is rejected, both the switch and the screen
   * stay where they were, so this device never drifts from what the server says.
   */
  function onDarkModeChange(darkMode: boolean): void {
    save(
      { darkMode },
      {
        onSuccess: () => {
          theme.setTheme(darkMode ? 'dark' : 'light')
        },
      },
    )
  }

  if (isPending) {
    return (
      <View className="flex-1 bg-background p-5">
        <Card tone="muted">
          <Text className="text-sm text-muted-foreground">Loading your settings…</Text>
        </Card>
      </View>
    )
  }

  if (isError || !settings) {
    return (
      <View className="flex-1 bg-background p-5">
        <Card tone="dashed">
          <Text className="font-medium text-foreground">Settings could not be loaded</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Check your connection and try again.
          </Text>
        </Card>
      </View>
    )
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-5"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 96, 128) }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text className="text-sm text-muted-foreground">Changes save as you make them.</Text>
      </View>

      <Section title="Appearance">
        <Toggle
          label="Dark mode"
          hint="Saved to your account; new devices start from this choice."
          value={settings.darkMode}
          onChange={onDarkModeChange}
        />
      </Section>

      <Section title="Study">
        <NumberSetting
          label="Daily goal"
          hint="Reviews per day. Drives the progress ring and your streak."
          value={settings.dailyGoal}
          min={DAILY_GOAL_MIN}
          max={DAILY_GOAL_MAX}
          onCommit={(dailyGoal) => {
            save({ dailyGoal })
          }}
        />

        <NumberSetting
          label="New cards per day"
          hint="How many unseen cards a session will introduce."
          value={settings.newCardsPerDay}
          min={NEW_CARDS_PER_DAY_MIN}
          max={NEW_CARDS_PER_DAY_MAX}
          onCommit={(newCardsPerDay) => {
            save({ newCardsPerDay })
          }}
        />

        <TimezoneSetting
          value={settings.timezone}
          onCommit={(timezone) => {
            save({ timezone })
          }}
        />
      </Section>

      <Section title="Answers">
        <Toggle
          label="Typo tolerance"
          hint="Accept an answer that is one or two characters off."
          value={settings.typoTolerance}
          onChange={(typoTolerance) => {
            save({ typoTolerance })
          }}
        />

        <ChoiceSetting
          label="Blank width"
          hint="Fixed keeps every blank the same size, so the gap cannot hint at the answer's length."
          value={settings.blankWidthMode}
          options={BLANK_WIDTH_MODES}
          labels={BLANK_WIDTH_LABELS}
          onChange={(blankWidthMode) => {
            save({ blankWidthMode })
          }}
        />
      </Section>

      <Section title="Notifications">
        <Toggle
          label="Study reminders"
          // Honest about the state of the feature. A toggle that claims to send
          // reminders and sends none is worse than one that says it is saved for
          // later — the user stops trusting the rest of the screen.
          hint="Saved with your account. Delivery is not built yet, so nothing is sent."
          value={settings.notificationsEnabled}
          onChange={(notificationsEnabled) => {
            save({ notificationsEnabled })
          }}
        />
      </Section>
    </ScrollView>
  )
}
