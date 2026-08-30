import type { Id, Item, Magazine, OrderKey, TextBox } from '@rilo/mb-schema';
import { isTextBox } from '@rilo/mb-schema';
import { findItem, findPage, findTextBox, subtreeIds } from '../internal/find.js';
import { insertByOrder, keyBetweenNeighbours, orderKeyTaken } from '../internal/order.js';
import { storyDirtyIds } from '../internal/threads.js';
import type { CommandHandler, CreateItemPayload, NewItem } from '../types.js';

/** The union distributes through the spread, so each kind keeps its own fields. */
function place(item: NewItem, order: OrderKey): Item {
  return { ...item, order };
}

/**
 * Points a restored box's neighbours back at it.
 *
 * A box deleted from the middle of a chain carries its `prevBoxId` and
 * `nextBoxId` into the inverse, but the neighbours were re-pointed past it when
 * it went. Without this, undo puts the box back holding links nothing reciprocates
 * and invariant 2 fires. Returns a rejection reason, or null when all is well.
 */
function relinkNeighbours(draft: Magazine, box: TextBox): string | null {
  if (box.prevBoxId !== null) {
    const previous = findTextBox(draft, box.prevBoxId);
    if (previous === null) return 'The box this text continues from is no longer here';
    if (previous.storyId !== box.storyId) return 'Those two boxes hold different text';
    previous.nextBoxId = box.id;
  }

  if (box.nextBoxId !== null) {
    const next = findTextBox(draft, box.nextBoxId);
    if (next === null) return 'The box this text continues into is no longer here';
    if (next.storyId !== box.storyId) return 'Those two boxes hold different text';
    next.prevBoxId = box.id;
  }

  return null;
}

/**
 * Puts something on a page.
 *
 * Also the inverse of `item.delete`, which is why the payload can carry an
 * `order` key and a `story` — restoring has to reproduce what was there, not
 * merely something equivalent.
 */
export const createItem: CommandHandler<CreateItemPayload> = (draft, payload) => {
  const page = findPage(draft, payload.pageId);
  if (page === null) return { rejected: 'That page is no longer in this magazine' };

  if (findItem(draft, payload.item.id) !== null) {
    return { rejected: 'Something with that name is already in this magazine' };
  }

  if (payload.story !== undefined) {
    if (payload.story.id in draft.stories) {
      return { rejected: 'That text is already in this magazine' };
    }
    draft.stories[payload.story.id] = payload.story;
  }

  const order =
    payload.item.order ??
    keyBetweenNeighbours(page.items, payload.afterId, payload.beforeId);
  if (order === null) return { rejected: 'Could not work out where to put this' };
  if (orderKeyTaken(page.items, order)) {
    return { rejected: 'Something is already in that position' };
  }

  const item = place(payload.item, order);
  insertByOrder(page.items, item);

  const dirty: Id[] = [...subtreeIds(item), page.id];

  if (isTextBox(item)) {
    const problem = relinkNeighbours(draft, item);
    if (problem !== null) return { rejected: problem };
    dirty.push(...storyDirtyIds(draft, item.storyId));
  }

  return {
    inverse: { type: 'item.delete', payload: { itemId: item.id } },
    dirty,
  };
};
