// ---------------------------------------------------------------------------
// dispatch() — the only write path to a magazine (ADR-003, FWD-01).
//
// The pipeline, in order:
//
//   1. find the handler          unknown type -> rejected, not thrown
//   2. produce() through Immer   the handler mutates a draft; the base is safe
//   3. validateStructure         ALWAYS, in every build (FOUNDATION §5.8)
//   4. validateMagazine          development and tests only
//   5. commit                    to the injected store
//   6. record                    unless this is an undo or a redo
//
// Steps 3 and 4 come before the commit for a reason. Immer protects against a
// handler that THROWS — the draft is discarded and the base is untouched. It
// does nothing about a handler that returns normally having made a wrong change,
// and that is the failure that corrupts a document. Validating before committing
// means an invalid magazine never reaches the store, so the error names the
// command that caused it instead of surfacing later somewhere unrelated.
// ---------------------------------------------------------------------------

import { produce } from 'immer';
import type { Magazine, ValidationError } from '@rilo/mb-schema';
import { validateMagazine, validateStructure } from '@rilo/mb-schema';
import { getConfig } from './config.js';
import { InvariantError } from './errors.js';
import { getHandler } from './registry.js';
import * as history from './history.js';
import type { Command, CommandApplied, CommandOutcome, DispatchResult } from './types.js';
import { isRejected } from './types.js';

function describe(errors: readonly ValidationError[]): string[] {
  return errors.map((error) => `${error.code} at ${error.path}: ${error.message}`);
}

interface Applied {
  /** Narrowed — a rejection never reaches here, so `inverse` and `dirty` are real. */
  outcome: CommandApplied;
  next: Magazine;
}

/**
 * Runs a command against the current document without committing anything.
 *
 * Separated from `dispatch` because undo and redo need the same pipeline with
 * recording switched off.
 */
function apply(command: Command): Applied | { rejected: string } {
  const { store, validateFully } = getConfig();

  const handler = getHandler(command.type);
  if (handler === undefined) {
    // A rejection rather than a throw: FWD-02 has the AI phase emitting commands,
    // and an unrecognised type from a model is bad data, not a broken program.
    return { rejected: `There is no command called "${command.type}"` };
  }

  // Immer cannot cancel a produce, so a rejecting handler still returns a draft.
  // The captured outcome decides whether anything is done with it. Held on an
  // object because a `let` assigned only inside the recipe narrows to null —
  // the compiler cannot see that the callback ran.
  const captured: { outcome: CommandOutcome | null } = { outcome: null };

  const next = produce(store.current, (draft) => {
    captured.outcome = handler(draft, command.payload);
  });

  const outcome = captured.outcome;
  if (outcome === null) {
    throw new InvariantError(`handler for "${command.type}" returned nothing`);
  }
  if (isRejected(outcome)) {
    return { rejected: outcome.rejected };
  }

  const errors = validateFully ? validateMagazine(next) : validateStructure(next);
  if (errors.length > 0) {
    throw new InvariantError(
      `"${command.type}" produced an invalid magazine`,
      describe(errors),
    );
  }

  return { outcome, next };
}

function isRejection(result: Applied | { rejected: string }): result is { rejected: string } {
  return 'rejected' in result;
}

/**
 * Applies a command, or explains why it did not.
 *
 * `{ ok: false }` is an ordinary outcome — a locked item, an id that no longer
 * resolves. The reason is written for the user (GL-12), so show it; doing
 * nothing silently reads as broken software.
 */
export function dispatch(command: Command): DispatchResult {
  const result = apply(command);
  if (isRejection(result)) return { ok: false, reason: result.rejected };

  const { store } = getConfig();
  store.commit(result.next);
  history.record(command, result.outcome.inverse, Date.now());

  return { ok: true, dirty: result.outcome.dirty };
}

/**
 * Applies a command WITHOUT recording it.
 *
 * Undo and redo move an entry between the stacks themselves. Recording here
 * would push the inverse as a new entry, and the stack would grow with every
 * undo instead of shrinking.
 */
function applySilently(command: Command): DispatchResult {
  const result = apply(command);
  if (isRejection(result)) return { ok: false, reason: result.rejected };

  const { store } = getConfig();
  store.commit(result.next);

  return { ok: true, dirty: result.outcome.dirty };
}

export function undo(): DispatchResult {
  const entry = history.takeUndo();
  if (entry === null) return { ok: false, reason: 'There is nothing to undo' };

  const result = applySilently(entry.inverse);
  if (!result.ok) {
    // Put it back. An undo that fails must not also lose the entry, or the user
    // is left unable to reach a state they can still see behind them.
    history.pushUndo(entry);
    return result;
  }

  history.pushRedo(entry);
  return result;
}

export function redo(): DispatchResult {
  const entry = history.takeRedo();
  if (entry === null) return { ok: false, reason: 'There is nothing to redo' };

  const result = applySilently(entry.redo);
  if (!result.ok) {
    history.pushRedo(entry);
    return result;
  }

  history.pushUndo(entry);
  return result;
}
