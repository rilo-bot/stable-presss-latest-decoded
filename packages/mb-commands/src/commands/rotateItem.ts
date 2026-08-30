import { isGroup } from '@rilo/mb-schema';
import { findItem, subtreeIds } from '../internal/find.js';
import { CHANGED_SINCE, LOCKED, MISSING } from '../internal/messages.js';
import {
  normaliseDegrees,
  recomputeGroupFrame,
  restoreSubtree,
  rotateSubtree,
  snapshotSubtree,
} from '../internal/transform.js';
import type { CommandHandler, RotateItemPayload } from '../types.js';

/**
 * Turns something to an absolute angle.
 *
 * Absolute for the same reason `item.move` is: a turn gesture coalesces, and
 * summing deltas to find where a gesture started is work history should not have
 * to do.
 *
 * Turning a group turns its children about the GROUP's centre, which changes
 * both where each child sits and how far each is turned (LANE-1 §7.4). The
 * group's own `rotation` records the accumulated angle for the panel to show;
 * the renderer never applies it, because the children already carry it.
 */
export const rotateItem: CommandHandler<RotateItemPayload> = (draft, payload) => {
  const found = findItem(draft, payload.itemId);
  if (found === null) return { rejected: MISSING };

  const { item } = found;
  if (item.locked) return { rejected: LOCKED };

  if (!Number.isFinite(payload.degrees)) {
    return { rejected: 'That is not an angle this can be turned to' };
  }

  const before = snapshotSubtree(item);

  if (payload.restore === undefined) {
    const target = normaliseDegrees(payload.degrees);
    const delta = target - item.rotation;
    item.rotation = target;
    if (isGroup(item)) {
      rotateSubtree(item, delta);
      recomputeGroupFrame(item);
    }
  } else if (!restoreSubtree(item, payload.restore)) {
    return { rejected: CHANGED_SINCE };
  }

  return {
    inverse: {
      type: 'item.rotate',
      payload: { itemId: item.id, degrees: before[0].rotation, restore: before },
    },
    dirty: subtreeIds(item),
  };
};
