/**
 * One-off backfill: draft a "tell" with Gemini for every problem that lacks one.
 *
 * Deliberately NOT a queue job — bank growth is an operator action run by hand
 * after ingesting problems, not something the drill loop triggers.
 *
 *   pnpm --filter @recogno/worker tells:generate -- --dry-run
 *   pnpm --filter @recogno/worker tells:generate -- --limit 5
 */

import {
  closeDatabase,
  createLogger,
  db,
  generateText,
  patterns,
  problems,
  tells,
} from '@recogno/shared';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

const log = createLogger('generate-tells');

/** Gemini's free tier is rate limited; space the calls out. */
const DELAY_BETWEEN_CALLS_MS = 1_000;

interface Options {
  dryRun: boolean;
  limit: number;
}

function parseArgs(argv: string[]): Options {
  const limitFlag = argv.indexOf('--limit');
  const rawLimit = limitFlag === -1 ? undefined : argv[limitFlag + 1];
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`--limit must be a positive integer, got "${rawLimit}"`);
  }

  return { dryRun: argv.includes('--dry-run'), limit };
}

function buildPrompt(problem: {
  title: string;
  // Nullable in the schema since personal additions may have neither, though the
  // query below only selects curated problems that do.
  statement: string | null;
  constraints: string | null;
  patternName: string;
  patternDescription: string;
}): string {
  return [
    'You write "tells" for a competitive-programming pattern-recognition trainer.',
    "A tell explains why a problem's CONSTRAINTS and STRUCTURE give away its intended pattern —",
    'the signal an experienced solver reads in seconds, before thinking about implementation.',
    '',
    'Rules:',
    '- 2 to 4 sentences, plain prose, no bullet points, no markdown.',
    '- Cite something concrete: an input bound and the complexity it permits or forbids,',
    '  sortedness, monotonicity of a predicate, contiguity, a min-max objective, state-space size.',
    '- Explain why that signal implies THIS pattern rather than a neighbouring one.',
    '- Do not describe the implementation or give code. Do not restate the problem.',
    '',
    `TITLE: ${problem.title}`,
    `STATEMENT: ${problem.statement ?? '(none recorded)'}`,
    `CONSTRAINTS: ${problem.constraints ?? '(none recorded)'}`,
    `INTENDED PATTERN: ${problem.patternName} — ${problem.patternDescription}`,
    '',
    'Write the tell now, and nothing else.',
  ].join('\n');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const pending = await db
    .select({
      id: problems.id,
      slug: problems.slug,
      title: problems.title,
      statement: problems.statement,
      constraints: problems.constraints,
      patternName: patterns.name,
      patternDescription: patterns.description,
    })
    .from(problems)
    .innerJoin(patterns, eq(patterns.id, problems.patternId))
    .leftJoin(tells, eq(tells.problemId, problems.id))
    .where(
      and(
        isNull(tells.id),
        // Tells are a curator artifact for the blind drill. A problem someone
        // added to a personal deck has no pattern to explain, and one with no
        // statement gives the model nothing to reason from.
        eq(problems.source, 'curated'),
        isNotNull(problems.statement),
      ),
    )
    .limit(options.limit);

  log.info({ pending: pending.length, dryRun: options.dryRun }, 'Problems missing a tell');

  if (pending.length === 0) return;

  let written = 0;
  let failed = 0;

  for (const [index, problem] of pending.entries()) {
    try {
      const { text } = await generateText({
        prompt: buildPrompt(problem),
        temperature: 0.4,
        maxOutputTokens: 1024,
      });
      const tellText = text.trim();

      if (!tellText) {
        throw new Error('Gemini returned an empty tell');
      }

      if (options.dryRun) {
        log.info({ slug: problem.slug, tellText }, 'Would write tell (dry run)');
      } else {
        await db
          .insert(tells)
          .values({ problemId: problem.id, tellText, source: 'gemini' })
          .onConflictDoNothing({ target: tells.problemId });
        log.info({ slug: problem.slug }, 'Wrote tell');
      }

      written += 1;
    } catch (error) {
      failed += 1;
      log.error({ err: error, slug: problem.slug }, 'Failed to generate tell');
    }

    if (index < pending.length - 1) await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  log.info({ written, failed, dryRun: options.dryRun }, 'Tell generation finished');
}

main()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch(async (error) => {
    log.error({ err: error }, 'Tell generation failed');
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
