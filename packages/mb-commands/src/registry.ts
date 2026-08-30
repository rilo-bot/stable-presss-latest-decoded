import type { Magazine } from '@rilo/mb-schema';
import type { CommandHandler, CommandOutcome } from './types.js';

/**
 * A handler with its payload type erased, for storage.
 *
 * `never` rather than `any` or `unknown`, and it is not a trick: parameters are
 * contravariant, so a `CommandHandler<MovePayload>` IS assignable to a function
 * accepting `never` — which means registration needs no cast at all and stays
 * fully type-checked at each call site.
 */
type StoredHandler = (draft: Magazine, payload: never) => CommandOutcome;

/** What a caller can actually invoke. See the note in `getHandler`. */
export type ErasedHandler = (draft: Magazine, payload: unknown) => CommandOutcome;

const registry = new Map<string, StoredHandler>();

/**
 * Register a command type.
 *
 * Throwing on a duplicate is how two lanes choosing the same name surfaces
 * immediately rather than weeks later, when one had silently overwritten the
 * other.
 */
export function registerCommand<T>(type: string, handler: CommandHandler<T>): void {
  if (registry.has(type)) {
    throw new Error(`Command already registered: ${type}`);
  }
  registry.set(type, handler);
}

/**
 * The handler for a command type, callable with an unknown payload.
 *
 * The single type assertion in this package, and it is the erasure boundary: a
 * registry maps one string to handlers whose payload types differ, and no type
 * can express "this string's handler takes exactly this payload". The
 * correspondence is checked where it can be — at `registerCommand`, against the
 * handler's own declared payload — and asserted once here rather than pushing
 * `any` out into every caller.
 */
export function getHandler(type: string): ErasedHandler | undefined {
  return registry.get(type) as ErasedHandler | undefined;
}

export function registeredCommandTypes(): string[] {
  return [...registry.keys()].sort();
}

/** Test hook. Lanes never call this. */
export function clearRegistry(): void {
  registry.clear();
}
