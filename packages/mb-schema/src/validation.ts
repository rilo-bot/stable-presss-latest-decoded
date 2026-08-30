// ---------------------------------------------------------------------------
// Invariants — the twelve rules a magazine must satisfy.
//
// This module REPORTS. It never repairs. The old system's `validateElements()`
// clamps and drops silently, which is how invalid state becomes invisible: the
// bug is hidden and the failure surfaces somewhere far from its cause.
//
// Two entry points (FOUNDATION v0.3 §5.8):
//
//   validateStructure()  cheap  — runs after EVERY command, in every build
//   validateMagazine()   full   — dev and tests only
//
// Immer's produce() protects against a handler that THROWS. It does not protect
// against one that returns normally having made a wrong change. The structural
// checks are id lookups and array scans — microseconds on a 24-page magazine —
// and they catch exactly the failures that corrupt a document, so they run
// always.
// ---------------------------------------------------------------------------

import type { Id, OrderKey } from './primitives.js';
import type { Item, TextBox } from './items.js';
import { isGroup, isTextBox } from './items.js';
import type { Magazine, Page } from './magazine.js';

/**
 * A stable machine-readable code. Tests assert on these, never on message text
 * — a message is prose and drifts, a code is a contract.
 */
export type ValidationCode =
  | 'story-missing' //          1
  | 'thread-dangling' //        2
  | 'thread-not-a-textbox' //   2
  | 'thread-asymmetric' //      2
  | 'thread-cycle' //           3
  | 'thread-story-mismatch' //  3
  | 'thread-headless' //        4
  | 'look-missing' //           5
  | 'asset-missing' //          6
  | 'duplicate-item-id' //      7
  | 'frame-not-positive' //     8
  | 'cover-not-single' //       9
  | 'duplicate-order-key' //   10
  | 'collection-unsorted' //   10
  | 'spread-page-count' //     11
  | 'facing-pages-off'; //     12

export interface ValidationError {
  code: ValidationCode;
  /** For a developer reading a test failure. Not user-facing. */
  message: string;
  /** What it is about — `spreads[0].pages[0].items[2]`, or an id. */
  path: string;
}

/** A cover spread, and a final odd interior spread, hold one page. */
const PAGES_PER_COVER_SPREAD = 1;

/** Every other interior spread holds two. */
const PAGES_PER_INTERIOR_SPREAD = 2;

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

interface LocatedItem {
  item: Item;
  path: string;
}

/** An ordered array, flattened for the invariant-10 checks. */
interface OrderedCollection {
  path: string;
  members: Array<{ id: Id; order: OrderKey }>;
}

/**
 * Every item in the magazine, including inside groups and repeating
 * backgrounds — the same reach invariants 7 and 10 require.
 */
function walkItems(magazine: Magazine): LocatedItem[] {
  const found: LocatedItem[] = [];

  const descend = (items: readonly Item[], prefix: string): void => {
    items.forEach((item, index) => {
      const path = `${prefix}[${index}]`;
      found.push({ item, path });
      if (isGroup(item)) descend(item.children, `${path}.children`);
    });
  };

  magazine.spreads.forEach((spread, spreadIndex) => {
    spread.pages.forEach((page, pageIndex) => {
      descend(page.items, `spreads[${spreadIndex}].pages[${pageIndex}].items`);
    });
  });

  for (const [backgroundId, background] of Object.entries(magazine.backgrounds)) {
    descend(background.items, `backgrounds.${backgroundId}.items`);
  }

  return found;
}

/** Every ordered collection: page items, group children, background items, paragraphs. */
function collectOrdered(magazine: Magazine): OrderedCollection[] {
  const collections: OrderedCollection[] = [];

  const descend = (items: readonly Item[], path: string): void => {
    collections.push({ path, members: items.map((i) => ({ id: i.id, order: i.order })) });
    for (const item of items) {
      if (isGroup(item)) descend(item.children, `${path}[id=${item.id}].children`);
    }
  };

  magazine.spreads.forEach((spread, spreadIndex) => {
    spread.pages.forEach((page, pageIndex) => {
      descend(page.items, `spreads[${spreadIndex}].pages[${pageIndex}].items`);
    });
  });

  for (const [backgroundId, background] of Object.entries(magazine.backgrounds)) {
    descend(background.items, `backgrounds.${backgroundId}.items`);
  }

  for (const [storyId, story] of Object.entries(magazine.stories)) {
    collections.push({
      path: `stories.${storyId}.paragraphs`,
      members: story.paragraphs.map((p) => ({ id: p.id, order: p.order })),
    });
  }

  return collections;
}

function allPages(magazine: Magazine): Page[] {
  return magazine.spreads.flatMap((spread) => spread.pages);
}

// ---------------------------------------------------------------------------
// Structural invariants — 1, 2, 3, 4, 5, 6, 7, 10
// ---------------------------------------------------------------------------

/** 1, 5, 6 — every reference resolves. */
function checkReferences(magazine: Magazine, located: LocatedItem[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const { item, path } of located) {
    if (isTextBox(item) && !(item.storyId in magazine.stories)) {
      errors.push({
        code: 'story-missing',
        message: `Text box references story "${item.storyId}", which does not exist`,
        path,
      });
    }
    if (item.type === 'photo' && !(item.assetId in magazine.assets)) {
      errors.push({
        code: 'asset-missing',
        message: `Photo references asset "${item.assetId}", which does not exist`,
        path,
      });
    }
  }

  for (const [storyId, story] of Object.entries(magazine.stories)) {
    story.paragraphs.forEach((paragraph, index) => {
      if (!(paragraph.lookId in magazine.looks)) {
        errors.push({
          code: 'look-missing',
          message: `Paragraph references look "${paragraph.lookId}", which does not exist`,
          path: `stories.${storyId}.paragraphs[${index}]`,
        });
      }
    });
  }

  return errors;
}

/** 7 — item ids are unique across the whole magazine. */
function checkUniqueItemIds(located: LocatedItem[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<Id, string>();

  for (const { item, path } of located) {
    const first = seen.get(item.id);
    if (first === undefined) {
      seen.set(item.id, path);
      continue;
    }
    errors.push({
      code: 'duplicate-item-id',
      message: `Item id "${item.id}" is used twice — also at ${first}`,
      path,
    });
  }

  return errors;
}

/** 10 — order keys unique within their collection, and the array sorted by them. */
function checkOrderKeys(magazine: Magazine): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const collection of collectOrdered(magazine)) {
    const seen = new Set<OrderKey>();
    let previous: OrderKey | null = null;

    collection.members.forEach((member, index) => {
      if (seen.has(member.order)) {
        errors.push({
          code: 'duplicate-order-key',
          message: `Order key "${member.order}" is used twice in this collection`,
          path: `${collection.path}[${index}]`,
        });
      }
      seen.add(member.order);

      if (previous !== null && member.order <= previous) {
        errors.push({
          code: 'collection-unsorted',
          message: `Order key "${member.order}" follows "${previous}" — the array is not sorted`,
          path: `${collection.path}[${index}]`,
        });
      }
      previous = member.order;
    });
  }

  return errors;
}

/** 2, 3, 4 — the thread chains. */
function checkThreads(located: LocatedItem[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const boxes = new Map<Id, TextBox>();
  const paths = new Map<Id, string>();
  const nonTextIds = new Set<Id>();

  for (const { item, path } of located) {
    if (isTextBox(item)) {
      boxes.set(item.id, item);
      paths.set(item.id, path);
    } else {
      nonTextIds.add(item.id);
    }
  }

  const pathOf = (id: Id): string => paths.get(id) ?? `item(${id})`;

  // 2 — links resolve, point at text boxes, and agree with each other.
  for (const box of boxes.values()) {
    const path = pathOf(box.id);

    if (box.nextBoxId !== null) {
      const next = boxes.get(box.nextBoxId);
      if (next === undefined) {
        errors.push({
          code: nonTextIds.has(box.nextBoxId) ? 'thread-not-a-textbox' : 'thread-dangling',
          message: `nextBoxId "${box.nextBoxId}" does not name a text box`,
          path,
        });
      } else if (next.prevBoxId !== box.id) {
        errors.push({
          code: 'thread-asymmetric',
          message: `nextBoxId points at "${next.id}", whose prevBoxId is "${String(next.prevBoxId)}"`,
          path,
        });
      }
    }

    if (box.prevBoxId !== null) {
      const previous = boxes.get(box.prevBoxId);
      if (previous === undefined) {
        errors.push({
          code: nonTextIds.has(box.prevBoxId) ? 'thread-not-a-textbox' : 'thread-dangling',
          message: `prevBoxId "${box.prevBoxId}" does not name a text box`,
          path,
        });
      } else if (previous.nextBoxId !== box.id) {
        errors.push({
          code: 'thread-asymmetric',
          message: `prevBoxId points at "${previous.id}", whose nextBoxId is "${String(previous.nextBoxId)}"`,
          path,
        });
      }
    }
  }

  // 3, 4 — walk each chain from its head. Anything unreached afterwards sits in
  // a component with no head, which means a cycle.
  const reached = new Set<Id>();

  for (const head of boxes.values()) {
    if (head.prevBoxId !== null) continue;

    const walked = new Set<Id>([head.id]);
    reached.add(head.id);
    let current: TextBox = head;

    while (current.nextBoxId !== null) {
      const next = boxes.get(current.nextBoxId);
      if (next === undefined) break; // already reported as dangling above

      if (walked.has(next.id)) {
        errors.push({
          code: 'thread-cycle',
          message: `Thread chain from "${head.id}" returns to "${next.id}"`,
          path: pathOf(current.id),
        });
        break;
      }

      if (next.storyId !== head.storyId) {
        errors.push({
          code: 'thread-story-mismatch',
          message: `Box shows story "${next.storyId}" but its chain shows "${head.storyId}"`,
          path: pathOf(next.id),
        });
      }

      walked.add(next.id);
      reached.add(next.id);
      current = next;
    }
  }

  for (const box of boxes.values()) {
    if (reached.has(box.id)) continue;
    errors.push({
      code: 'thread-headless',
      message: `Text box "${box.id}" is in a chain with no head — every chain needs exactly one box whose prevBoxId is null`,
      path: pathOf(box.id),
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Full-pass invariants — 8, 9, 11, 12
// ---------------------------------------------------------------------------

/** 8 — no frame has zero or negative width or height. */
function checkFrames(located: LocatedItem[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const { item, path } of located) {
    if (item.frame.w > 0 && item.frame.h > 0) continue;
    errors.push({
      code: 'frame-not-positive',
      message: `Frame is ${item.frame.w} x ${item.frame.h}; both must be greater than zero`,
      path,
    });
  }

  return errors;
}

/**
 * 9, 11, 12 — spread page counts.
 *
 * With facing pages on: the first spread is the front cover and the last is the
 * back cover, each a single page. Interiors hold two, except that a final
 * interior spread may hold one when the interior count is odd — screen-first
 * means no print signature forces an even count, and silently inserting a blank
 * page when someone adds a page is the kind of surprise this product avoids.
 *
 * With facing pages off, every spread holds exactly one page.
 */
function checkSpreads(magazine: Magazine): ValidationError[] {
  const errors: ValidationError[] = [];
  const { spreads } = magazine;
  const lastIndex = spreads.length - 1;

  if (!magazine.pageSetup.facingPages) {
    spreads.forEach((spread, index) => {
      if (spread.pages.length === PAGES_PER_COVER_SPREAD) return;
      errors.push({
        code: 'facing-pages-off',
        message: `Spread holds ${spread.pages.length} pages; with facing pages off every spread holds one`,
        path: `spreads[${index}]`,
      });
    });
    return errors;
  }

  const first = spreads[0];
  if (first !== undefined && first.pages.length !== PAGES_PER_COVER_SPREAD) {
    errors.push({
      code: 'cover-not-single',
      message: `Front cover spread holds ${first.pages.length} pages; it must hold one`,
      path: 'spreads[0]',
    });
  }

  const last = spreads[lastIndex];
  if (lastIndex > 0 && last !== undefined && last.pages.length !== PAGES_PER_COVER_SPREAD) {
    errors.push({
      code: 'spread-page-count',
      message: `Back cover spread holds ${last.pages.length} pages; it must hold one`,
      path: `spreads[${lastIndex}]`,
    });
  }

  // Interiors are everything between the two covers. All hold two, except the
  // final one, which may hold one when the interior page count is odd.
  const finalInteriorIndex = lastIndex - 1;
  for (let index = 1; index < lastIndex; index += 1) {
    const spread = spreads[index];
    if (spread === undefined) continue;

    const count = spread.pages.length;
    if (count === PAGES_PER_INTERIOR_SPREAD) continue;
    if (index === finalInteriorIndex && count === PAGES_PER_COVER_SPREAD) continue;

    errors.push({
      code: 'spread-page-count',
      message: `Interior spread holds ${count} pages; interiors hold two, and only the last may hold one`,
      path: `spreads[${index}]`,
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * The cheap checks — invariants 1 to 7 and 10.
 *
 * Id resolution, thread integrity, uniqueness, sort order. Runs after every
 * command in every environment, because these are the failures that corrupt a
 * document rather than merely making it look wrong.
 */
export function validateStructure(magazine: Magazine): ValidationError[] {
  const located = walkItems(magazine);
  return [
    ...checkReferences(magazine, located),
    ...checkThreads(located),
    ...checkUniqueItemIds(located),
    ...checkOrderKeys(magazine),
  ];
}

/**
 * Every invariant, including geometry and spread parity.
 *
 * Development and tests only — it walks the whole document and is not worth
 * running on every keystroke in production.
 */
export function validateMagazine(magazine: Magazine): ValidationError[] {
  const located = walkItems(magazine);
  return [...validateStructure(magazine), ...checkFrames(located), ...checkSpreads(magazine)];
}

/** Convenience for tests and for the dirty-list work in mb-store. */
export function pageCount(magazine: Magazine): number {
  return allPages(magazine).length;
}
