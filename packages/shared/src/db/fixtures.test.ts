/**
 * Structural checks on the curated bank. Every fixture is hand-written, so the
 * failure modes are typos: a pattern slug that no longer exists, a duplicate
 * problem slug, a tell that says nothing.
 */

import { describe, expect, it } from 'vitest';
import { systemDeckSlugForPattern } from '../domain/decks.js';
import { isPatternSlug, PATTERN_CATEGORIES } from '../domain/patterns.js';
import { PROBLEM_FIXTURES } from './fixtures.js';

describe('the curated bank', () => {
  it('has unique problem slugs', () => {
    const slugs = PROBLEM_FIXTURES.map((f) => f.slug);
    const duplicates = slugs.filter((slug, i) => slugs.indexOf(slug) !== i);
    expect(duplicates).toEqual([]);
  });

  it('references only real patterns', () => {
    for (const fixture of PROBLEM_FIXTURES) {
      expect(isPatternSlug(fixture.patternSlug), `${fixture.slug} -> ${fixture.patternSlug}`).toBe(
        true,
      );
      for (const slug of fixture.alsoAcceptedPatternSlugs ?? []) {
        expect(isPatternSlug(slug), `${fixture.slug} also accepts ${slug}`).toBe(true);
      }
    }
  });

  it('never lists the primary pattern again as an alternative', () => {
    for (const fixture of PROBLEM_FIXTURES) {
      expect(fixture.alsoAcceptedPatternSlugs ?? [], fixture.slug).not.toContain(
        fixture.patternSlug,
      );
    }
  });

  it('resolves every fixture to a system deck', () => {
    for (const fixture of PROBLEM_FIXTURES) {
      expect(() => systemDeckSlugForPattern(fixture.patternSlug), fixture.slug).not.toThrow();
    }
  });

  it('gives every fixture a statement, constraints, a source and a real tell', () => {
    for (const fixture of PROBLEM_FIXTURES) {
      expect(fixture.title.length, fixture.slug).toBeGreaterThan(2);
      expect(fixture.statement.length, fixture.slug).toBeGreaterThan(40);
      expect(fixture.constraints.length, fixture.slug).toBeGreaterThan(10);
      expect(fixture.sourceUrl, fixture.slug).toMatch(/^https:\/\//);
      // A tell that is one line is a label, not an explanation.
      expect(fixture.tell.length, `${fixture.slug} tell is too thin`).toBeGreaterThan(120);
    }
  });

  it('uses a slug that matches the source URL where one is derivable', () => {
    // `three-sum` predates this check and is referenced by live rows, so it is
    // grandfathered rather than renamed to LeetCode's `3sum`.
    const grandfathered = new Set(['three-sum']);

    for (const fixture of PROBLEM_FIXTURES) {
      if (grandfathered.has(fixture.slug)) continue;
      const match = fixture.sourceUrl.match(/\/problems\/([^/]+)/);
      if (!match?.[1]) continue;
      expect(fixture.slug, `${fixture.slug} disagrees with its URL`).toBe(match[1]);
    }
  });

  it('covers a broad spread of categories rather than clustering', () => {
    const categories = new Set(
      PROBLEM_FIXTURES.map((f) => systemDeckSlugForPattern(f.patternSlug)),
    );
    // Every deck a learner might open should have something in it.
    expect(categories.size).toBeGreaterThanOrEqual(12);
  });

  it('spans all three difficulties', () => {
    const difficulties = new Set(PROBLEM_FIXTURES.map((f) => f.difficulty));
    expect([...difficulties].sort()).toEqual(['easy', 'hard', 'medium']);
  });

  it('declares only categories the taxonomy knows about', () => {
    // Guards against a deck slug drifting away from its category.
    expect(PATTERN_CATEGORIES.length).toBeGreaterThan(0);
    for (const fixture of PROBLEM_FIXTURES) {
      expect(typeof systemDeckSlugForPattern(fixture.patternSlug)).toBe('string');
    }
  });
});
