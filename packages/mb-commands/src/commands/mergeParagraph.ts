import { current } from 'immer';
import { findParagraph } from '../internal/find.js';
import { MISSING_TEXT } from '../internal/messages.js';
import { normaliseRuns, runsLength } from '../internal/runs.js';
import { storyDirtyIds } from '../internal/threads.js';
import type { CommandHandler, MergeParagraphPayload, SplitParagraphPayload } from '../types.js';

/**
 * Joins a paragraph onto the one before it — what Backspace at the start does.
 *
 * The paragraph that survives is the FIRST one, so the joined text keeps the
 * look of what it is being joined to. That matches what people expect from every
 * other editor, and it is why the inverse has to carry the second paragraph's
 * look, overrides, list type and order key: all four are gone once this runs.
 */
export const mergeParagraph: CommandHandler<MergeParagraphPayload> = (draft, payload) => {
  const found = findParagraph(draft, payload.paragraphId);
  if (found === null) return { rejected: MISSING_TEXT };

  const { story, paragraph, index } = found;
  if (index === 0) {
    return { rejected: 'There is nothing before this to join it to' };
  }

  const previous = story.paragraphs[index - 1];
  if (previous === undefined) return { rejected: MISSING_TEXT };

  // The split offset for the inverse: where the first paragraph currently ends.
  const offset = runsLength(previous.runs);

  // `current()` — the inverse outlives this call, and a draft proxy does not.
  const restore: NonNullable<SplitParagraphPayload['restore']> = {
    order: paragraph.order,
    lookId: paragraph.lookId,
    overrides: current(paragraph).overrides,
    listType: paragraph.listType,
  };

  previous.runs = normaliseRuns([...current(previous).runs, ...current(paragraph).runs]);
  story.paragraphs.splice(index, 1);

  return {
    inverse: {
      type: 'text.splitParagraph',
      payload: {
        paragraphId: previous.id,
        offset,
        newParagraphId: paragraph.id,
        restore,
      },
    },
    dirty: storyDirtyIds(draft, story.id),
  };
};
