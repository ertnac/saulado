import { env } from '../config/env.js'

/**
 * Email delivery.
 *
 * The plan calls for Resend or Postmark. Both require an account, a verified
 * domain, and an API key before a single reset email sends — which would make
 * password reset the one Phase 2 feature that cannot be developed or tested
 * without external provisioning.
 *
 * So delivery is an interface with two implementations. The default writes the
 * message to the server log, including the reset link, and the whole flow works
 * end to end locally with no account anywhere. Setting `RESEND_API_KEY` swaps in
 * real delivery with no code change.
 *
 * The seam is worth keeping even after a provider is wired: tests assert against
 * the recorded outbox instead of mocking `fetch`.
 */

export interface EmailMessage {
  to: string
  subject: string
  /** Plain text. Reset mail is deliberately text-only — see buildResetEmail. */
  text: string
}

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<void>
}

/**
 * Logs instead of sending. The default.
 *
 * Prints the full body so a developer can copy the reset link straight out of
 * the terminal.
 */
export class LoggingEmailProvider implements EmailProvider {
  readonly name = 'logging'

  /** Retained so tests can assert what would have been sent. */
  readonly outbox: EmailMessage[] = []

  send(message: EmailMessage): Promise<void> {
    this.outbox.push(message)

    if (!env.isTest) {
      console.info(
        [
          '',
          '─── email (not actually sent) ──────────────────────────────',
          `to:      ${message.to}`,
          `subject: ${message.subject}`,
          '',
          message.text,
          '────────────────────────────────────────────────────────────',
          '',
        ].join('\n'),
      )
    }

    return Promise.resolve()
  }
}

/** Real delivery via Resend's HTTP API. No SDK — it is one POST. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend'

  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    })

    if (!res.ok) {
      // Surfaced to the caller, which swallows it. A provider outage must not
      // turn into an error response that tells an attacker the address exists.
      throw new Error(`Resend returned ${String(res.status)}: ${await res.text()}`)
    }
  }
}

export const emailProvider: EmailProvider = env.RESEND_API_KEY
  ? new ResendEmailProvider(env.RESEND_API_KEY)
  : new LoggingEmailProvider()

/**
 * Password reset message.
 *
 * Plain text, no HTML. A reset link in an HTML email is the exact shape of a
 * phishing email, and teaching users to click styled buttons in mail claiming to
 * be from us is training we do not want to do. Text also renders identically
 * everywhere.
 *
 * The link carries the raw token; only its hash is in the database.
 */
export function buildResetEmail(to: string, token: string): EmailMessage {
  const url = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`
  const minutes = env.RESET_TOKEN_TTL_MINUTES

  return {
    to,
    subject: 'Reset your Saulado password',
    text: [
      'Someone asked to reset the password for this Saulado account.',
      '',
      'To choose a new one, open this link:',
      url,
      '',
      `The link works once and expires in ${String(minutes)} minutes.`,
      '',
      'If this was not you, no action is needed — your password has not changed.',
    ].join('\n'),
  }
}

/**
 * Confirmation for a requested email change, sent **to the new address**.
 *
 * Sending it there rather than to the current one is the entire point: clicking
 * the link proves the requester can read the new mailbox, which is what makes a
 * mistyped address a harmless dead end instead of a lost account.
 */
export function buildEmailChangeEmail(to: string, token: string): EmailMessage {
  const base = env.APP_URL.replace(/\/$/, '')
  const url = `${base}/confirm-email?token=${encodeURIComponent(token)}`
  const hours = Math.round(env.EMAIL_CHANGE_TTL_MINUTES / 60)

  return {
    to,
    subject: 'Confirm your new Saulado email address',
    text: [
      'This address was given as the new email for a Saulado account.',
      '',
      'To finish the change, open this link:',
      url,
      '',
      `The link works once and expires in ${String(hours)} hours.`,
      '',
      'Until then nothing has changed, and the account still uses its old address.',
      '',
      'If you were not expecting this, ignore it — without this link the change',
      'never takes effect, and whoever asked for it cannot sign in as you.',
    ].join('\n'),
  }
}

/**
 * Notification that the address changed, sent **to the old address**.
 *
 * The one message in this file that carries no link and asks for no action. It
 * exists so a change made by someone who should not have made it is visible to
 * the real owner while the old mailbox still reaches them — the last moment at
 * which they can react. Naming the new address is deliberate: "your email
 * changed" without saying to what leaves nothing to report.
 */
export function buildEmailChangedNotice(to: string, newEmail: string): EmailMessage {
  return {
    to,
    subject: 'Your Saulado email address was changed',
    text: [
      'The email address on this Saulado account was just changed to:',
      `  ${newEmail}`,
      '',
      'Sign-in and password resets now use that address. This one no longer',
      'reaches the account.',
      '',
      'If you did not do this, contact support now — while this mailbox is still',
      'the one on record with us.',
    ].join('\n'),
  }
}
