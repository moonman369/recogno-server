/**
 * Which flow a problem belongs to.
 *
 * A problem is drill-eligible when a curator gave it both a pattern and a tell —
 * exactly the F1.1–F1.4 bank. Personal additions have neither, so they are
 * graded through the note/solution + AI evaluation flow instead. Both write to
 * the same `srs_cards`, so the due queue spans them.
 */

import { problems, tells } from '@recogno/shared';
import { and, isNotNull, type SQL, sql } from 'drizzle-orm';

/**
 * Eligible for the blind pattern-recognition drill. The statement check is not
 * redundant: the column is nullable now, and a problem with nothing to read
 * cannot be recognised from its constraints.
 */
export function isDrillEligible(): SQL {
  return and(
    isNotNull(problems.patternId),
    isNotNull(problems.statement),
    sql`exists (select 1 from ${tells} where ${tells.problemId} = ${problems.id})`,
  ) as SQL;
}

/** Everything else: graded by writing a note and a solution. */
export function isNoteFlow(): SQL {
  return sql`not (${isDrillEligible()})`;
}

export type ReviewMode = 'drill' | 'note';

/** Selects the mode as a column, so a mixed queue can label each row. */
export function reviewModeColumn(): SQL<ReviewMode> {
  return sql<ReviewMode>`case when ${isDrillEligible()} then 'drill' else 'note' end`;
}
