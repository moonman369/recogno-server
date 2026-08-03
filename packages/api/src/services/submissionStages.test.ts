/**
 * Which pipeline stages a submission gets. The rule matters because the client
 * renders exactly these — a stage that does no work must not appear.
 */

import { describe, expect, it } from 'vitest';
import { needsSourceResolution } from './submissions.js';

describe('needsSourceResolution', () => {
  it('is true for a link with nothing fetched yet', () => {
    expect(needsSourceResolution({ source: 'link', statement: null })).toBe(true);
  });

  it('is true for a slug with nothing resolved yet', () => {
    expect(needsSourceResolution({ source: 'slug', statement: null })).toBe(true);
  });

  it('is false for free text, which is its own statement', () => {
    expect(needsSourceResolution({ source: 'text', statement: 'Given an array...' })).toBe(false);
    // Even with no statement there is nothing to fetch for free text.
    expect(needsSourceResolution({ source: 'text', statement: null })).toBe(false);
  });

  it('is false once a link has already been resolved', () => {
    // A repeat attempt must not re-report work that already happened.
    expect(needsSourceResolution({ source: 'link', statement: 'Given an array...' })).toBe(false);
  });

  it('is false for curated problems, which arrive complete', () => {
    expect(needsSourceResolution({ source: 'curated', statement: 'Given an array...' })).toBe(
      false,
    );
  });

  it('retries a link whose earlier resolve produced only whitespace', () => {
    expect(needsSourceResolution({ source: 'link', statement: '   ' })).toBe(true);
  });
});
