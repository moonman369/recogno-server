/**
 * The single Gemini client for the whole system.
 *
 * Every LLM call — drill rationale judging, tell generation, submission
 * evaluation — goes through here so model selection, generation defaults and
 * failure logging stay in one place.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../env.js';
import { createLogger } from '../logger.js';

const log = createLogger('gemini');

/**
 * A floating alias rather than a pinned version: Google retires specific model
 * IDs for new API keys, which silently degrades every call. Override with
 * GEMINI_MODEL to pin one deliberately.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';

let client: GoogleGenerativeAI | undefined;

function getClient(): GoogleGenerativeAI {
  client ??= new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return client;
}

export interface GenerateTextOptions {
  prompt: string;
  /** Defaults to 0 — grading should be reproducible. */
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
  /** Ask Gemini to emit JSON, which removes most parsing ambiguity. */
  json?: boolean;
}

export interface GeneratedText {
  text: string;
  model: string;
}

export async function generateText(options: GenerateTextOptions): Promise<GeneratedText> {
  const modelName = options.model ?? GEMINI_MODEL;

  const model = getClient().getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: options.temperature ?? 0,
      maxOutputTokens: options.maxOutputTokens ?? 1024,
      ...(options.json ? { responseMimeType: 'application/json' } : {}),
    },
  });

  const response = await model.generateContent(options.prompt);
  return { text: response.response.text(), model: modelName };
}

/**
 * Parses JSON from a model response, tolerating the ```json fences that slip
 * through even when a JSON mime type was requested.
 */
export function parseJsonResponse<T = unknown>(raw: string): T | undefined {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Last resort: the first balanced-looking object in the response.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) {
      log.warn({ raw }, 'Model response contained no JSON object');
      return undefined;
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch (error) {
      log.warn({ err: error, raw }, 'Could not parse JSON from model response');
      return undefined;
    }
  }
}
