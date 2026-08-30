// ---------------------------------------------------------------------------
// Factories — the smallest valid magazine, and the pieces to grow it.
//
// Ids and timestamps are INJECTED, not imported. This package imports nothing
// (FOUNDATION §4) and mb-* holds no environmental globals (§6.3), so a caller
// supplies `newId` and `now`. That also makes the headless build test and the
// undo property test deterministic — both compare whole documents, which is
// impossible against a random id source.
//
// There are no item factories here. Creating an item needs an order key, order
// keys are generated between neighbours, and placing something between two
// neighbours is a write — so that belongs to mb-commands.
// ---------------------------------------------------------------------------

import type { Color, Id, Insets, Px } from './primitives.js';
import { mmToPx, ptToPx } from './units.js';
import type { Magazine, Page, PageSetup, Spread } from './magazine.js';
import { SCHEMA_VERSION } from './magazine.js';
import type { CharacterProps, ParagraphProps, SavedLook, Story } from './text.js';

/** Supplied by the caller. In tests, a counter; in the app, nanoid(12). */
export type IdFactory = () => Id;

/** A4 portrait at 150 DPI — the canonical page (ADR-002). */
export const A4_PORTRAIT: { width: Px; height: Px } = { width: 1240, height: 1754 };

/** Default page margin. Not fixed by the requirements; 15mm reads well at A4. */
const DEFAULT_MARGIN_MM = 15;

const DEFAULT_BODY_PT = 11;
const DEFAULT_HEADING_PT = 24;
const DEFAULT_LINE_HEIGHT = 1.4;
const DEFAULT_HEADING_LINE_HEIGHT = 1.15;
const DEFAULT_PARAGRAPH_SPACING_PT = 6;

const BODY_WEIGHT = 400;
const HEADING_WEIGHT = 700;

const INK: Color = '#1a1a1a';

/**
 * The two looks every magazine starts with.
 *
 * TXT-13 names these exactly — "Heading" and "Body text" — so shipping them is
 * the requirement, not an invention. Their ids are deliberately STABLE strings
 * rather than generated: a lane creating the first text box has to reference a
 * look, and a well-known id is more robust than looking one up by a name the
 * user may later change. The existing system uses the same trick for folios.
 */
export const DEFAULT_LOOK_ID = {
  heading: 'look-heading',
  body: 'look-body',
} as const;

function characterProps(sizePt: number, weight: CharacterProps['fontWeight']): CharacterProps {
  return {
    fontFamily: 'Georgia, serif',
    fontWeight: weight,
    italic: false,
    underline: false,
    fontSize: ptToPx(sizePt),
    letterSpacing: 0,
    color: INK,
    textTransform: 'none',
  };
}

function bodyProps(): ParagraphProps {
  return {
    align: 'left',
    firstLineIndent: 0,
    leftIndent: 0,
    rightIndent: 0,
    spaceBefore: 0,
    spaceAfter: ptToPx(DEFAULT_PARAGRAPH_SPACING_PT),
    lineHeight: DEFAULT_LINE_HEIGHT,
    character: characterProps(DEFAULT_BODY_PT, BODY_WEIGHT),
  };
}

function headingProps(): ParagraphProps {
  return {
    align: 'left',
    firstLineIndent: 0,
    leftIndent: 0,
    rightIndent: 0,
    spaceBefore: 0,
    spaceAfter: ptToPx(DEFAULT_PARAGRAPH_SPACING_PT),
    lineHeight: DEFAULT_HEADING_LINE_HEIGHT,
    character: characterProps(DEFAULT_HEADING_PT, HEADING_WEIGHT),
  };
}

export function createDefaultLooks(): Record<Id, SavedLook> {
  return {
    [DEFAULT_LOOK_ID.heading]: {
      id: DEFAULT_LOOK_ID.heading,
      name: 'Heading',
      props: headingProps(),
    },
    [DEFAULT_LOOK_ID.body]: {
      id: DEFAULT_LOOK_ID.body,
      name: 'Body text',
      props: bodyProps(),
    },
  };
}

export function createMargin(millimetres = DEFAULT_MARGIN_MM): Insets {
  const value = mmToPx(millimetres);
  return { top: value, right: value, bottom: value, left: value };
}

export interface CreatePageOptions {
  id: Id;
  width: Px;
  height: Px;
}

/**
 * An empty page at an explicit size.
 *
 * Size is required rather than defaulted from `pageSetup`, because `Page` is
 * what renders (ADR-002) and a caller reading the setup is making that choice
 * deliberately.
 */
export function createPage(options: CreatePageOptions): Page {
  return {
    id: options.id,
    width: options.width,
    height: options.height,
    backgroundId: null,
    backgroundColor: null,
    items: [],
    hiddenBackgroundItems: [],
    columns: null,
  };
}

export function createSpread(id: Id, pages: Page[]): Spread {
  return { id, pages };
}

/** An empty story with no paragraphs. Lane 2 adds the first one by command. */
export function createStory(id: Id): Story {
  return { id, paragraphs: [] };
}

export interface BlankMagazineOptions {
  newId: IdFactory;
  /** ISO 8601. Injected so a blank magazine is reproducible in tests. */
  now: string;
  ownerId: Id;
  title: string;
  slug: string;
  /** Absent means A4 portrait — a legitimate default, not a missing value. */
  pageSize?: { width: Px; height: Px };
  /** Absent means facing pages on, which DOC-07 makes the default view. */
  facingPages?: boolean;
}

/**
 * The smallest valid magazine: one spread holding one page.
 *
 * That is a front cover — and since it is also the last spread, invariant 11's
 * "first holds one" and "last holds one" are satisfied by the same object, with
 * no interiors to check. Every other starting shape needs at least two spreads
 * and answers no question this one does not.
 */
export function createBlankMagazine(options: BlankMagazineOptions): Magazine {
  const size = options.pageSize ?? A4_PORTRAIT;
  const facingPages = options.facingPages ?? true;

  const pageSetup: PageSetup = {
    width: size.width,
    height: size.height,
    margin: createMargin(),
    facingPages,
  };

  const cover = createPage({ id: options.newId(), width: size.width, height: size.height });

  return {
    id: options.newId(),
    schemaVersion: SCHEMA_VERSION,
    meta: {
      title: options.title,
      slug: options.slug,
      ownerId: options.ownerId,
      createdAt: options.now,
      updatedAt: options.now,
    },
    pageSetup,
    backgrounds: {},
    spreads: [createSpread(options.newId(), [cover])],
    stories: {},
    looks: createDefaultLooks(),
    palette: [],
    assets: {},
  };
}
