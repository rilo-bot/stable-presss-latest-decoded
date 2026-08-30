// ---------------------------------------------------------------------------
// Locating things in a magazine.
//
// Every handler starts by finding what it was asked about, and every one of
// these returns null rather than throwing when it is not there: a command naming
// something that no longer exists is a rejection, not a defect (a second tab
// deleted it, or an AI-emitted command named a stale id).
// ---------------------------------------------------------------------------

import type { Group, Id, Item, Magazine, Page, Paragraph, Story, TextBox } from '@rilo/mb-schema';
import { isGroup, isTextBox } from '@rilo/mb-schema';

/**
 * Where an item sits, with enough context to move or remove it.
 *
 * `siblings` is the LIVE array — a page's items, a group's children, or a
 * repeating background's items. Handlers splice it directly, which under Immer
 * is a structural edit of the draft.
 */
export interface ItemLocation {
  item: Item;
  siblings: Item[];
  index: number;
  /** The page it is on. null when it lives in a repeating background. */
  page: Page | null;
  /** The group holding it, or null when it sits directly on the page. */
  parent: Group | null;
}

export function allPages(magazine: Magazine): Page[] {
  return magazine.spreads.flatMap((spread) => spread.pages);
}

export function findPage(magazine: Magazine, pageId: Id): Page | null {
  for (const spread of magazine.spreads) {
    for (const page of spread.pages) {
      if (page.id === pageId) return page;
    }
  }
  return null;
}

function search(
  items: Item[],
  itemId: Id,
  page: Page | null,
  parent: Group | null,
): ItemLocation | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) continue;
    if (item.id === itemId) return { item, siblings: items, index, page, parent };
    if (isGroup(item)) {
      const nested = search(item.children, itemId, page, item);
      if (nested !== null) return nested;
    }
  }
  return null;
}

/** Searches pages first, then repeating backgrounds, groups included. */
export function findItem(magazine: Magazine, itemId: Id): ItemLocation | null {
  for (const spread of magazine.spreads) {
    for (const page of spread.pages) {
      const found = search(page.items, itemId, page, null);
      if (found !== null) return found;
    }
  }
  for (const background of Object.values(magazine.backgrounds)) {
    const found = search(background.items, itemId, null, null);
    if (found !== null) return found;
  }
  return null;
}

export function findTextBox(magazine: Magazine, boxId: Id): TextBox | null {
  const found = findItem(magazine, boxId);
  if (found === null) return null;
  return isTextBox(found.item) ? found.item : null;
}

export interface ParagraphLocation {
  story: Story;
  paragraph: Paragraph;
  index: number;
}

export function findParagraph(magazine: Magazine, paragraphId: Id): ParagraphLocation | null {
  for (const story of Object.values(magazine.stories)) {
    for (let index = 0; index < story.paragraphs.length; index += 1) {
      const paragraph = story.paragraphs[index];
      if (paragraph !== undefined && paragraph.id === paragraphId) {
        return { story, paragraph, index };
      }
    }
  }
  return null;
}

/** Every item everywhere, groups' children included. */
export function allItems(magazine: Magazine): Item[] {
  const found: Item[] = [];

  const descend = (items: readonly Item[]): void => {
    for (const item of items) {
      found.push(item);
      if (isGroup(item)) descend(item.children);
    }
  };

  for (const page of allPages(magazine)) descend(page.items);
  for (const background of Object.values(magazine.backgrounds)) descend(background.items);

  return found;
}

/** An item's id followed by every descendant's. Used to build dirty lists. */
export function subtreeIds(item: Item): Id[] {
  const ids: Id[] = [item.id];
  if (isGroup(item)) {
    for (const child of item.children) ids.push(...subtreeIds(child));
  }
  return ids;
}

/**
 * The group enclosing an item, walking all the way out. null when it sits
 * directly on a page or background.
 *
 * Used by `text.connectBox` to refuse a chain that would cross a group boundary.
 */
export function enclosingGroupId(magazine: Magazine, itemId: Id): Id | null {
  const found = findItem(magazine, itemId);
  return found?.parent?.id ?? null;
}
