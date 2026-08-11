/**
 * Grades a learner's note + solution into one of the five gradations, with a
 * short account of their approach, what they missed, and what could be better.
 *
 * One Gemini call produces all four fields. Splitting it into "evaluate" then
 * "generate feedback" would be two round trips reporting one piece of work, and
 * the pipeline only surfaces stages that genuinely happen.
 */

import {
  createLogger,
  GRADATION_CRITERIA,
  GRADATIONS,
  type Gradation,
  generateText,
  parseGradation,
  parseJsonResponse,
} from '@recogno/shared';

const log = createLogger('evaluate-submission');

export interface EvaluationInput {
  problemTitle: string;
  problemStatement: string | null;
  problemConstraints: string | null;
  noteText: string;
  solutionText: string;
}

export interface EvaluationResult {
  gradation: Gradation;
  approachSummary: string;
  missed: string;
  optimizations: string;
  model: string;
}

interface RawEvaluation {
  gradation?: unknown;
  approachSummary?: unknown;
  missed?: unknown;
  optimizations?: unknown;
}

function buildPrompt(input: EvaluationInput): string {
  const criteria = GRADATIONS.map((g) => `- "${g}": ${GRADATION_CRITERIA[g]}`).join('\n');

  return [
    'You are grading one submission in a spaced-repetition trainer for data structures and algorithms.',
    'The learner recorded their approach, any issues they hit, and their solution.',
    '',
    'Grade the submission into exactly one of these gradations:',
    criteria,
    '',
    'Guidance:',
    '- Judge the approach and the reasoning, not the formatting or the language used.',
    '- The solution may be code, pseudocode or prose. Treat all three as equally valid.',
    '- If the problem statement is missing, grade what the note and solution reveal on their own',
    '  and do not penalise the learner for the missing context.',
    '- Grade correctness first and optimality second. A brute-force solution that actually solves',
    '  the problem is still a solution, and earns partial credit rather than a failing grade.',
    '  A working nested-loop answer to a problem whose optimum is two pointers, a sliding window,',
    '  a hash map or binary search belongs at "not-bad": the idea is sound, the complexity is not.',
    '- Reserve "try-again" and "needs-work" for reasoning that is absent, broken, or solves a',
    '  different problem — not for reasoning that merely runs slower than the ideal.',
    '- Missing the intended pattern is an optimization, not a failure. Name the better approach',
    '  and its complexity under "optimizations", and treat it under "missed" as a gap in',
    '  efficiency rather than a wrong answer.',
    '- The exception is scale. If the stated constraints mean the submitted complexity would not',
    '  finish in time, that is a genuine defect in the solution and does grade lower.',
    '- Be honest. Inflated grades make the scheduler show this problem too rarely.',
    '',
    `PROBLEM: ${input.problemTitle}`,
    input.problemStatement ? `\nSTATEMENT:\n${input.problemStatement}` : '',
    input.problemConstraints ? `\nCONSTRAINTS:\n${input.problemConstraints}` : '',
    '',
    `LEARNER'S NOTE (approach and issues faced):\n${input.noteText}`,
    '',
    `LEARNER'S SOLUTION:\n${input.solutionText}`,
    '',
    'Respond with JSON only, in exactly this shape:',
    '{',
    '  "gradation": "one of the gradation keys above",',
    '  "approachSummary": "2-3 sentences describing what the learner actually did",',
    '  "missed": "what they missed or got wrong; the exact string \\"Nothing significant.\\" if genuinely nothing",',
    '  "optimizations": "concrete improvements, or the exact string \\"None.\\" if it is already optimal"',
    '}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function asText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Throws rather than falling back to a neutral grade. Unlike the drill's
 * rationale score — one axis of three — this gradation drives scheduling
 * outright, so a guessed value would quietly corrupt the learner's queue. A
 * failed submission stays reviewable and the user can grade it themselves.
 */
export async function evaluateSubmission(input: EvaluationInput): Promise<EvaluationResult> {
  const { text, model } = await generateText({
    prompt: buildPrompt(input),
    json: true,
    temperature: 0,
    maxOutputTokens: 2048,
  });

  const parsed = parseJsonResponse<RawEvaluation>(text);
  if (!parsed) {
    throw new Error('Gemini returned no parseable JSON');
  }

  const gradation =
    typeof parsed.gradation === 'string' ? parseGradation(parsed.gradation) : undefined;

  if (!gradation) {
    log.warn({ raw: parsed.gradation }, 'Gemini returned an unrecognised gradation');
    throw new Error(`Gemini returned an unrecognised gradation: ${String(parsed.gradation)}`);
  }

  return {
    gradation,
    approachSummary: asText(parsed.approachSummary, 'No summary was produced.'),
    missed: asText(parsed.missed, 'Nothing significant.'),
    optimizations: asText(parsed.optimizations, 'None.'),
    model,
  };
}
