import { describe, expect, it } from 'vitest';
import {
  deriveProblemIdentity,
  detectProblemSource,
  slugFromUrl,
  slugify,
  titleFromSlug,
} from './problemInput.js';

describe('detectProblemSource', () => {
  it('recognises links', () => {
    expect(detectProblemSource('https://leetcode.com/problems/two-sum/')).toBe('link');
    expect(detectProblemSource('http://example.com/x')).toBe('link');
  });

  it('recognises bare slugs', () => {
    expect(detectProblemSource('two-sum')).toBe('slug');
    expect(detectProblemSource('longest-substring-without-repeating-characters')).toBe('slug');
  });

  it('treats anything with whitespace or punctuation as free text', () => {
    expect(detectProblemSource('Two Sum')).toBe('text');
    expect(detectProblemSource('find the k-th largest element, in O(n)')).toBe('text');
    expect(detectProblemSource('Given an array, return...')).toBe('text');
  });

  it('does not mistake a long slug-shaped essay for a slug', () => {
    expect(detectProblemSource(`${'a-'.repeat(60)}b`)).toBe('text');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Two Sum II')).toBe('two-sum-ii');
    expect(slugify('  Container With Most Water  ')).toBe('container-with-most-water');
  });

  it('strips punctuation and collapses separators', () => {
    expect(slugify('K-th Largest?! (Heap)')).toBe('k-th-largest-heap');
    expect(slugify('a___b')).toBe('a-b');
  });

  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('problem');
    expect(slugify('')).toBe('problem');
  });

  it('does not leave a trailing hyphen after truncation', () => {
    expect(slugify('x'.repeat(200))).not.toMatch(/-$/);
  });
});

describe('titleFromSlug', () => {
  it('title-cases words', () => {
    expect(titleFromSlug('two-sum')).toBe('Two Sum');
  });

  it('keeps roman numerals upper-case', () => {
    expect(titleFromSlug('max-consecutive-ones-iii')).toBe('Max Consecutive Ones III');
    expect(titleFromSlug('two-sum-ii')).toBe('Two Sum II');
  });
});

describe('slugFromUrl', () => {
  it('extracts the problem slug from a LeetCode URL', () => {
    expect(slugFromUrl('https://leetcode.com/problems/two-sum/')).toBe('two-sum');
  });

  it('skips sub-view segments', () => {
    expect(slugFromUrl('https://leetcode.com/problems/two-sum/description/')).toBe('two-sum');
    expect(slugFromUrl('https://leetcode.com/problems/two-sum/solutions')).toBe('two-sum');
  });

  it('keeps the contest number when the problem index alone is meaningless', () => {
    expect(slugFromUrl('https://codeforces.com/problemset/problem/1234/A')).toBe('1234-a');
  });

  it('returns undefined for input that is not a URL', () => {
    expect(slugFromUrl('two-sum')).toBeUndefined();
    expect(slugFromUrl('')).toBeUndefined();
  });
});

describe('deriveProblemIdentity', () => {
  it('derives title and slug from a link, leaving the statement unresolved', () => {
    const identity = deriveProblemIdentity('https://leetcode.com/problems/coin-change/');

    expect(identity).toMatchObject({
      source: 'link',
      slug: 'coin-change',
      title: 'Coin Change',
      sourceUrl: 'https://leetcode.com/problems/coin-change/',
      statement: null,
    });
  });

  it('derives a title from a bare slug', () => {
    expect(deriveProblemIdentity('rotting-oranges')).toMatchObject({
      source: 'slug',
      slug: 'rotting-oranges',
      title: 'Rotting Oranges',
      statement: null,
    });
  });

  it('stores free text as the statement and uses its first line as the title', () => {
    const identity = deriveProblemIdentity('Merge K sorted lists\nGiven k lists, merge them.');

    expect(identity.source).toBe('text');
    expect(identity.title).toBe('Merge K sorted lists');
    expect(identity.slug).toBe('merge-k-sorted-lists');
    expect(identity.statement).toBe('Merge K sorted lists\nGiven k lists, merge them.');
  });

  it('honours an explicit source over the detector', () => {
    // "two-sum" looks like a slug, but the caller says it is prose.
    expect(deriveProblemIdentity('two-sum', 'text').statement).toBe('two-sum');
  });

  it('never produces a null title', () => {
    expect(deriveProblemIdentity('   \n  ', 'text').title).toBe('Untitled problem');
  });
});
