import { describe, expect, it } from 'vitest';
import {
  assertFetchableUrl,
  extractDescription,
  extractTitle,
  resolveFromSlug,
} from './problemSource.js';

describe('assertFetchableUrl', () => {
  it('accepts ordinary public URLs', () => {
    expect(assertFetchableUrl('https://leetcode.com/problems/two-sum/').hostname).toBe(
      'leetcode.com',
    );
    expect(assertFetchableUrl('http://example.com').protocol).toBe('http:');
  });

  it('rejects non-HTTP schemes', () => {
    expect(() => assertFetchableUrl('file:///etc/passwd')).toThrow(/non-HTTP/);
    expect(() => assertFetchableUrl('ftp://example.com')).toThrow(/non-HTTP/);
  });

  it('rejects loopback and internal hostnames', () => {
    expect(() => assertFetchableUrl('http://localhost:3000/x')).toThrow(/internal host/);
    expect(() => assertFetchableUrl('http://foo.local/x')).toThrow(/internal host/);
    expect(() => assertFetchableUrl('http://metadata.google.internal/')).toThrow(/internal host/);
  });

  it('rejects private and link-local IPv4 ranges', () => {
    for (const host of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.1',
      '172.16.5.4',
      '172.31.255.255',
      '169.254.169.254',
      '0.0.0.0',
    ]) {
      expect(() => assertFetchableUrl(`http://${host}/x`), `${host} should be blocked`).toThrow(
        /private address|internal host/,
      );
    }
  });

  it('still allows public addresses that merely look adjacent to private ones', () => {
    expect(() => assertFetchableUrl('http://172.32.0.1/x')).not.toThrow();
    expect(() => assertFetchableUrl('http://11.0.0.1/x')).not.toThrow();
  });

  it('rejects IPv6 loopback and unique-local addresses', () => {
    expect(() => assertFetchableUrl('http://[::1]/x')).toThrow(/internal host/);
    expect(() => assertFetchableUrl('http://[fd00::1]/x')).toThrow(/internal host/);
    expect(() => assertFetchableUrl('http://[fe80::1]/x')).toThrow(/internal host/);
  });

  it('rejects input that is not a URL at all', () => {
    expect(() => assertFetchableUrl('two-sum')).toThrow(/Not a valid URL/);
  });
});

describe('extractTitle', () => {
  it('reads the document title', () => {
    expect(extractTitle('<html><head><title>Coin Change</title></head></html>')).toBe(
      'Coin Change',
    );
  });

  it('strips the site suffix', () => {
    expect(extractTitle('<title>Two Sum - LeetCode</title>')).toBe('Two Sum');
    expect(extractTitle('<title>Problem A | Codeforces</title>')).toBe('Problem A');
  });

  it('decodes entities and collapses whitespace', () => {
    expect(extractTitle('<title>A &amp;  B\n  C</title>')).toBe('A & B C');
  });

  it('returns undefined when there is no usable title', () => {
    expect(extractTitle('<html><body>no head</body></html>')).toBeUndefined();
    expect(extractTitle('<title>   </title>')).toBeUndefined();
  });
});

describe('extractDescription', () => {
  it('prefers the og:description meta tag', () => {
    const html = `
      <meta property="og:description" content="Given an array of integers...">
      <meta name="description" content="fallback">`;
    expect(extractDescription(html)).toBe('Given an array of integers...');
  });

  it('falls back to the plain description meta tag', () => {
    expect(extractDescription('<meta name="description" content="A problem">')).toBe('A problem');
  });

  it('handles the reversed attribute order', () => {
    expect(extractDescription('<meta content="Reversed" name="description">')).toBe('Reversed');
  });

  it('returns undefined when absent', () => {
    expect(extractDescription('<html></html>')).toBeUndefined();
  });
});

describe('resolveFromSlug', () => {
  it('reuses a curated problem when the slug matches one', () => {
    const resolved = resolveFromSlug('two-sum', {
      title: 'Two Sum',
      statement: 'Given an array...',
      constraints: '1 <= n',
    });

    expect(resolved.title).toBe('Two Sum');
    expect(resolved.statement).toBe('Given an array...');
    expect(resolved.detail).toMatch(/curated bank/);
  });

  it('falls back to a slug-derived title when nothing matches', () => {
    const resolved = resolveFromSlug('merge-k-sorted-lists');

    expect(resolved.title).toBe('Merge K Sorted Lists');
    expect(resolved.statement).toBeUndefined();
    expect(resolved.detail).toMatch(/No matching curated problem/);
  });
});
