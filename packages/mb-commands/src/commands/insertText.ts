import type { TextRun } from '@rilo/mb-schema';
import { findParagraph } from '../internal/find.js';
import { MISSING_TEXT } from '../internal/messages.js';
import { normaliseRuns, overridesAt, runsLength, spliceRuns } from '../internal/runs.js';
import { storyDirtyIds } from '../internal/threads.js';
import type { CommandHandler, InsertTextPayload } from '../types.js';

/**
 * Puts text into a paragraph.
 *
 * Typed text arrives as `text` and inherits the formatting to its left (D-19),
 * so continuing a bold word stays bold. An undo of a deletion arrives as `runs`
 * instead: a span that crossed runs with different formatting cannot be restored
 * by inserting plain text, so the inverse carries the runs as they were.
 *
 * The offset is into the paragraph's whole text, not into a particular run. The
 * caller does not have to know the run structure — which is just as well, since
 * it changes under them every time formatting is applied.
 */
export const insertText: CommandHandler<InsertTextPayload> = (draft, payload) => {
  const found = findParagraph(draft, payload.paragraphId);
  if (found === null) return { rejected: MISSING_TEXT };

  const { story, paragraph } = found;
  const total = runsLength(paragraph.runs);

  if (!Number.isInteger(payload.offset) || payload.offset < 0 || payload.offset > total) {
    return { rejected: 'That position is not in this piece of text' };
  }

  const insert: TextRun[] =
    payload.runs ??
    (payload.text === undefined || payload.text.length === 0
      ? []
      : [{ text: payload.text, overrides: overridesAt(paragraph.runs, payload.offset) }]);

  const length = insert.reduce((sum, run) => sum + run.text.length, 0);
  if (length === 0) return { rejected: 'There is nothing to add' };

  paragraph.runs = spliceRuns(paragraph.runs, payload.offset, 0, normaliseRuns(insert));

  return {
    inverse: {
      type: 'text.delete',
      payload: { paragraphId: paragraph.id, offset: payload.offset, length },
    },
    dirty: storyDirtyIds(draft, story.id),
  };
};
