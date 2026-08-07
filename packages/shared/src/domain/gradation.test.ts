import { describe, expect, it } from 'vitest';
import {
  GRADATION_LABELS,
  GRADATION_SCORES,
  GRADATIONS,
  isGradation,
  parseGradation,
} from './gradation.js';

describe('gradation catalogue', () => {
  it('has a label and a score for every tier', () => {
    for (const gradation of GRADATIONS) {
      expect(GRADATION_LABELS[gradation]).toBeTruthy();
      expect(GRADATION_SCORES[gradation]).toBeTypeOf('number');
    }
  });

  it('orders scores strictly from worst to best', () => {
    const scores = GRADATIONS.map((g) => GRADATION_SCORES[g]);
    const sorted = [...scores].sort((a, b) => a - b);
    expect(scores).toEqual(sorted);
    expect(new Set(scores).size).toBe(scores.length);
  });

  it('keeps every score inside the 0..1 composite range', () => {
    for (const gradation of GRADATIONS) {
      expect(GRADATION_SCORES[gradation]).toBeGreaterThanOrEqual(0);
      expect(GRADATION_SCORES[gradation]).toBeLessThanOrEqual(1);
    }
  });
});

describe('isGradation', () => {
  it('accepts every canonical tier and nothing else', () => {
    for (const gradation of GRADATIONS) expect(isGradation(gradation)).toBe(true);
    expect(isGradation('great-job')).toBe(false);
    expect(isGradation('')).toBe(false);
  });
});

describe('parseGradation', () => {
  it('reads a bare tier', () => {
    expect(parseGradation('excellent')).toBe('excellent');
    expect(parseGradation('needs-work')).toBe('needs-work');
  });

  it('tolerates spacing, underscores and casing from the model', () => {
    expect(parseGradation('Good Job')).toBe('good-job');
    expect(parseGradation('TRY_AGAIN')).toBe('try-again');
    expect(parseGradation('  Not Bad  ')).toBe('not-bad');
  });

  it('finds the tier inside a JSON fragment', () => {
    expect(parseGradation('{"gradation": "not-bad"}')).toBe('not-bad');
  });

  it('returns undefined rather than guessing', () => {
    expect(parseGradation('unsure')).toBeUndefined();
    expect(parseGradation('')).toBeUndefined();
  });
});
