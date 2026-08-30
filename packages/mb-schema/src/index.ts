// ---------------------------------------------------------------------------
// mb-schema — the document model every other package imports.
//
// Zero dependencies, by contract (FOUNDATION v0.3 §4). Everything depends on
// this package, so a dependency here is a dependency everywhere.
// ---------------------------------------------------------------------------

export type { Color, Id, Insets, OrderKey, Px, Rect } from './primitives.js';

export {
  DPI,
  PX_PER_MM,
  PX_PER_PT,
  formatMm,
  formatPt,
  mmToPx,
  parseMm,
  parsePt,
  ptToPx,
  pxToMm,
  pxToPt,
} from './units.js';

export type {
  CharacterProps,
  FontWeight,
  ListType,
  Paragraph,
  ParagraphProps,
  SavedLook,
  Story,
  TextAlign,
  TextRun,
  TextTransform,
} from './text.js';

export type {
  Group,
  Item,
  ItemBase,
  ItemBaseProps,
  ItemType,
  OverflowBehaviour,
  Photo,
  PhotoFit,
  Shape,
  ShapeKind,
  ShapeStroke,
  TextBox,
  TextWrap,
} from './items.js';
export { DEFAULT_MIN_FONT_SCALE, isGroup, isPhoto, isShape, isTextBox } from './items.js';

export type { AssetRef, AssetSource } from './assets.js';

export type {
  Magazine,
  MagazineMeta,
  Page,
  PageSetup,
  RepeatingBackground,
  Spread,
} from './magazine.js';
export { SCHEMA_VERSION } from './magazine.js';

export type { ValidationCode, ValidationError } from './validation.js';
export { pageCount, validateMagazine, validateStructure } from './validation.js';

export type { BlankMagazineOptions, CreatePageOptions, IdFactory } from './defaults.js';
export {
  A4_PORTRAIT,
  DEFAULT_LOOK_ID,
  createBlankMagazine,
  createDefaultLooks,
  createMargin,
  createPage,
  createSpread,
  createStory,
} from './defaults.js';
