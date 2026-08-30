// ---------------------------------------------------------------------------
// The fourteen foundation commands, and their names.
//
// Handlers are plain functions in their own files and register HERE, not at the
// bottom of the file that defines them. Two reasons: a handler stays testable
// without a registry, and importing this one module is the whole registration —
// there is no "did the file get imported" failure mode, which is exactly how a
// command silently goes missing in a lazily-bundled app.
//
// Lanes register their own commands alongside these. Lane 1 owns the arrange
// operations (`items.align`, `items.group`, …); Lane 2 owns formatting and box
// configuration (`text.setLook`, `box.setColumns`, …). Neither writes any of
// these fourteen — they maintain invariants 2 to 4 and 10, and one lane getting
// that wrong is a corrupted document for everybody.
// ---------------------------------------------------------------------------

import { registerCommand } from '../registry.js';
import { connectBox } from './connectBox.js';
import { createItem } from './createItem.js';
import { deleteItem } from './deleteItem.js';
import { deleteText } from './deleteText.js';
import { disconnectBox } from './disconnectBox.js';
import { insertText } from './insertText.js';
import { mergeParagraph } from './mergeParagraph.js';
import { moveItem } from './moveItem.js';
import { reorderItem } from './reorderItem.js';
import { resizeItem } from './resizeItem.js';
import { rotateItem } from './rotateItem.js';
import { setLocked } from './setLocked.js';
import { setProps } from './setProps.js';
import { splitParagraph } from './splitParagraph.js';

/** The names, so a caller never has to spell one and lanes can check for clashes. */
export const FOUNDATION_COMMANDS = {
  createItem: 'item.create',
  deleteItem: 'item.delete',
  moveItem: 'item.move',
  resizeItem: 'item.resize',
  rotateItem: 'item.rotate',
  setProps: 'item.setProps',
  reorderItem: 'item.reorder',
  setLocked: 'item.setLocked',
  insertText: 'text.insert',
  deleteText: 'text.delete',
  splitParagraph: 'text.splitParagraph',
  mergeParagraph: 'text.mergeParagraph',
  connectBox: 'text.connectBox',
  disconnectBox: 'text.disconnectBox',
} as const;

let registered = false;

/**
 * Registers the fourteen. Idempotent, because the shell, the publish job and
 * every test file each want to be sure it has happened, and `registerCommand`
 * throws on a duplicate — deliberately, since two lanes picking one name is a
 * bug worth hearing about immediately.
 */
export function registerFoundationCommands(): void {
  if (registered) return;
  registered = true;

  registerCommand(FOUNDATION_COMMANDS.createItem, createItem);
  registerCommand(FOUNDATION_COMMANDS.deleteItem, deleteItem);
  registerCommand(FOUNDATION_COMMANDS.moveItem, moveItem);
  registerCommand(FOUNDATION_COMMANDS.resizeItem, resizeItem);
  registerCommand(FOUNDATION_COMMANDS.rotateItem, rotateItem);
  registerCommand(FOUNDATION_COMMANDS.setProps, setProps);
  registerCommand(FOUNDATION_COMMANDS.reorderItem, reorderItem);
  registerCommand(FOUNDATION_COMMANDS.setLocked, setLocked);
  registerCommand(FOUNDATION_COMMANDS.insertText, insertText);
  registerCommand(FOUNDATION_COMMANDS.deleteText, deleteText);
  registerCommand(FOUNDATION_COMMANDS.splitParagraph, splitParagraph);
  registerCommand(FOUNDATION_COMMANDS.mergeParagraph, mergeParagraph);
  registerCommand(FOUNDATION_COMMANDS.connectBox, connectBox);
  registerCommand(FOUNDATION_COMMANDS.disconnectBox, disconnectBox);
}

/** Test hook, paired with `clearRegistry`. Lanes never call this. */
export function resetFoundationRegistration(): void {
  registered = false;
}

export {
  connectBox,
  createItem,
  deleteItem,
  deleteText,
  disconnectBox,
  insertText,
  mergeParagraph,
  moveItem,
  reorderItem,
  resizeItem,
  rotateItem,
  setLocked,
  setProps,
  splitParagraph,
};
