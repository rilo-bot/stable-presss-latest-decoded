// ---------------------------------------------------------------------------
// Invariants — the rules a magazine must satisfy.
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
//
// NUMBERING. FOUNDATION v0.3 §5.7 lists eleven invariants. Three more are
// enforced here and are pending ratification in the specification: 12 (facing
// pages off means one page per spread), 13 (a magazine has at least one page),
// and 14 (documented numeric ranges hold). All three sit in the FULL pass
// alongside invariant 8, because like it they are about values being sensible
// rather than about the document being addressable. See BLOCKERS QA-03/04/05.
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
  | 'story-missing' //           1
  | 'background-missing' //      1 (extended — the fourth reference kind)
  | 'thread-dangling' //         2
  | 'thread-not-a-textbox' //    2
  | 'thread-asymmetric' //       2
  | 'thread-cycle' //            3
  | 'thread-story-mismatch' //   3
  | 'thread-headless' //         4
  | 'look-missing' //            5
  | 'asset-missing' //           6
  | 'duplicate-item-id' //       7
  | 'duplicate-page-id' //       7 (extended — pages are addressable)
  | 'duplicate-spread-id' //     7 (extended)
  | 'duplicate-paragraph-id' //  7 (extended — text.insert addresses these)
  | 'record-key-mismatch' //     7 (extended — key and .id are used as one)
  | 'frame-not-positive' //      8
  | 'cover-not-single' //        9
  | 'duplicate-order-key' //    10
  | 'collection-unsorted' //    10
  | 'spread-page-count' //      11
  | 'facing-pages-off' //       12 — pending ratification
  | 'no-pages' //               13 — pending ratification
  | 'columns-invalid' //        14 — pending ratification
  | 'value-out-of-range'; //    14 — pending ratification

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

/** Columns must divide the box at least once. */
const MIN_COLUMN_COUNT = 1;

const MIN_OPACITY = 0;
const MAX_OPACITY = 1;
const MIN_ROTATION_DEGREES = -360;
const MAX_ROTATION_DEGREES = 360;

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
// Structural invariants — 1 to 7 and 10
// ---------------------------------------------------------------------------

/** 1, 5, 6 — every reference resolves, including page backgrounds. */
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

  // A dangling backgroundId is worse than an ordinary missing reference: under
  // `noUncheckedIndexedAccess` the renderer's lookup is `… | undefined`, and
  // RULES §1.1 requires it to throw rather than fall back — so without this the
  // failure surfaces as an unexplained error in the render path with nothing
  // naming the cause.
  magazine.spreads.forEach((spread, spreadIndex) => {
    spread.pages.forEach((page, pageIndex) => {
      if (page.backgroundId === null) return;
      if (page.backgroundId in magazine.backgrounds) return;
      errors.push({
        code: 'background-missing',
        message: `Page references repeating background "${page.backgroundId}", which does not exist`,
        path: `spreads[${spreadIndex}].pages[${pageIndex}]`,
      });
    });
  });

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

/**
 * 7 — every ADDRESSABLE id is unique, and record keys agree with the `.id`
 * inside them.
 *
 * Not only items. The command set addresses pages (`item.create { pageId }`) and
 * paragraphs (`text.insert { paragraphId }`), and a duplicate paragraph id means
 * typing lands in the wrong paragraph with nothing reporting it — silent
 * corruption on the text write path.
 */
function checkUniqueIds(magazine: Magazine, located: LocatedItem[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const unique = (
    entries: Array<{ id: Id; path: string }>,
    code: ValidationCode,
    kind: string,
  ): void => {
    const seen = new Map<Id, string>();
    for (const entry of entries) {
      const first = seen.get(entry.id);
      if (first === undefined) {
        seen.set(entry.id, entry.path);
        continue;
      }
      errors.push({
        code,
        message: `${kind} id "${entry.id}" is used twice — also at ${first}`,
        path: entry.path,
      });
    }
  };

  unique(
    located.map(({ item, path }) => ({ id: item.id, path })),
    'duplicate-item-id',
    'Item',
  );

  const spreadEntries: Array<{ id: Id; path: string }> = [];
  const pageEntries: Array<{ id: Id; path: string }> = [];
  magazine.spreads.forEach((spread, spreadIndex) => {
    spreadEntries.push({ id: spread.id, path: `spreads[${spreadIndex}]` });
    spread.pages.forEach((page, pageIndex) => {
      pageEntries.push({ id: page.id, path: `spreads[${spreadIndex}].pages[${pageIndex}]` });
    });
  });
  unique(spreadEntries, 'duplicate-spread-id', 'Spread');
  unique(pageEntries, 'duplicate-page-id', 'Page');

  const paragraphEntries: Array<{ id: Id; path: string }> = [];
  for (const [storyId, story] of Object.entries(magazine.stories)) {
    story.paragraphs.forEach((paragraph, index) => {
      paragraphEntries.push({
        id: paragraph.id,
        path: `stories.${storyId}.paragraphs[${index}]`,
      });
    });
  }
  unique(paragraphEntries, 'duplicate-paragraph-id', 'Paragraph');

  // Record keys and the `.id` inside are used interchangeably by callers, so a
  // mismatch means two names for one object and no way to tell which is right.
  const records: Array<[string, Record<Id, { id: Id }>]> = [
    ['stories', magazine.stories],
    ['looks', magazine.looks],
    ['assets', magazine.assets],
    ['backgrounds', magazine.backgrounds],
  ];
  for (const [name, record] of records) {
    for (const [key, value] of Object.entries(record)) {
      if (value.id === key) continue;
      errors.push({
        code: 'record-key-mismatch',
        message: `${name}["${key}"] holds an object whose id is "${value.id}"`,
        path: `${name}.${key}`,
      });
    }
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
      const isDuplicate = seen.has(member.order);
      if (isDuplicate) {
        errors.push({
          code: 'duplicate-order-key',
          message: `Order key "${member.order}" is used twice in this collection`,
          path: `${collection.path}[${index}]`,
        });
      }
      seen.add(member.order);

      // Only report unsorted when the keys genuinely go backwards. An equal key
      // is already reported above, and counting it twice makes error totals
      // unreliable for any UI saying "N problems" and any test asserting length.
      if (!isDuplicate && previous !== null && member.order < previous) {
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

  /** Every id here came from `paths` a moment ago; the map is total by construction. */
  const pathOf = (id: Id): string => {
    const path = paths.get(id);
    if (path === undefined) {
      throw new Error(`checkThreads: no path recorded for text box "${id}"`);
    }
    return path;
  };

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

  // 3 — every box in a chain shows the same story. Walk from each head.
  const reached = new Set<Id>();

  for (const head of boxes.values()) {
    if (head.prevBoxId !== null) continue;

    const walked = new Set<Id>([head.id]);
    reached.add(head.id);
    let current: TextBox = head;

    while (current.nextBoxId !== null) {
      const next = boxes.get(current.nextBoxId);
      if (next === undefined) break; // already reported as dangling above
      if (walked.has(next.id)) break; // reported by the cycle sweep below

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

  // 3, 4 — anything not reached from a head is either in a cycle or in a chain
  // whose head is missing. Detect the cycle case directly rather than inferring
  // it: a symmetric cycle is the only kind that can exist without also breaking
  // invariant 2, and walking forward from heads can never see one, so
  // `thread-cycle` would otherwise be unreachable as a primary signal.
  const accountedFor = new Set<Id>(reached);

  for (const box of boxes.values()) {
    if (accountedFor.has(box.id)) continue;

    const ring: Id[] = [];
    const visiting = new Set<Id>();
    let current: TextBox | undefined = box;

    while (current !== undefined && !visiting.has(current.id)) {
      visiting.add(current.id);
      ring.push(current.id);
      current = current.nextBoxId === null ? undefined : boxes.get(current.nextBoxId);
    }

    const closesOnItself = current !== undefined;
    for (const id of ring) accountedFor.add(id);

    if (closesOnItself) {
      errors.push({
        code: 'thread-cycle',
        message: `Thread chain ${ring.join(' -> ')} loops back on itself`,
        path: pathOf(box.id),
      });
      continue;
    }

    for (const id of ring) {
      errors.push({
        code: 'thread-headless',
        message: `Text box "${id}" is in a chain with no head — every chain needs exactly one box whose prevBoxId is null`,
        path: pathOf(id),
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Full-pass invariants — 8, 9, 11, and the three pending ratification
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
 * 14 (pending) — documented numeric ranges hold.
 *
 * These are documented in the types and enforced nowhere, which matters more
 * than usual here: FWD-02 means the AI phase emits these values, and a model is
 * exactly the caller that hands you `opacity: 100`.
 */
function checkRanges(located: LocatedItem[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const columns = (
    count: number,
    gutter: number,
    path: string,
  ): void => {
    if (count < MIN_COLUMN_COUNT || !Number.isInteger(count)) {
      errors.push({
        code: 'columns-invalid',
        message: `Column count is ${count}; it must be a whole number of at least ${MIN_COLUMN_COUNT}`,
        path,
      });
    }
    if (gutter < 0) {
      errors.push({
        code: 'columns-invalid',
        message: `Column gutter is ${gutter}; it cannot be negative`,
        path,
      });
    }
  };

  for (const { item, path } of located) {
    if (item.opacity < MIN_OPACITY || item.opacity > MAX_OPACITY) {
      errors.push({
        code: 'value-out-of-range',
        message: `Opacity is ${item.opacity}; it must be between ${MIN_OPACITY} and ${MAX_OPACITY}`,
        path,
      });
    }
    if (item.rotation < MIN_ROTATION_DEGREES || item.rotation > MAX_ROTATION_DEGREES) {
      errors.push({
        code: 'value-out-of-range',
        message: `Rotation is ${item.rotation} degrees; it must be between ${MIN_ROTATION_DEGREES} and ${MAX_ROTATION_DEGREES}`,
        path,
      });
    }
    if (isTextBox(item)) {
      if (item.minFontScale <= 0 || item.minFontScale > MAX_OPACITY) {
        errors.push({
          code: 'value-out-of-range',
          message: `minFontScale is ${item.minFontScale}; it must be greater than 0 and at most 1`,
          path,
        });
      }
      columns(item.columns.count, item.columns.gutter, `${path}.columns`);
    }
  }

  return errors;
}

/**
 * 9, 11, 12, 13 — spread and page counts.
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

  // 13 (pending) — a magazine is always at least one page. DOC-04 needs a floor
  // to refuse a delete against, and without this an empty document validates
  // clean because every other check has nothing to walk.
  if (allPages(magazine).length === 0) {
    errors.push({
      code: 'no-pages',
      message: 'A magazine must have at least one page',
      path: 'spreads',
    });
    return errors;
  }

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

/** Also checks page columns, which live on Page rather than on an item. */
function checkPageColumns(magazine: Magazine): ValidationError[] {
  const errors: ValidationError[] = [];

  magazine.spreads.forEach((spread, spreadIndex) => {
    spread.pages.forEach((page, pageIndex) => {
      if (page.columns === null) return;
      const path = `spreads[${spreadIndex}].pages[${pageIndex}].columns`;
      if (page.columns.count < MIN_COLUMN_COUNT || !Number.isInteger(page.columns.count)) {
        errors.push({
          code: 'columns-invalid',
          message: `Column count is ${page.columns.count}; it must be a whole number of at least ${MIN_COLUMN_COUNT}`,
          path,
        });
      }
      if (page.columns.gutter < 0) {
        errors.push({
          code: 'columns-invalid',
          message: `Column gutter is ${page.columns.gutter}; it cannot be negative`,
          path,
        });
      }
    });
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Shared by both entry points so the document is walked once, not twice. */
function structuralChecks(magazine: Magazine, located: LocatedItem[]): ValidationError[] {
  return [
    ...checkReferences(magazine, located),
    ...checkThreads(located),
    ...checkUniqueIds(magazine, located),
    ...checkOrderKeys(magazine),
  ];
}

/**
 * The cheap checks — invariants 1 to 7 and 10.
 *
 * Id resolution, thread integrity, uniqueness, sort order. Runs after every
 * command in every environment, because these are the failures that corrupt a
 * document rather than merely making it look wrong.
 */
export function validateStructure(magazine: Magazine): ValidationError[] {
  return structuralChecks(magazine, walkItems(magazine));
}

/**
 * Every invariant, including geometry, spread parity and numeric ranges.
 *
 * Development and tests only — it walks the whole document and is not worth
 * running on every keystroke in production.
 */
export function validateMagazine(magazine: Magazine): ValidationError[] {
  const located = walkItems(magazine);
  return [
    ...structuralChecks(magazine, located),
    ...checkFrames(located),
    ...checkRanges(located),
    ...checkSpreads(magazine),
    ...checkPageColumns(magazine),
  ];
}

/** Convenience for tests and for the dirty-list work in mb-store. */
export function pageCount(magazine: Magazine): number {
  return allPages(magazine).length;
}
