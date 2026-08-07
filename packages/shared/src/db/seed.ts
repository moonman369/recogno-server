/**
 * Seeds the canonical pattern taxonomy plus a small hand-written fixture bank,
 * so the drill endpoints are exercisable without a real ingestion pipeline.
 *
 * Idempotent: every table is upserted on its natural key, so re-running only
 * refreshes text. Run with `pnpm db:seed`.
 */

import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { SYSTEM_DECKS, systemDeckSlugForPattern } from '../domain/decks.js';
import { CANONICAL_PATTERNS } from '../domain/patterns.js';
import { createLogger } from '../logger.js';
import { PROBLEM_FIXTURES } from './fixtures.js';
import { closeDatabase, db } from './index.js';
import { decks, patterns, problemPatterns, problems, tells } from './schema.js';

const log = createLogger('seed');

/** `excluded.<column>` — the rejected row, referenced inside ON CONFLICT DO UPDATE. */
function excluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

async function seed(): Promise<void> {
  log.info(
    {
      patterns: CANONICAL_PATTERNS.length,
      decks: SYSTEM_DECKS.length,
      problems: PROBLEM_FIXTURES.length,
    },
    'Seeding',
  );

  await db.transaction(async (tx) => {
    const insertedDecks = await tx
      .insert(decks)
      .values(
        SYSTEM_DECKS.map((deck) => ({
          slug: deck.slug,
          name: deck.name,
          description: deck.description,
          ownerUserId: null,
        })),
      )
      .onConflictDoUpdate({
        // The partial index covering system decks; user decks are unaffected.
        target: decks.slug,
        targetWhere: sql`owner_user_id is null`,
        set: { name: excluded('name'), description: excluded('description') },
      })
      .returning({ id: decks.id, slug: decks.slug });

    const deckIdBySlug = new Map(insertedDecks.map((d) => [d.slug, d.id]));

    const insertedPatterns = await tx
      .insert(patterns)
      .values(
        CANONICAL_PATTERNS.map((p) => ({
          slug: p.slug,
          name: p.name,
          category: p.category,
          description: p.description,
        })),
      )
      .onConflictDoUpdate({
        target: patterns.slug,
        set: {
          name: excluded('name'),
          category: excluded('category'),
          description: excluded('description'),
        },
      })
      .returning({ id: patterns.id, slug: patterns.slug });

    const patternIdBySlug = new Map(insertedPatterns.map((p) => [p.slug, p.id]));

    /**
     * Move any curated problem that is sitting in the wrong deck, before the
     * upsert below runs.
     *
     * The upsert keys on (deck_id, slug). If a problem's deck has changed since
     * it was last seeded, the upsert would insert a *second* copy in the new deck
     * and leave the original behind — and the original carries the user's
     * srs_cards and drill_attempts. Relocating first keeps one row throughout.
     */
    let relocated = 0;
    for (const fixture of PROBLEM_FIXTURES) {
      const targetDeckId = deckIdBySlug.get(systemDeckSlugForPattern(fixture.patternSlug));
      if (targetDeckId === undefined) continue;

      const moved = await tx
        .update(problems)
        .set({ deckId: targetDeckId })
        .where(
          and(
            eq(problems.slug, fixture.slug),
            eq(problems.source, 'curated'),
            sql`${problems.deckId} <> ${targetDeckId}`,
          ),
        )
        .returning({ id: problems.id });

      relocated += moved.length;
    }

    const problemRows = PROBLEM_FIXTURES.map((fixture) => {
      const patternId = patternIdBySlug.get(fixture.patternSlug);
      if (patternId === undefined) {
        throw new Error(
          `Fixture "${fixture.slug}" references unknown pattern "${fixture.patternSlug}"`,
        );
      }
      const deckSlug = systemDeckSlugForPattern(fixture.patternSlug);
      const deckId = deckIdBySlug.get(deckSlug);
      if (deckId === undefined) {
        throw new Error(`System deck "${deckSlug}" was not inserted`);
      }

      return {
        slug: fixture.slug,
        deckId,
        title: fixture.title,
        statement: fixture.statement,
        constraints: fixture.constraints,
        sourceUrl: fixture.sourceUrl,
        source: 'curated' as const,
        patternId,
        difficulty: fixture.difficulty,
      };
    });

    const insertedProblems = await tx
      .insert(problems)
      .values(problemRows)
      .onConflictDoUpdate({
        target: [problems.deckId, problems.slug],
        set: {
          title: excluded('title'),
          statement: excluded('statement'),
          constraints: excluded('constraints'),
          sourceUrl: excluded('source_url'),
          patternId: excluded('pattern_id'),
          difficulty: excluded('difficulty'),
        },
      })
      .returning({ id: problems.id, slug: problems.slug });

    const problemIdBySlug = new Map(insertedProblems.map((p) => [p.slug, p.id]));

    const tellRows = PROBLEM_FIXTURES.map((fixture) => {
      const problemId = problemIdBySlug.get(fixture.slug);
      if (problemId === undefined) {
        throw new Error(`Problem "${fixture.slug}" was not inserted`);
      }
      return { problemId, tellText: fixture.tell, source: 'seed' as const };
    });

    await tx
      .insert(tells)
      .values(tellRows)
      .onConflictDoUpdate({
        target: tells.problemId,
        set: { tellText: excluded('tell_text'), source: excluded('source') },
      });

    // Accepted patterns: the primary plus any equally valid alternative. Cleared
    // first so removing an alternative from a fixture actually removes it.
    const acceptedRows = PROBLEM_FIXTURES.flatMap((fixture) => {
      const problemId = problemIdBySlug.get(fixture.slug);
      if (problemId === undefined) return [];

      const slugs = [fixture.patternSlug, ...(fixture.alsoAcceptedPatternSlugs ?? [])];

      return [...new Set(slugs)].map((slug) => {
        const patternId = patternIdBySlug.get(slug);
        if (patternId === undefined) {
          throw new Error(`Fixture "${fixture.slug}" accepts unknown pattern "${slug}"`);
        }
        return { problemId, patternId };
      });
    });

    await tx.delete(problemPatterns).where(
      inArray(
        problemPatterns.problemId,
        insertedProblems.map((p) => p.id),
      ),
    );
    await tx.insert(problemPatterns).values(acceptedRows).onConflictDoNothing();

    /**
     * Retire system decks that no longer correspond to a category. Guarded by
     * emptiness because deleting a deck cascades to its problems, and from there
     * to real review history — a retired deck that still held something would
     * take a user's cards with it.
     */
    const retired = await tx
      .delete(decks)
      .where(
        and(
          isNull(decks.ownerUserId),
          notInArray(
            decks.slug,
            SYSTEM_DECKS.map((d) => d.slug),
          ),
          sql`not exists (select 1 from ${problems} where ${problems.deckId} = ${decks.id})`,
        ),
      )
      .returning({ slug: decks.slug });

    log.info(
      {
        decks: insertedDecks.length,
        patterns: insertedPatterns.length,
        problems: insertedProblems.length,
        tells: tellRows.length,
        acceptedPatterns: acceptedRows.length,
        relocated,
        retiredDecks: retired.map((d) => d.slug),
      },
      'Seed complete',
    );
  });
}

seed()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch(async (error) => {
    log.error({ err: error }, 'Seed failed');
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
