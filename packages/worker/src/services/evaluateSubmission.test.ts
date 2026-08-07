import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateText = vi.hoisted(() => vi.fn());

vi.mock('@recogno/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@recogno/shared')>();
  return { ...actual, generateText };
});

const { evaluateSubmission } = await import('./evaluateSubmission.js');

const input = {
  problemTitle: 'Coin Change',
  problemStatement: 'Fewest coins to make an amount.',
  problemConstraints: '0 <= amount <= 10^4',
  noteText: 'Tried greedy first, it failed on arbitrary denominations, so I used a DP table.',
  solutionText: 'dp = [inf]*(amount+1); dp[0]=0; ...',
};

const geminiReturning = (payload: unknown, model = 'gemini-flash-latest') => ({
  text: typeof payload === 'string' ? payload : JSON.stringify(payload),
  model,
});

describe('evaluateSubmission', () => {
  beforeEach(() => {
    generateText.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the gradation and all three feedback fields', async () => {
    generateText.mockResolvedValue(
      geminiReturning({
        gradation: 'good-job',
        approachSummary: 'Used an unbounded knapsack table.',
        missed: 'Did not mention the -1 case.',
        optimizations: 'Iterate coins outermost for cache locality.',
      }),
    );

    await expect(evaluateSubmission(input)).resolves.toEqual({
      gradation: 'good-job',
      approachSummary: 'Used an unbounded knapsack table.',
      missed: 'Did not mention the -1 case.',
      optimizations: 'Iterate coins outermost for cache locality.',
      model: 'gemini-flash-latest',
    });
  });

  it('sends the note, the solution and the constraints to the model', async () => {
    generateText.mockResolvedValue(geminiReturning({ gradation: 'not-bad' }));

    await evaluateSubmission(input);

    const prompt = String(generateText.mock.calls[0]?.[0]?.prompt);
    expect(prompt).toContain(input.noteText);
    expect(prompt).toContain(input.solutionText);
    expect(prompt).toContain(input.problemConstraints);
    // Every tier must be described, or the model cannot calibrate.
    expect(prompt).toContain('try-again');
    expect(prompt).toContain('excellent');
  });

  it('requests JSON so the response needs no ad-hoc parsing', async () => {
    generateText.mockResolvedValue(geminiReturning({ gradation: 'excellent' }));

    await evaluateSubmission(input);

    expect(generateText.mock.calls[0]?.[0]).toMatchObject({ json: true, temperature: 0 });
  });

  it('tolerates a fenced JSON block', async () => {
    generateText.mockResolvedValue(geminiReturning('```json\n{"gradation":"needs-work"}\n```'));

    await expect(evaluateSubmission(input)).resolves.toMatchObject({ gradation: 'needs-work' });
  });

  it('omits missing context rather than sending an empty section', async () => {
    generateText.mockResolvedValue(geminiReturning({ gradation: 'not-bad' }));

    await evaluateSubmission({ ...input, problemStatement: null, problemConstraints: null });

    const prompt = String(generateText.mock.calls[0]?.[0]?.prompt);
    expect(prompt).not.toContain('STATEMENT:');
    expect(prompt).not.toContain('CONSTRAINTS:');
  });

  it('supplies neutral defaults for absent feedback fields', async () => {
    generateText.mockResolvedValue(geminiReturning({ gradation: 'excellent' }));

    await expect(evaluateSubmission(input)).resolves.toMatchObject({
      missed: 'Nothing significant.',
      optimizations: 'None.',
    });
  });

  it('throws on an unrecognised gradation rather than guessing one', async () => {
    generateText.mockResolvedValue(geminiReturning({ gradation: 'superb' }));

    // A fabricated grade would drive scheduling, so failing loudly is the point.
    await expect(evaluateSubmission(input)).rejects.toThrow(/unrecognised gradation/);
  });

  it('throws when the response is not JSON at all', async () => {
    generateText.mockResolvedValue(geminiReturning('I cannot help with that.'));

    await expect(evaluateSubmission(input)).rejects.toThrow(/no parseable JSON/);
  });

  it('propagates a transport failure', async () => {
    generateText.mockRejectedValue(new Error('503 model overloaded'));

    await expect(evaluateSubmission(input)).rejects.toThrow(/503/);
  });
});
