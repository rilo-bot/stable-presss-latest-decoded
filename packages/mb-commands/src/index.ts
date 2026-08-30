// ---------------------------------------------------------------------------
// mb-commands — the only write path to a magazine (ADR-003, FWD-01).
//
// Nothing mutates a document except through `dispatch()`. That is what makes
// undo work everywhere for free, what lets the AI phase drive the editor by
// emitting the same commands a person's clicks produce (FWD-02), and what keeps
// "why did this change?" answerable.
//
// Imports mb-schema only. `mb-store` imports THIS package, so the store arrives
// through `configureDispatch` rather than being imported back — see CommandStore.
// ---------------------------------------------------------------------------

export type {
  Command,
  CommandApplied,
  CommandHandler,
  CommandOutcome,
  CommandRejected,
  CommandStore,
  ConnectBoxPayload,
  CreateItemPayload,
  DeleteItemPayload,
  DeleteTextPayload,
  DisconnectBoxPayload,
  DispatchResult,
  FrameSnapshot,
  InsertTextPayload,
  MergeParagraphPayload,
  MoveItemPayload,
  NewItem,
  ReorderItemPayload,
  ResizeItemPayload,
  RotateItemPayload,
  SetLockedPayload,
  SetPropsPayload,
  SplitParagraphPayload,
} from './types.js';
export { isRejected } from './types.js';

export type { DispatchConfig } from './config.js';
export { configureDispatch, resetConfig } from './config.js';

export { InvariantError } from './errors.js';

export type { ErasedHandler } from './registry.js';
export { clearRegistry, registerCommand, registeredCommandTypes } from './registry.js';

export { dispatch, redo, undo } from './dispatch.js';

export type { HistoryEntry } from './history.js';
export { canRedo, canUndo, clearHistory, historyDepth } from './history.js';

export { FOUNDATION_COMMANDS, registerFoundationCommands } from './commands/index.js';
