import { findParagraph } from '../internal/find.js';
import { MISSING_TEXT } from '../internal/messages.js';
import { runsLength, sliceRuns, spliceRuns } from '../internal/runs.js';
import { storyDirtyIds } from '../internal/threads.js';
import type { CommandHandler, DeleteTextPayload } from '../types.js';

/**
 * Removes a span of text from a paragraph.
 *
 * The inverse carries the removed RUNS rather than the removed string, because a
 * span crossing a bold word and a plain one is not restorable from its
 * characters alone. `sliceRuns` copies the overrides, so nothing in the inverse
 * points at a draft that produce() is about to revoke.
 */
export const deleteText: CommandHandler<DeleteTextPayload> = (draft, payload) => {
  const found = findParagraph(draft, payload.paragraphId);
  if (found === null) return { rejected: MISSING_TEXT };

  const { story, paragraph } = found;
  const total = runsLength(paragraph.runs);

  if (!Number.isInteger(payload.offset) || payload.offset < 0 || payload.offset > total) {
    return { rejected: 'That position is not in this piece of text' };
  }
  if (!Number.isInteger(payload.length) || payload.length <= 0) {
    return { rejected: 'There is nothing to remove' };
  }
  if (payload.offset + payload.length > total) {
    return { rejected: 'That is more text than this paragraph has' };
  }

  const removed = sliceRuns(paragraph.runs, payload.offset, payload.offset + payload.length);
  paragraph.runs = spliceRuns(paragraph.runs, payload.offset, payload.length, []);

  return {
    inverse: {
      type: 'text.insert',
      payload: { paragraphId: paragraph.id, offset: payload.offset, runs: removed },
    },
    dirty: storyDirtyIds(draft, story.id),
  };
};
