import { isGroup } from '@rilo/mb-schema';
import { findItem, subtreeIds } from '../internal/find.js';
import { CHANGED_SINCE, LOCKED, MISSING } from '../internal/messages.js';
import {
  recomputeGroupFrame,
  restoreSubtree,
  scaleSubtree,
  snapshotSubtree,
} from '../internal/transform.js';
import { storyDirtyIds } from '../internal/threads.js';
import { isTextBox } from '@rilo/mb-schema';
import type { CommandHandler, ResizeItemPayload } from '../types.js';

/**
 * Changes something's width and height, and its position with them.
 *
 * Resizing a group scales its children proportionally — GEOMETRY ONLY. Type size
 * is deliberately left alone (LANE-1 §7.3): scaling text on a group resize
 * produces sizes nobody picked, scattered through a document whose whole point
 * is being consistent.
 *
 * A resized text box changes where its story breaks, so every box in the chain
 * is dirty, not just this one.
 */
export const resizeItem: CommandHandler<ResizeItemPayload> = (draft, payload) => {
  const found = findItem(draft, payload.itemId);
  if (found === null) return { rejected: MISSING };

  const { item } = found;
  if (item.locked) return { rejected: LOCKED };

  const before = snapshotSubtree(item);

  if (payload.restore === undefined) {
    if (payload.frame.w <= 0 || payload.frame.h <= 0) {
      return { rejected: 'This needs a width and a height greater than nothing' };
    }
    const previous = { ...item.frame };
    item.frame = { ...payload.frame };
    if (isGroup(item)) {
      scaleSubtree(item, previous, item.frame);
      recomputeGroupFrame(item);
    }
  } else if (!restoreSubtree(item, payload.restore)) {
    return { rejected: CHANGED_SINCE };
  }

  const dirty = subtreeIds(item);
  if (isTextBox(item)) dirty.push(...storyDirtyIds(draft, item.storyId));

  return {
    inverse: {
      type: 'item.resize',
      payload: { itemId: item.id, frame: before[0].frame, restore: before },
    },
    dirty,
  };
};
