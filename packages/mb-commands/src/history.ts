// ---------------------------------------------------------------------------
// Undo and redo.
//
// An entry holds BOTH directions: the inverse the handler produced, and the
// command that re-applies it. Redo replays the original rather than inverting
// the inverse, because inverting twice is not guaranteed to land on the same
// bytes — see the inverse-payload note in types.ts.
//
// Coalescing keeps the FIRST inverse and the LAST command. A drag emits dozens
// of `item.move`; merging them that way means undo returns to before the gesture
// began and redo lands on the final position. Keeping the last inverse instead
// would undo one pixel of a hundred-pixel drag, which reads as broken.
// ---------------------------------------------------------------------------

import type { Command } from './types.js';

/** Commands closer together than this, sharing a key, become one entry. */
const COALESCE_WINDOW_MS = 500;

/**
 * How far back undo reaches.
 *
 * Entries are small — a command and its inverse — but a group resize's inverse
 * carries a snapshot per descendant, so the tail is trimmed rather than kept
 * forever.
 */
const MAX_DEPTH = 100;

export interface HistoryEntry {
  /** Reverses the change. */
  inverse: Command;
  /** Re-applies it. The original command, not the inverse of the inverse. */
  redo: Command;
  coalesceKey?: string;
  /** Milliseconds, from the caller. This module reads no clock (FOUNDATION §6.3). */
  at: number;
}

let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];

/**
 * Records a change, merging it into the previous entry when it coalesces.
 *
 * Recording always clears the redo stack: once history diverges, the old forward
 * path describes a document that no longer exists.
 */
export function record(command: Command, inverse: Command, at: number): void {
  redoStack = [];

  const top = undoStack[undoStack.length - 1];
  const key = command.coalesceKey;

  if (
    key !== undefined &&
    top !== undefined &&
    top.coalesceKey === key &&
    at - top.at <= COALESCE_WINDOW_MS
  ) {
    top.redo = command;
    top.at = at;
    return;
  }

  const entry: HistoryEntry = { inverse, redo: command, at };
  if (key !== undefined) entry.coalesceKey = key;
  undoStack.push(entry);

  if (undoStack.length > MAX_DEPTH) undoStack = undoStack.slice(undoStack.length - MAX_DEPTH);
}

export function takeUndo(): HistoryEntry | null {
  return undoStack.pop() ?? null;
}

export function takeRedo(): HistoryEntry | null {
  return redoStack.pop() ?? null;
}

export function pushUndo(entry: HistoryEntry): void {
  undoStack.push(entry);
}

export function pushRedo(entry: HistoryEntry): void {
  redoStack.push(entry);
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

/** For the shell's undo/redo affordances, and for tests. */
export function historyDepth(): { undo: number; redo: number } {
  return { undo: undoStack.length, redo: redoStack.length };
}

/** Called when a different magazine is opened. History does not survive that. */
export function clearHistory(): void {
  undoStack = [];
  redoStack = [];
}
