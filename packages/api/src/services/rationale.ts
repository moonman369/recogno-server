/**
 * Judges whether a learner's rationale cites a real, constraint-grounded tell
 * rather than pattern-matching on the title or guessing. One Gemini call per
 * attempt — deliberately uncached, since the rationale text is always new.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLogger, env } from '@recogno/shared';
import type { RationaleVerdict } from '../drill/scoring.js';

const log = createLogger('rationale');

/**
 * A floating alias rather than a pinned version: Google retires specific model
 * IDs for new API keys, which silently degrades every attempt to the fallback
 * verdict. Override with GEMINI_MODEL to pin one deliberately.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';

/** Used when Gemini is unreachable — neutral, and flagged as unjudged in the response. */
export const FALLBACK_VERDICT: RationaleVerdict = 'partial';

let client: GoogleGenerativeAI | undefined;

function getClient(): GoogleGenerativeAI {
  client ??= new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return client;
}

export interface JudgeRationaleInput {
  statement: string;
  constraints: string;
  actualPatternName: string;
  guessedPatternName: string;
  rationaleText: string;
}

export interface JudgeRationaleResult {
  verdict: RationaleVerdict;
  /** False when the model call failed and `FALLBACK_VERDICT` was substituted. */
  judged: boolean;
}

function buildPrompt(input: JudgeRationaleInput): string {
  return [
    'You are grading one answer in a competitive-programming pattern-recognition drill.',
    'The learner saw only the problem statement and constraints, then named a pattern and explained why.',
    '',
    "Judge ONLY this: does the learner's explanation cite a real, concrete tell grounded in the",
    "problem's constraints or structure (input bounds, sortedness, monotonicity, contiguity,",
    'a min-max objective, the size of the state space, and so on)?',
    '',
    'Answer "yes" if it points at a specific structural signal that genuinely implies the approach.',
    'Answer "partial" if it gestures at the right idea but stays vague, or names a real signal',
    'while drawing the wrong conclusion from it.',
    'Answer "no" if it is a bare assertion, restates the question, or cites nothing from the constraints.',
    '',
    'Grade the reasoning, not the verdict: a learner can name the wrong pattern for a well-cited',
    'reason (that is "yes" or "partial"), or the right pattern for no reason at all (that is "no").',
    '',
    `PROBLEM STATEMENT:\n${input.statement}`,
    '',
    `CONSTRAINTS:\n${input.constraints}`,
    '',
    `TRUE PATTERN: ${input.actualPatternName}`,
    `LEARNER'S GUESS: ${input.guessedPatternName}`,
    `LEARNER'S RATIONALE:\n${input.rationaleText}`,
    '',
    'Reply with exactly one word: yes, partial, or no.',
  ].join('\n');
}

/**
 * Pulls a verdict out of whatever the model actually said. Checks "partial"
 * first because a hedged sentence often contains "yes" as well.
 */
export function parseRationaleVerdict(raw: string): RationaleVerdict | undefined {
  const text = raw.toLowerCase();
  if (/\bpartial(ly)?\b/.test(text)) return 'partial';
  if (/\byes\b/.test(text)) return 'yes';
  if (/\bno\b/.test(text)) return 'no';
  return undefined;
}

export async function judgeRationale(input: JudgeRationaleInput): Promise<JudgeRationaleResult> {
  try {
    const model = getClient().getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { temperature: 0, maxOutputTokens: 512 },
    });

    const response = await model.generateContent(buildPrompt(input));
    const raw = response.response.text();
    const verdict = parseRationaleVerdict(raw);

    if (!verdict) {
      log.warn({ raw }, 'Could not parse a verdict from Gemini; falling back');
      return { verdict: FALLBACK_VERDICT, judged: false };
    }

    return { verdict, judged: true };
  } catch (error) {
    // A grading outage must not cost the learner their attempt, so score
    // neutrally and let the response say the rationale went unjudged.
    log.error({ err: error }, 'Gemini rationale judgement failed; falling back');
    return { verdict: FALLBACK_VERDICT, judged: false };
  }
}
