/**
 * Transactional email over Resend's HTTP API.
 *
 * Plain `fetch` rather than an SDK, matching how `routes/googleAuth.ts` already
 * talks to Google: one POST, no dependency, nothing to keep upgraded.
 *
 * Delivery is best-effort by design. A provider outage must not turn "your
 * account was created" into a 500 — the caller has already committed the
 * database write by the time we get here, and the user can always ask for
 * another link.
 */

import { createLogger, env, isEmailConfigured, isProduction } from '@recogno/shared';

const log = createLogger('mailer');

const RESEND_SEND_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

export interface OutboundEmail {
  to: string;
  subject: string;
  /** Plain text, sent as-is. Kept separate so nothing user-supplied is ever interpolated into HTML. */
  text: string;
}

/**
 * Returns true only when the provider accepted the message. Callers are
 * expected to ignore that and answer the request the same way regardless:
 * whether an address exists is not something the response should reveal.
 */
export async function sendEmail(message: OutboundEmail): Promise<boolean> {
  if (!isEmailConfigured || !env.RESEND_API_KEY) {
    // Outside production the body carries the link, so local development needs
    // no mail provider — read it off the console and paste it in.
    log.warn(
      { to: message.to, subject: message.subject, ...(isProduction ? {} : { body: message.text }) },
      'RESEND_API_KEY is unset; email was not sent',
    );
    return false;
  }

  try {
    const response = await fetch(RESEND_SEND_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      // The body explains far more than the status; it is provider output, so
      // it goes to the log and never to the client.
      log.error(
        { status: response.status, detail: await response.text().catch(() => undefined) },
        'Resend rejected the message',
      );
      return false;
    }

    log.info({ to: message.to, subject: message.subject }, 'Sent an email');
    return true;
  } catch (error) {
    log.error({ err: error }, 'Could not reach Resend');
    return false;
  }
}

/** Builds a frontend URL with the token attached, e.g. `<APP_BASE_URL>/reset-password?token=…`. */
export function appLink(path: string, token: string): string {
  const url = new URL(path, env.APP_BASE_URL);
  url.searchParams.set('token', token);
  return url.toString();
}
