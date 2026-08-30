import { generateKeyBetween } from 'fractional-indexing';
import type { Paragraph } from '@rilo/mb-schema';
import { findParagraph } from '../internal/find.js';
import { MISSING_TEXT } from '../internal/messages.js';
import { runsLength, sliceRuns } from '../internal/runs.js';
import { storyDirtyIds } from '../internal/threads.js';
import type { CommandHandler, SplitParagraphPayload } from '../types.js';

/**
 * Breaks a paragraph in two — what Enter does.
 *
 * The new paragraph's id comes from the caller so that the inverse can name it
 * and so undo and redo reproduce the same document rather than an equivalent
 * one with fresh ids.
 *
 * `restore` is the inverse-of-merge path. Merging destroys the second
 * paragraph's own look, overrides, list type and order key; splitting again
 * would copy the first paragraph's instead, and a merged-then-undone heading
 * would come back as body text. When `restore` is present it wins.
 */
export const splitParagraph: CommandHandler<SplitParagraphPayload> = (draft, payload) => {
  const found = findParagraph(draft, payload.paragraphId);
  if (found === null) return { rejected: MISSING_TEXT };

  const { story, paragraph, index } = found;
  const total = runsLength(paragraph.runs);

  if (!Number.isInteger(payload.offset) || payload.offset < 0 || payload.offset > total) {
    return { rejected: 'That position is not in this piece of text' };
  }
  if (findParagraph(draft, payload.newParagraphId) !== null) {
    return { rejected: 'A piece of text with that name is already in this magazine' };
  }

  const next = story.paragraphs[index + 1];
  const order = payload.restore?.order ?? generateKeyBetween(paragraph.order, next?.order ?? null);
  if (story.paragraphs.some((p) => p.order === order)) {
    return { rejected: 'Something is already in that position' };
  }

  const tail: Paragraph = {
    id: payload.newParagraphId,
    order,
    lookId: payload.restore?.lookId ?? paragraph.lookId,
    overrides: { ...(payload.restore?.overrides ?? paragraph.overrides) },
    runs: sliceRuns(paragraph.runs, payload.offset, total),
    listType: payload.restore?.listType ?? paragraph.listType,
  };

  paragraph.runs = sliceRuns(paragraph.runs, 0, payload.offset);
  story.paragraphs.splice(index + 1, 0, tail);

  return {
    inverse: {
      type: 'text.mergeParagraph',
      payload: { paragraphId: tail.id },
    },
    dirty: storyDirtyIds(draft, story.id),
  };
};
