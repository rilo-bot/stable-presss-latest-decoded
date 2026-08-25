// ---------------------------------------------------------------------------
// The command contract — one instruction, applied atomically, undone as a unit.
//
// WHY COMMANDS AT ALL. The editor's write path is one HTTP PATCH per property,
// each with its own page-rev check. That is workable for a human nudging one box
// and unusable for an AI asked to restyle six pages: twenty round-trips, no
// atomicity (fail on the fourth page and the magazine is left half-changed), and
// no way to take it back — undo covers element edits only, skips add/delete and
// every page operation, and a layout rebuild clears the stack outright.
//
// So a batch is the unit of intent: ONE user instruction -> one batch -> one
// atomic apply -> one undo entry. See docs/AI-INTENT-INVENTORY.md, where six of
// twelve real instructions turned out to fail on ADDRESSABILITY alone, which is
// what `ElementSelector` below exists to fix.
//
// Declaration-only, like the rest of this package: the client and server share
// this wire format so they cannot drift.
// ---------------------------------------------------------------------------

import type {
  ElementFontWeight,
  ElementTextAlign,
  ElementTextTransform,
  ElementType,
  ElementVAlign,
  MagazineElement,
  PageBackground,
  TextRole,
} from './magazineElement.js';

// ── Addressing ────────────────────────────────────────────────────────────────

/**
 * How wide a selector reaches.
 *
 * `issue` is the one that does not exist today: the editing agent holds a working
 * copy of a SINGLE page, so it can read other pages but cannot write them, and
 * has to ask the user to open each one in turn.
 */
export type CommandScope =
  | { kind: 'page'; pageId: string }
  | { kind: 'pages'; pageIds: string[] }
  | { kind: 'issue' };

/**
 * What a command acts on.
 *
 * Targets resolve to element IDS at plan time, never to ordinals. Page order and
 * array position can both change between an agent proposing a change and a user
 * applying it — the existing `AgentProposal.pageId` is deliberately an id for the
 * same reason.
 */
export type ElementSelector =
  /** Exactly one element on one page. */
  | { kind: 'element'; pageId: string; elementId: string }
  /** Every text element with this role in scope — "shorten every headline". */
  | { kind: 'role'; role: TextRole; scope: CommandScope }
  /** Every element of this type in scope — "swap all the photos". */
  | { kind: 'type'; type: ElementType; scope: CommandScope };

// ── Command payloads ──────────────────────────────────────────────────────────

/**
 * Text style fields a command may set.
 *
 * Deliberately the FULL surface, unlike the agent's current `set_element_style`
 * tool, which offers only fontSize/fontWeight/color/align/lineHeight — so
 * "make the section labels uppercase and tracked" was impossible even on the
 * open page, despite both fields existing on the element model.
 */
export interface TextStylePatch {
  fontSize?: number;
  maxFontSize?: number;
  minFontSize?: number;
  fontWeight?: ElementFontWeight;
  fontFamily?: string;
  /** #rrggbb */
  color?: string;
  align?: ElementTextAlign;
  vAlign?: ElementVAlign;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: ElementTextTransform;
}

export interface BoxPatch {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
  zIndex?: number;
}

/** A new element, without the fields the server assigns. */
export type NewElement = Omit<MagazineElement, 'id' | 'source'>;

// ── Commands ──────────────────────────────────────────────────────────────────

export type MagazineCommand =
  | { type: 'element.setText'; target: ElementSelector; content: string }
  | { type: 'element.setStyle'; target: ElementSelector; style: TextStylePatch }
  | { type: 'element.move'; target: ElementSelector; box: BoxPatch }
  | { type: 'element.setImage'; target: ElementSelector; url: string; assetId: string; alt?: string }
  | { type: 'element.delete'; target: ElementSelector }
  | { type: 'element.add'; pageId: string; element: NewElement }
  | { type: 'page.setBackground'; pageId: string; background: PageBackground };

export type CommandType = MagazineCommand['type'];

// ── Batches ───────────────────────────────────────────────────────────────────

export interface CommandBatch {
  /** What the user asked for, in their terms — this names the undo entry. */
  label: string;
  /** Who authored it. Agent batches are staged for review; manual ones are not. */
  origin: 'agent' | 'manual';
  commands: MagazineCommand[];
}

/** Why a batch was refused. Reported BEFORE anything is written. */
export type CommandFailure =
  /** A selector matched no element. Not an error for every command — see `strict`. */
  | 'no-match'
  /** A page or element id does not exist. */
  | 'not-found'
  /** A target element is locked and the command does not unlock it. */
  | 'locked'
  /** The resulting element failed the write pipeline's validation. */
  | 'invalid'
  /** A page would exceed MAX_ELEMENTS_PER_PAGE. */
  | 'limit'
  /** A page changed under us — the rev check failed. */
  | 'conflict'
  /** The command is declared but not implemented yet (see the reserved set). */
  | 'unsupported';

/** One page the batch changed, and what it took to change it. */
export interface AppliedPage {
  pageId: string;
  revBefore: number;
  revAfter: number;
  /** How many of the batch's commands touched this page. */
  commands: number;
}

export interface BatchResult {
  ok: boolean;
  /** The recorded batch, which is also the undo handle. */
  batchId: string;
  label: string;
  applied: AppliedPage[];
  failure?: { reason: CommandFailure; detail: string };
  /**
   * Set when a write failed PART WAY through a multi-page batch and the pages
   * already written were reverted. `false` here means the revert itself failed,
   * which is the one state a human has to look at.
   */
  rolledBack?: boolean;
}
