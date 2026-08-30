import { findItem } from '../internal/find.js';
import { LOCKED, MISSING, NO_PLACE } from '../internal/messages.js';
import { insertByOrder, keyBetweenNeighbours, neighboursOf, orderKeyTaken } from '../internal/order.js';
import type { CommandHandler, ReorderItemPayload } from '../types.js';

/**
 * Changes where something sits in the stack — bring to front, send to back, and
 * the two single steps (ARR-10).
 *
 * The position is named by NEIGHBOURS, never by an index. "Put this in front of
 * the headline" is still true when someone else has added three things since the
 * caller last looked; "put this at position 4" is not, and the caller looking at
 * a stale view is the ordinary case with two browser tabs open. FOUNDATION §5.1.
 *
 * The inverse carries the original key rather than the original neighbours,
 * because generating between the same neighbours yields a valid key but not the
 * same string — and undo has to land on the document it started from.
 */
export const reorderItem: CommandHandler<ReorderItemPayload> = (draft, payload) => {
  const found = findItem(draft, payload.itemId);
  if (found === null) return { rejected: MISSING };

  const { item, siblings, index } = found;
  if (item.locked) return { rejected: LOCKED };

  const order =
    payload.order ??
    keyBetweenNeighbours(siblings, payload.afterId, payload.beforeId, item.id);
  if (order === null) return { rejected: NO_PLACE };
  if (orderKeyTaken(siblings, order, item.id)) {
    return { rejected: 'Something is already in that position' };
  }

  const previousOrder = item.order;
  const previousNeighbours = neighboursOf(siblings, index);

  siblings.splice(index, 1);
  item.order = order;
  insertByOrder(siblings, item);

  return {
    inverse: {
      type: 'item.reorder',
      payload: {
        itemId: item.id,
        afterId: previousNeighbours.afterId,
        beforeId: previousNeighbours.beforeId,
        order: previousOrder,
      },
    },
    dirty: [item.id],
  };
};
