/**
 * Normalising whatever the user typed into a storable problem identity.
 *
 * The API needs this synchronously — `problems.title` and `problems.slug` are
 * NOT NULL, so a row cannot wait for the worker to resolve anything. The worker
 * later overwrites the provisional values with whatever it actually fetched.
 */

import type { ProblemSource } from '../db/schema.js';

/** Path segments that describe a view of a problem rather than the problem. */
const NOISE_SEGMENTS = new Set([
  'description',
  'solutions',
  'submissions',
  'editorial',
  'discuss',
  'problems',
  'problem',
  'problemset',
  'contest',
  'task',
]);

const ROMAN_NUMERALS = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']);

/** A slug-shaped token: lowercase words joined by single hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    // Strip diacritics and anything that is not a word character or separator.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
    .replace(/-$/, '');

  return slug || 'problem';
}

/** `two-sum` -> `Two Sum`, keeping roman numerals upper-case. */
export function titleFromSlug(slug: string): string {
  const words = slug
    .split('-')
    .filter(Boolean)
    .map((word) =>
      ROMAN_NUMERALS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1),
    );

  return words.join(' ') || 'Untitled problem';
}

/**
 * Pulls the problem's own identifier out of a URL, skipping the path segments
 * that name a sub-view. Codeforces-style `/problemset/problem/1234/A` collapses
 * to `1234-a` rather than a useless `a`.
 */
export function slugFromUrl(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }

  const segments = url.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !NOISE_SEGMENTS.has(segment.toLowerCase()));

  if (segments.length === 0) return undefined;

  const last = segments[segments.length - 1] as string;
  const previous = segments[segments.length - 2];

  // A very short trailing segment is an index (problem "A" of contest 1234),
  // meaningless on its own.
  if (last.length <= 2 && previous) {
    return slugify(`${previous}-${last}`);
  }

  return slugify(last);
}

/**
 * Classifies free-form input. A bare slug and a one-line description are
 * genuinely ambiguous, so the tie-break is deliberately conservative: anything
 * with whitespace or punctuation is treated as prose.
 */
export function detectProblemSource(input: string): ProblemSource {
  const trimmed = input.trim();

  if (/^https?:\/\//i.test(trimmed)) return 'link';
  if (trimmed.length <= 80 && SLUG_PATTERN.test(trimmed)) return 'slug';
  return 'text';
}

export interface ProblemIdentity {
  source: ProblemSource;
  slug: string;
  title: string;
  sourceUrl: string | null;
  /** Free-text input is the statement; a link or slug has nothing to say yet. */
  statement: string | null;
}

/**
 * Provisional identity for a newly added problem. `source` may be forced when
 * the client knows better than the detector.
 */
export function deriveProblemIdentity(input: string, source?: ProblemSource): ProblemIdentity {
  const trimmed = input.trim();
  const resolved = source ?? detectProblemSource(trimmed);

  if (resolved === 'link') {
    const slug = slugFromUrl(trimmed) ?? slugify(trimmed);
    return {
      source: 'link',
      slug,
      title: titleFromSlug(slug),
      sourceUrl: trimmed,
      statement: null,
    };
  }

  if (resolved === 'slug') {
    const slug = slugify(trimmed);
    return { source: 'slug', slug, title: titleFromSlug(slug), sourceUrl: null, statement: null };
  }

  // Free text: the first line is the closest thing to a title we have.
  const firstLine = trimmed.split('\n')[0]?.trim() ?? '';
  const title = firstLine.length > 0 ? firstLine.slice(0, 120) : 'Untitled problem';

  return {
    source: 'text',
    slug: slugify(title),
    title,
    sourceUrl: null,
    statement: trimmed,
  };
}
