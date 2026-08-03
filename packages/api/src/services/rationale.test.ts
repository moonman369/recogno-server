import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateText = vi.hoisted(() => vi.fn());

vi.mock('@recogno/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@recogno/shared')>();
  return { ...actual, generateText };
});

const { FALLBACK_VERDICT, judgeRationale, parseRationaleVerdict } = await import('./rationale.js');

const input = {
  statement: 'Return the minimum eating speed.',
  constraints: '1 <= piles.length <= 10^4. 1 <= piles[i] <= 10^9.',
  actualPatternName: 'Binary Search on Answer',
  guessedPatternName: 'Greedy',
  rationaleText: 'The answer space is huge but feasibility is monotone in k.',
};

const geminiSaying = (text: string) => ({ text, model: 'gemini-flash-latest' });

describe('parseRationaleVerdict', () => {
  it('reads a bare one-word answer', () => {
    expect(parseRationaleVerdict('yes')).toBe('yes');
    expect(parseRationaleVerdict('no')).toBe('no');
    expect(parseRationaleVerdict('partial')).toBe('partial');
  });

  it('is case and whitespace insensitive', () => {
    expect(parseRationaleVerdict('  YES\n')).toBe('yes');
    expect(parseRationaleVerdict('Partial.')).toBe('partial');
  });

  it('prefers partial when the model hedges', () => {
    // "Partially yes" must not be read as a clean pass.
    expect(parseRationaleVerdict('Partially yes')).toBe('partial');
    expect(parseRationaleVerdict('yes, partially')).toBe('partial');
  });

  it('does not match a word that merely contains a verdict', () => {
    expect(parseRationaleVerdict('nonsense')).toBeUndefined();
    expect(parseRationaleVerdict('eyes')).toBeUndefined();
  });

  it('returns undefined when there is no verdict at all', () => {
    expect(parseRationaleVerdict('I cannot help with that.')).toBeUndefined();
    expect(parseRationaleVerdict('')).toBeUndefined();
  });
});

describe('judgeRationale', () => {
  beforeEach(() => {
    generateText.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the parsed verdict and marks it judged', async () => {
    generateText.mockResolvedValue(geminiSaying('yes'));

    await expect(judgeRationale(input)).resolves.toEqual({ verdict: 'yes', judged: true });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('sends the constraints and both pattern names in the prompt', async () => {
    generateText.mockResolvedValue(geminiSaying('partial'));

    await judgeRationale(input);

    const prompt = String(generateText.mock.calls[0]?.[0]?.prompt);
    expect(prompt).toContain(input.constraints);
    expect(prompt).toContain(input.rationaleText);
    expect(prompt).toContain('Binary Search on Answer');
    expect(prompt).toContain('Greedy');
  });

  it('falls back neutrally when the response cannot be parsed', async () => {
    generateText.mockResolvedValue(geminiSaying('I am not sure about this one.'));

    await expect(judgeRationale(input)).resolves.toEqual({
      verdict: FALLBACK_VERDICT,
      judged: false,
    });
  });

  it('falls back neutrally when Gemini throws, rather than failing the attempt', async () => {
    generateText.mockRejectedValue(new Error('503 model overloaded'));

    await expect(judgeRationale(input)).resolves.toEqual({
      verdict: FALLBACK_VERDICT,
      judged: false,
    });
  });
});
