import { current } from 'immer';
import type { Story } from '@rilo/mb-schema';
import { enclosingGroupId, findItem, findTextBox } from '../internal/find.js';
import { MISSING, NOT_A_TEXT_BOX } from '../internal/messages.js';
import {
  boxesShowingStory,
  downstreamFrom,
  storyDirtyIds,
  wholeChain,
} from '../internal/threads.js';
import type { CommandHandler, ConnectBoxPayload, DisconnectBoxPayload } from '../types.js';

/**
 * Makes text overflowing one box continue in another — TXT-11, the thing Canva
 * cannot do.
 *
 * The second box's chain is adopted into the first box's story, because that is
 * what continuing means: one body of text, several windows onto it. The story
 * those boxes used to show is then shown by nothing, so it is removed here and
 * carried in the inverse.
 *
 * D-22 — a chain may not cross a group boundary. Threading is a MUST and
 * grouping is a SHOULD, and letting the two overlap means every group operation
 * has to know how to repair a chain. Refusing here removes that whole class of
 * repair logic, and the refusal is one the user can act on.
 */
export const connectBox: CommandHandler<ConnectBoxPayload> = (draft, payload) => {
  if (payload.fromBoxId === payload.toBoxId) {
    return { rejected: 'Text cannot continue into the box it is already in' };
  }

  const fromLocation = findItem(draft, payload.fromBoxId);
  const toLocation = findItem(draft, payload.toBoxId);
  if (fromLocation === null || toLocation === null) return { rejected: MISSING };

  const from = findTextBox(draft, payload.fromBoxId);
  const to = findTextBox(draft, payload.toBoxId);
  if (from === null || to === null) return { rejected: NOT_A_TEXT_BOX };

  if (from.nextBoxId !== null) {
    return { rejected: 'This text already continues in another box' };
  }
  if (to.prevBoxId !== null) {
    return { rejected: 'That box already continues text from somewhere else' };
  }
  if (from.storyId === to.storyId) {
    return { rejected: 'Those two boxes already hold the same text' };
  }
  if (enclosingGroupId(draft, from.id) !== enclosingGroupId(draft, to.id)) {
    return { rejected: 'Text cannot continue into a box in a different group' };
  }

  // Walking forward from `from` cannot reach `to` — `from` ends the chain. The
  // check that matters is whether `to` is BEHIND it, which would close a loop.
  if (wholeChain(draft, from).some((box) => box.id === to.id)) {
    return { rejected: 'That box already holds part of this text' };
  }

  const adopted = downstreamFrom(draft, to);
  const strandedId = to.storyId;

  // A story shown by boxes outside this chain has no single place to go back to
  // when this is undone, and it is not a document the command set can produce.
  const outside = boxesShowingStory(draft, strandedId).filter(
    (box) => !adopted.some((inChain) => inChain.id === box.id),
  );
  if (outside.length > 0) {
    return { rejected: 'That text is also shown somewhere else' };
  }

  const dirty = [
    ...storyDirtyIds(draft, from.storyId),
    ...adopted.map((box) => box.id),
  ];

  from.nextBoxId = to.id;
  to.prevBoxId = from.id;
  for (const box of adopted) box.storyId = from.storyId;

  // `current()` — the inverse outlives produce(), and a draft proxy does not.
  const stranded = draft.stories[strandedId];
  const restoreStory: Story | undefined = stranded === undefined ? undefined : current(stranded);
  if (stranded !== undefined) delete draft.stories[strandedId];

  const inversePayload: DisconnectBoxPayload = {
    boxId: from.id,
    newStoryId: strandedId,
  };
  if (restoreStory !== undefined) inversePayload.restoreStory = restoreStory;

  return {
    inverse: { type: 'text.disconnectBox', payload: inversePayload },
    dirty,
  };
};
