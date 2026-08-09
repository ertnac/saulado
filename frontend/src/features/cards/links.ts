/**
 * Where a card lives, now that it has no route of its own.
 *
 * Cards are written and edited inline on their set's page, so `/cards/:cardId`
 * is gone. Everything that used to link there — search results, the command
 * palette — links to the set instead and names the card in a query parameter,
 * which `SetDetailPage` opens on arrival.
 *
 * A query parameter rather than a path segment (`/sets/:setId/cards/:cardId`)
 * because it is not a different page: it is the same set page with one card
 * already open. A path segment would be a route, and a route is the thing this
 * change removed.
 */

/** The search-param name, shared so the reader and the writer cannot drift. */
export const CARD_PARAM = 'card'

export function cardHref(setId: string, cardId: string): string {
  return `/sets/${encodeURIComponent(setId)}?${CARD_PARAM}=${encodeURIComponent(cardId)}`
}
