/**
 * A handler produced an invalid magazine.
 *
 * Always a defect: a refusal a handler EXPECTS — a locked item, a merge with
 * nothing before it — returns `{ rejected }` and commits nothing. This is what
 * a bug in a handler looks like, and it throws so it is found next to its cause.
 *
 * In production the app's error boundary catches it and shows a plain-language
 * message (RULES §4.2). The magazine is untouched either way: the change was
 * never committed.
 */
export class InvariantError extends Error {
  public readonly errors: readonly string[];

  constructor(message: string, errors: readonly string[] = []) {
    super(`Invariant violated: ${message}`);
    this.name = 'InvariantError';
    this.errors = errors;
  }
}
