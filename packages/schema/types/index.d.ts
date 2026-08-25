// ---------------------------------------------------------------------------
// @rilo/schema — the shared document contract. Types only; see ../README.md.
// ---------------------------------------------------------------------------

export type {
  ElementType,
  TextRole,
  ElementSource,
  ElementAutoFit,
  ElementImageFit,
  ElementTextAlign,
  ElementTextTransform,
  ElementVAlign,
  ElementFontWeight,
  ElementTextData,
  ElementImageData,
  ElementShapeData,
  ElementQrData,
  ElementIconData,
  MagazineElement,
  PageBackground,
} from './magazineElement.js';

export type {
  CommandScope,
  ElementSelector,
  TextStylePatch,
  BoxPatch,
  NewElement,
  MagazineCommand,
  CommandType,
  CommandBatch,
  CommandFailure,
  AppliedPage,
  BatchResult,
} from './commands.js';
