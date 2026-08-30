import { findItem, subtreeIds } from '../internal/find.js';
import { CHANGED_SINCE, LOCKED, MISSING } from '../internal/messages.js';
import {
  recomputeGroupFrame,
  restoreSubtree,
  snapshotSubtree,
  translateSubtree,
} from '../internal/transform.js';
import { isGroup } from '@rilo/mb-schema';
import type { CommandHandler, MoveItemPayload } from '../types.js';

/**
 * Puts something at an absolute position.
 *
 * Absolute rather than a delta so that coalescing works: a drag emits dozens of
 * these sharing a `coalesceKey`, history keeps the first inverse and the last
 * command, and the result is one undo landing exactly where the gesture started.
 * A delta would have to be summed to get the same answer.
 *
 * Moving a group moves its children by the same amount (LANE-1 §7.4).
 */
export const moveItem: CommandHandler<MoveItemPayload> = (draft, payload) => {
  const found = findItem(draft, payload.itemId);
  if (found === null) return { rejected: MISSING };

  const { item } = found;
  if (item.locked) return { rejected: LOCKED };

  const before = snapshotSubtree(item);

  if (payload.restore === undefined) {
    translateSubtree(item, payload.x - item.frame.x, payload.y - item.frame.y);
    if (isGroup(item)) recomputeGroupFrame(item);
  } else if (!restoreSubtree(item, payload.restore)) {
    return { rejected: CHANGED_SINCE };
  }

  return {
    inverse: {
      type: 'item.move',
      payload: {
        itemId: item.id,
        x: before[0].frame.x,
        y: before[0].frame.y,
        restore: before,
      },
    },
    dirty: subtreeIds(item),
  };
};
