// ---------------------------------------------------------------------------
// Fractional index keys — placing an item between two NAMED neighbours.
//
// Why not an array index: a command computed against a view that has since
// changed must still land somewhere sensible. "Put this after the headline" is
// still true when someone else added three items; "put this at position 4" is
// not. FOUNDATION §5.1 and invariant 10.
//
// This happens today with two browser tabs, not only under collaboration.
// ---------------------------------------------------------------------------

import { generateKeyBetween } from 'fractional-indexing';
import type { Id, Item, OrderKey } from '@rilo/mb-schema';

/**
 * A key that places something between `afterId` and `beforeId`.
 *
 * Both null means append. Naming only one side resolves the other from the
 * array, so "after the headline" means immediately after it. Returns null when a
 * named neighbour is not in the collection — the caller rejects.
 *
 * `excludeId` drops the item being moved, so a reorder does not resolve its own
 * current position as a bound.
 */
export function keyBetweenNeighbours(
  siblings: readonly Item[],
  afterId: Id | null,
  beforeId: Id | null,
  excludeId?: Id,
): OrderKey | null {
  const list = excludeId === undefined ? siblings : siblings.filter((i) => i.id !== excludeId);

  const afterAt = afterId === null ? -1 : list.findIndex((i) => i.id === afterId);
  if (afterId !== null && afterAt === -1) return null;

  const beforeAt = beforeId === null ? -1 : list.findIndex((i) => i.id === beforeId);
  if (beforeId !== null && beforeAt === -1) return null;

  let lower: OrderKey | null = null;
  let upper: OrderKey | null = null;

  if (afterAt !== -1) {
    lower = list[afterAt]?.order ?? null;
    if (beforeAt === -1) upper = list[afterAt + 1]?.order ?? null;
  }
  if (beforeAt !== -1) {
    upper = list[beforeAt]?.order ?? null;
    if (afterAt === -1) lower = beforeAt > 0 ? (list[beforeAt - 1]?.order ?? null) : null;
  }
  if (afterAt === -1 && beforeAt === -1) {
    lower = list[list.length - 1]?.order ?? null;
  }

  // Named in the wrong order — "after B, before A" when A precedes B. There is
  // no key that satisfies both, and generateKeyBetween would throw.
  if (lower !== null && upper !== null && lower >= upper) return null;

  return generateKeyBetween(lower, upper);
}

/** The ids either side of a position, for building a reorder's inverse. */
export function neighboursOf(
  siblings: readonly Item[],
  index: number,
): { afterId: Id | null; beforeId: Id | null } {
  return {
    afterId: index > 0 ? (siblings[index - 1]?.id ?? null) : null,
    beforeId: siblings[index + 1]?.id ?? null,
  };
}

/**
 * Inserts at the position its key implies, keeping the array sorted.
 *
 * Readers never sort — array position IS z-order (invariant 10) — so only
 * writers maintain it, and this is where they do it.
 */
export function insertByOrder(siblings: Item[], item: Item): number {
  let at = siblings.length;
  for (let index = 0; index < siblings.length; index += 1) {
    const sibling = siblings[index];
    if (sibling !== undefined && sibling.order > item.order) {
      at = index;
      break;
    }
  }
  siblings.splice(at, 0, item);
  return at;
}

/** Whether a key is already taken in this collection. Invariant 10. */
export function orderKeyTaken(
  siblings: readonly Item[],
  order: OrderKey,
  excludeId?: Id,
): boolean {
  return siblings.some((i) => i.order === order && i.id !== excludeId);
}
