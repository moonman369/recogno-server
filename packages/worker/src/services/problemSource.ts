/**
 * Resolving a problem link or slug into something readable.
 *
 * Best-effort by design: a failed fetch must not cost the learner their
 * submission, because it is their note and solution being graded, not the
 * upstream page. The caller marks the stage failed and carries on.
 */

import { createLogger, slugify, titleFromSlug } from '@recogno/shared';

const log = createLogger('problem-source');

const FETCH_TIMEOUT_MS = 8_000;
/** Enough for <head>; problem pages put their metadata there. */
const MAX_BYTES = 512 * 1024;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

/**
 * Blocks the obvious SSRF targets. The user supplies this URL and the server
 * fetches it, so loopback, link-local and RFC1918 addresses are refused.
 *
 * Hostname-based, so it does not defend against DNS rebinding — a proxy with an
 * allowlist would be the answer if this ever fetches untrusted URLs at scale.
 */
export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Refusing to fetch non-HTTP URL (${url.protocol})`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local')) {
    throw new Error(`Refusing to fetch internal host "${hostname}"`);
  }

  // IPv6 loopback / unique-local / link-local.
  if (hostname === '::1' || /^f[cd][0-9a-f]{2}:/i.test(hostname) || /^fe80:/i.test(hostname)) {
    throw new Error(`Refusing to fetch internal host "${hostname}"`);
  }

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const isPrivate =
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254) ||
      a >= 224;
    if (isPrivate) {
      throw new Error(`Refusing to fetch private address "${hostname}"`);
    }
  }

  return url;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

/** Site suffixes like " - LeetCode" that add nothing to a stored title. */
function stripSiteSuffix(title: string): string {
  return title
    .replace(/\s*[|\-–—]\s*(LeetCode|Codeforces|HackerRank|AtCoder|CodeChef|GeeksforGeeks).*$/i, '')
    .trim();
}

export function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return undefined;
  const title = stripSiteSuffix(decodeEntities(match[1]).replace(/\s+/g, ' ').trim());
  return title.length > 0 ? title.slice(0, 200) : undefined;
}

export function extractDescription(html: string): string | undefined {
  const patterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i,
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const description = decodeEntities(match[1]).replace(/\s+/g, ' ').trim();
      if (description.length > 0) return description.slice(0, 4000);
    }
  }
  return undefined;
}

/** Reads at most `MAX_BYTES` so a huge or endless response cannot exhaust memory. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let total = 0;

  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return chunks.join('');
}

export interface ResolvedSource {
  title?: string;
  statement?: string;
  /** Human-readable note about what happened, surfaced as the stage detail. */
  detail: string;
}

/** Fetches a URL and pulls out whatever title and description it exposes. */
export async function resolveFromLink(rawUrl: string): Promise<ResolvedSource> {
  const url = assertFetchableUrl(rawUrl);

  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      // Some judges serve a stub to unknown agents.
      'user-agent': 'Mozilla/5.0 (compatible; RecognoBot/1.0; +https://github.com/recogno)',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Source responded ${response.status}`);
  }

  const html = await readCapped(response);
  const title = extractTitle(html);
  const statement = extractDescription(html);

  log.debug({ url: url.toString(), foundTitle: Boolean(title) }, 'Resolved link');

  const found = [title && 'title', statement && 'description'].filter(Boolean);

  return {
    ...(title ? { title } : {}),
    ...(statement ? { statement } : {}),
    detail:
      found.length > 0
        ? `Fetched ${found.join(' and ')} from ${url.hostname}`
        : `Fetched ${url.hostname} but found no usable metadata`,
  };
}

/**
 * A bare slug has nothing to fetch, but if the curated bank already contains it
 * we can reuse that statement instead of leaving the problem blank.
 */
export function resolveFromSlug(
  slug: string,
  curated?: { title: string; statement: string | null; constraints: string | null },
): ResolvedSource {
  if (curated) {
    return {
      title: curated.title,
      ...(curated.statement ? { statement: curated.statement } : {}),
      detail: 'Matched a problem already in the curated bank',
    };
  }

  return {
    title: titleFromSlug(slugify(slug)),
    detail: 'No matching curated problem; kept the slug-derived title',
  };
}
