/**
 * Deck visibility, shared by the deck routes and by the deck-scoped variants of
 * the drill and review endpoints.
 *
 * Every route that takes a `deckId` from the caller has to answer the same
 * question first — may this user see it? — and answering it differently in three
 * places is how one of them ends up leaking another user's deck.
 */

import { db, decks } from '@recogno/shared';
import { and, eq, isNull, or, type SQL } from 'drizzle-orm';

/** Visible to this user: every system deck, plus their own. */
export function visibleToUser(userId: string): SQL {
  return or(isNull(decks.ownerUserId), eq(decks.ownerUserId, userId)) as SQL;
}

export interface VisibleDeck {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  /** Null marks a system deck: readable by everyone, writable by no one. */
  ownerUserId: string | null;
}

/**
 * Returns undefined both for a deck that does not exist and for one this user
 * may not see. The caller answers 404 either way — distinguishing them would
 * confirm the existence of other people's decks.
 */
export async function loadVisibleDeck(
  deckId: number,
  userId: string,
): Promise<VisibleDeck | undefined> {
  if (!Number.isInteger(deckId)) return undefined;

  const [deck] = await db
    .select({
      id: decks.id,
      slug: decks.slug,
      name: decks.name,
      description: decks.description,
      ownerUserId: decks.ownerUserId,
    })
    .from(decks)
    .where(and(eq(decks.id, deckId), visibleToUser(userId)))
    .limit(1);

  return deck;
}
