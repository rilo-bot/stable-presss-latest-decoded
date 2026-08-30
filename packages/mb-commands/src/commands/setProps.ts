import type { ItemBaseProps } from '@rilo/mb-schema';
import { findItem } from '../internal/find.js';
import { LOCKED, MISSING } from '../internal/messages.js';
import type { CommandHandler, SetPropsPayload } from '../types.js';

const MIN_OPACITY = 0;
const MAX_OPACITY = 1;

/**
 * Writes the base properties that are a plain assignment.
 *
 * One field today, and that narrowness is the point (see `ItemBaseProps`).
 * Geometry and lock each have a command that does more than assign — a group's
 * frame has to carry its children, and lock gates the commands that would
 * otherwise write it — so a general setter reaching them would be a second,
 * weaker path to the same state, and FWD-02's "every change is a named
 * instruction" would decay into one instruction meaning anything.
 */
export const setProps: CommandHandler<SetPropsPayload> = (draft, payload) => {
  const found = findItem(draft, payload.itemId);
  if (found === null) return { rejected: MISSING };

  const { item } = found;
  if (item.locked) return { rejected: LOCKED };

  const { opacity } = payload.props;
  if (opacity === undefined) return { rejected: 'Nothing to change' };

  if (!Number.isFinite(opacity) || opacity < MIN_OPACITY || opacity > MAX_OPACITY) {
    return { rejected: 'How see-through something is has to be between 0 and 1' };
  }

  const before: ItemBaseProps = { opacity: item.opacity };
  item.opacity = opacity;

  return {
    inverse: { type: 'item.setProps', payload: { itemId: item.id, props: before } },
    dirty: [item.id],
  };
};
