// ---------------------------------------------------------------------------
// Thread chains — text flowing from one box into the next (TXT-11).
//
// The chain is a doubly-linked list held on the boxes; the story is held
// separately and every box in a chain shows the same one (invariant 3). Nothing
// here writes: these are the reads handlers do before deciding.
//
// Every walk carries a visited set. Validation reports a cycle, but a helper
// that loops forever when handed one turns a reported defect into a hung tab.
// ---------------------------------------------------------------------------

import type { Id, Magazine, TextBox } from '@rilo/mb-schema';
import { isTextBox } from '@rilo/mb-schema';
import { allItems, findTextBox } from './find.js';

/** The box and everything downstream of it, in order. */
export function downstreamFrom(magazine: Magazine, box: TextBox): TextBox[] {
  const chain: TextBox[] = [];
  const seen = new Set<Id>();
  let current: TextBox | null = box;

  while (current !== null && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.nextBoxId === null ? null : findTextBox(magazine, current.nextBoxId);
  }

  return chain;
}

/** The head of the chain this box belongs to. Itself, when it is the head. */
export function headOf(magazine: Magazine, box: TextBox): TextBox {
  const seen = new Set<Id>([box.id]);
  let current = box;

  while (current.prevBoxId !== null) {
    const previous = findTextBox(magazine, current.prevBoxId);
    if (previous === null || seen.has(previous.id)) break;
    seen.add(previous.id);
    current = previous;
  }

  return current;
}

/** Every box in this box's chain, head first. */
export function wholeChain(magazine: Magazine, box: TextBox): TextBox[] {
  return downstreamFrom(magazine, headOf(magazine, box));
}

/** Every box anywhere showing this story. Not necessarily one chain. */
export function boxesShowingStory(magazine: Magazine, storyId: Id): TextBox[] {
  return allItems(magazine).filter(
    (item): item is TextBox => isTextBox(item) && item.storyId === storyId,
  );
}

/** Ids of every box whose layout depends on this story. The dirty list for a text edit. */
export function storyDirtyIds(magazine: Magazine, storyId: Id): Id[] {
  return boxesShowingStory(magazine, storyId).map((box) => box.id);
}
