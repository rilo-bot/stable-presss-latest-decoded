// ---------------------------------------------------------------------------
// Text content — stored SEPARATELY from the boxes that display it.
//
// This separation is what makes threading work (TXT-11). A story is the words;
// a TextBox is a window onto part of a story. Adding a word reflows every box in
// the chain and no box changes, because no box owns any text.
//
// The old element model stored sanitised inline HTML on each element, which is
// exactly why it has no saved looks and no threading: there was nowhere for a
// style to live and nothing to flow.
// ---------------------------------------------------------------------------

import type { Color, Id, OrderKey, Px } from './primitives.js';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';
export type ListType = 'none' | 'bullet' | 'number';

/** The weights the curated font library ships. */
export type FontWeight = 400 | 500 | 600 | 700 | 800 | 900;

/** Character-level formatting. Applies to a run, or to a whole paragraph. */
export interface CharacterProps {
  fontFamily: string;
  fontWeight: FontWeight;
  italic: boolean;
  underline: boolean;
  fontSize: Px;
  letterSpacing: Px;
  color: Color;
  textTransform: TextTransform;
}

/** Paragraph-level formatting, plus the character defaults for the paragraph. */
export interface ParagraphProps {
  align: TextAlign;
  firstLineIndent: Px;
  leftIndent: Px;
  rightIndent: Px;
  spaceBefore: Px;
  spaceAfter: Px;
  /** Multiplier of font size, not an absolute. 1.4 is a sensible body value. */
  lineHeight: number;
  character: CharacterProps;
}

/**
 * A stretch of plain text sharing one set of character overrides.
 *
 * `text` is PLAIN, never HTML. Formatting is structured, which is what lets a
 * saved look change forty pages at once (TXT-13) — an HTML string cannot be
 * restyled without parsing it.
 */
export interface TextRun {
  text: string;
  /** Sparse. Anything absent falls through to the paragraph's character props. */
  overrides: Partial<CharacterProps>;
}

/**
 * One paragraph of a story.
 *
 * `lookId` names the saved look this paragraph follows; `overrides` is what the
 * user changed on top of it. Keeping overrides sparse is what makes TXT-13
 * work — a look change reaches every paragraph that has not overridden the
 * property being changed.
 */
export interface Paragraph {
  id: Id;
  /** Paragraphs are stored sorted by this. See invariant 10. */
  order: OrderKey;
  lookId: Id;
  /** Sparse. Keep it that way. */
  overrides: Partial<ParagraphProps>;
  runs: TextRun[];
  listType: ListType;
}

/**
 * A body of text, independent of where it is shown.
 *
 * Several TextBoxes may display one story — that is a thread chain. The story
 * does not know which boxes those are; the boxes point at the story.
 */
export interface Story {
  id: Id;
  /** Sorted by `Paragraph.order`. See invariant 10. */
  paragraphs: Paragraph[];
}

/**
 * A named look — "Heading", "Body text" (TXT-13).
 *
 * `name` is user-visible, so it obeys the Section 9 vocabulary.
 */
export interface SavedLook {
  id: Id;
  name: string;
  props: ParagraphProps;
}
