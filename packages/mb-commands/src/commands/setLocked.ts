import { findItem } from '../internal/find.js';
import { MISSING } from '../internal/messages.js';
import type { CommandHandler, SetLockedPayload } from '../types.js';

/**
 * Locks or unlocks something (ARR-11).
 *
 * The one command that does NOT refuse on a locked item, for the obvious reason:
 * unlocking is how a lock is undone. This is also why `item.setProps` cannot
 * write `locked` — a generic setter able to clear it would let every other
 * command through the gate by writing one field first.
 */
export const setLocked: CommandHandler<SetLockedPayload> = (draft, payload) => {
  const found = findItem(draft, payload.itemId);
  if (found === null) return { rejected: MISSING };

  const { item } = found;
  const previous = item.locked;
  if (previous === payload.locked) {
    return { rejected: payload.locked ? 'This is already locked' : 'This is not locked' };
  }

  item.locked = payload.locked;

  return {
    inverse: { type: 'item.setLocked', payload: { itemId: item.id, locked: previous } },
    dirty: [item.id],
  };
};
