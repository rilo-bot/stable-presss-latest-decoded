import { current } from 'immer';
import type { Id, Item, Story } from '@rilo/mb-schema';
import { isGroup, isTextBox } from '@rilo/mb-schema';
import { findItem, findTextBox, subtreeIds } from '../internal/find.js';
import { neighboursOf } from '../internal/order.js';
import { boxesShowingStory, storyDirtyIds } from '../internal/threads.js';
import type { CommandHandler, CreateItemPayload, DeleteItemPayload } from '../types.js';

/** A locked item resists deletion — and so does a locked item inside a group. */
function firstLocked(item: Item): Item | null {
  if (item.locked) return item;
  if (isGroup(item)) {
    for (const child of item.children) {
      const found = firstLocked(child);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Removes something from a page, repairing any thread chain it was part of.
 *
 * The inverse is an `item.create` carrying the item verbatim — its order key,
 * its chain links, and the story when this was the last box showing it. Every
 * one of those has to come back as it was rather than as something equivalent,
 * which is why the create payload has the shape it does.
 */
export const deleteItem: CommandHandler<DeleteItemPayload> = (draft, payload) => {
  const found = findItem(draft, payload.itemId);
  if (found === null) return { rejected: 'That is no longer in this magazine' };

  const { item, siblings, index, page } = found;

  const locked = firstLocked(item);
  if (locked !== null) {
    return {
      rejected:
        locked.id === item.id
          ? 'This is locked. Unlock it before deleting it.'
          : 'Something in this group is locked. Unlock it before deleting the group.',
    };
  }
  if (page === null) {
    return { rejected: 'Items in a repeating background are edited from the background' };
  }

  const dirty: Id[] = [...subtreeIds(item), page.id];
  const neighbours = neighboursOf(siblings, index);

  // Snapshot BEFORE unlinking, so the restored box carries the chain it was in.
  // `current()` because a draft proxy is revoked when produce() finishes, and
  // the inverse outlives this call by the whole length of the undo stack.
  const snapshot: Item = current(item);

  if (isTextBox(item)) {
    dirty.push(...storyDirtyIds(draft, item.storyId));

    const previous = item.prevBoxId === null ? null : findTextBox(draft, item.prevBoxId);
    const next = item.nextBoxId === null ? null : findTextBox(draft, item.nextBoxId);
    if (previous !== null) previous.nextBoxId = item.nextBoxId;
    if (next !== null) next.prevBoxId = item.prevBoxId;
  }

  siblings.splice(index, 1);

  // The story goes with the last box showing it, and comes back with it. Leaving
  // it behind would strand text nothing displays, and would make redo of a
  // create fail on "that text is already in this magazine".
  let story: Story | undefined;
  if (isTextBox(snapshot) && boxesShowingStory(draft, snapshot.storyId).length === 0) {
    const stranded = draft.stories[snapshot.storyId];
    if (stranded !== undefined) {
      story = current(stranded);
      delete draft.stories[snapshot.storyId];
    }
  }

  const inversePayload: CreateItemPayload = {
    pageId: page.id,
    item: snapshot,
    afterId: neighbours.afterId,
    beforeId: neighbours.beforeId,
  };
  if (story !== undefined) inversePayload.story = story;

  return {
    inverse: { type: 'item.create', payload: inversePayload },
    dirty,
  };
};
