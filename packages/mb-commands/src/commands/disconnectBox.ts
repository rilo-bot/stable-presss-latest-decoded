import type { Story } from '@rilo/mb-schema';
import { findItem, findTextBox } from '../internal/find.js';
import { MISSING, NOT_A_TEXT_BOX } from '../internal/messages.js';
import { downstreamFrom, storyDirtyIds } from '../internal/threads.js';
import type { CommandHandler, DisconnectBoxPayload } from '../types.js';

/**
 * Stops text continuing past this box — "Stop continuing" in the panel.
 *
 * The boxes downstream get a NEW, EMPTY story. The text stays with the chain it
 * was typed into, which is what InDesign does and the only answer that is not
 * surprising: the alternative, splitting the words at the break, means an
 * unrelated later edit silently changes where the split lands.
 *
 * `restoreStory` is the inverse-of-connect path, where the story that has to
 * come back is the one connecting stranded — with its paragraphs, not empty.
 */
export const disconnectBox: CommandHandler<DisconnectBoxPayload> = (draft, payload) => {
  const box = findTextBox(draft, payload.boxId);
  if (box === null) {
    // Two different failures, and telling them apart is the difference between
    // "someone deleted it" and "you picked the wrong thing".
    return { rejected: findItem(draft, payload.boxId) === null ? MISSING : NOT_A_TEXT_BOX };
  }
  if (box.nextBoxId === null) {
    return { rejected: 'This text does not continue anywhere' };
  }

  const next = findTextBox(draft, box.nextBoxId);
  if (next === null) return { rejected: MISSING };

  if (payload.newStoryId in draft.stories) {
    return { rejected: 'That text is already in this magazine' };
  }
  if (payload.restoreStory !== undefined && payload.restoreStory.id !== payload.newStoryId) {
    return { rejected: 'That text does not match the name it was given' };
  }

  const released = downstreamFrom(draft, next);
  const dirty = [...storyDirtyIds(draft, box.storyId), ...released.map((b) => b.id)];

  const story: Story = payload.restoreStory ?? { id: payload.newStoryId, paragraphs: [] };
  draft.stories[story.id] = story;

  box.nextBoxId = null;
  next.prevBoxId = null;
  for (const downstream of released) downstream.storyId = story.id;

  return {
    inverse: {
      type: 'text.connectBox',
      payload: { fromBoxId: box.id, toBoxId: next.id },
    },
    dirty,
  };
};
