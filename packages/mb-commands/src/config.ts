import type { CommandStore } from './types.js';

/**
 * Everything environmental, injected.
 *
 * `packages/mb-*` contain no `import.meta.env`, no `process.env`, no `window`
 * (FOUNDATION §6.3) — they run in the browser, in Node tests, and potentially in
 * the worker, and a bundler-specific global is a syntax-level failure in two of
 * those three.
 */
export interface DispatchConfig {
  /** Where the magazine lives. Injected because mb-store imports THIS package. */
  store: CommandStore;
  /**
   * Run the full `validateMagazine` after every command.
   *
   * Off in production: the cheap structural checks run there instead, always.
   */
  validateFully: boolean;
}

let current: DispatchConfig | null = null;

export function configureDispatch(next: DispatchConfig): void {
  current = next;
}

/**
 * Throws rather than returning null when unconfigured.
 *
 * Dispatching before a store exists is a wiring bug in the shell, not a
 * condition to degrade around — a silent fallback here would swallow every
 * write in the application (RULES §1.1).
 */
export function getConfig(): DispatchConfig {
  if (current === null) {
    throw new Error('configureDispatch() has not been called — dispatch has no store');
  }
  return current;
}

/** Test hook. Returns the registry and history to an empty state's expectations. */
export function resetConfig(): void {
  current = null;
}
