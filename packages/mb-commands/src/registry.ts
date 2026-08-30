import type { CommandHandler, CommandOutcome } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is
// heterogeneous by nature: it maps a string to a handler whose payload type is
// known only to its own module. `unknown` cannot be used, because a handler
// declared for a specific payload is not assignable to one taking `unknown`.
// Every registered handler is type-checked at its own registerCommand call.
type AnyHandler = CommandHandler<any>;

const registry = new Map<string, AnyHandler>();

/**
 * Register a command type.
 *
 * Throwing on a duplicate is how two lanes choosing the same name surfaces
 * immediately rather than weeks later, when one silently overwrote the other.
 */
export function registerCommand<T>(type: string, handler: CommandHandler<T>): void {
  if (registry.has(type)) {
    throw new Error(`Command already registered: ${type}`);
  }
  registry.set(type, handler);
}

export function getHandler(type: string): ((draft: never, payload: never) => CommandOutcome) | undefined {
  return registry.get(type) as ((draft: never, payload: never) => CommandOutcome) | undefined;
}

export function registeredCommandTypes(): string[] {
  return [...registry.keys()].sort();
}

/** Test hook. Lanes never call this. */
export function clearRegistry(): void {
  registry.clear();
}
