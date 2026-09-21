import { useEffect, type ReactElement } from 'react'
import {
  BLANK_WIDTH_MODES,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  NEW_CARDS_PER_DAY_MAX,
  NEW_CARDS_PER_DAY_MIN,
  type BlankWidthMode,
  type UpdateSettingsRequest,
} from '@saulado/shared'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { SauladoLoader } from '@/components/ui/saulado-logo'
import { PageHeader } from '@/components/layout/PageHeader'
import { hasStoredTheme, useTheme } from '@/hooks/useTheme'
import { toast } from '@/stores/toast'
import { useSettings, useUpdateSettings } from './queries'
import { Field, NumberSetting, Section, Toggle, TimezoneSetting } from './SettingsControls'

/**
 * Settings (plan §6.4).
 *
 * Every control saves on change rather than through a Save button. These are
 * independent preferences, not a form with a transaction — batching them behind
 * a submit means a user who toggles one thing and navigates away loses it, and
 * "did that save?" is a question a settings page should never raise. Each patch
 * is optimistic, so the control moves immediately and a failure rolls it back
 * with a toast saying so.
 */
export function SettingsPage(): ReactElement {
  const { data, isPending, isError } = useSettings()
  const update = useUpdateSettings()
  const theme = useTheme()

  const settings = data?.settings

  /**
   * Seeds this device's theme from the server, once, and only if the device has
   * never been told otherwise.
   *
   * The two sources genuinely disagree in shape: `useTheme` has three states and
   * lives in localStorage, the server has a `darkMode` boolean shared across
   * devices. Rather than force one to be a lie, the device-local choice wins
   * where it exists — a user who set dark on their phone did so *about their
   * phone* — and the server fills in a device that has no opinion yet.
   */
  useEffect(() => {
    if (!settings) return
    if (hasStoredTheme()) return
    theme.setTheme(settings.darkMode ? 'dark' : 'light')
  }, [settings, theme])

  function save(patch: UpdateSettingsRequest, extra: { onSuccess?: () => void } = {}): void {
    update.mutate(patch, {
      onSuccess: () => {
        extra.onSuccess?.()
      },
      onError: () => {
        toast.error('That change could not be saved.')
      },
    })
  }

  /**
   * The document class follows the server's acceptance, not the toggle's.
   *
   * Flipping the switch is instant (optimistic cache). Changing the actual theme
   * waits for the round trip: if the save is rejected, both the switch and the
   * page stay where they were, so this device never drifts from what the server
   * says. The alternative — recolouring the page optimistically and rolling back
   * — would leave the page dark for a preference that was never stored.
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

  if (isPending) return <SettingsSkeleton />

  if (isError || !settings) {
    return (
      <Card tone="dashed" className="p-6">
        <h1 className="text-lg font-semibold">Settings could not be loaded</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Check your connection and reload the page.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={
          <>
            Changes save as you make them.{' '}
            <Link to="/account" className="font-medium text-foreground underline">
              Account and data
            </Link>
          </>
        }
        className="mb-0"
      />

      <Section title="Appearance">
        <Toggle
          label="Dark mode"
          hint="Saved to your account; new devices start from this choice."
          checked={settings.darkMode}
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
          checked={settings.typoTolerance}
          onChange={(typoTolerance) => {
            save({ typoTolerance })
          }}
        />

        <Field
          label="Blank width"
          hint="Fixed keeps every blank the same size, so the gap cannot hint at the answer's length."
        >
          <Select
            value={settings.blankWidthMode}
            onChange={(event) => {
              save({ blankWidthMode: event.target.value as BlankWidthMode })
            }}
            className="w-full capitalize"
            aria-label="Blank width"
          >
            {BLANK_WIDTH_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Notifications">
        <Toggle
          label="Study reminders"
          // Honest about the state of the feature. A toggle that claims to send
          // reminders and sends none is worse than one that says it is saved for
          // later — the user stops trusting the rest of the page.
          hint="Saved with your account. Delivery is not built yet, so nothing is sent."
          checked={settings.notificationsEnabled}
          onChange={(notificationsEnabled) => {
            save({ notificationsEnabled })
          }}
        />
      </Section>
    </div>
  )
}

function SettingsSkeleton(): ReactElement {
  return (
    <div className="py-12" aria-busy="true" aria-label="Loading settings">
      <SauladoLoader
        size={84}
        starAnimation="star-gyro"
        showBrand
        showTagline
        message="Loading your settings"
      />
    </div>
  )
}
