// ---------------------------------------------------------------------------
// Magazine Builder v2 — how much of a source document reaches each model call.
//
// These three numbers used to be bare literals at their call sites, and one of
// them was written TWICE on adjacent lines: planIssue asked
// `isTruncated(source, 14000)` whether to warn the model it was seeing a sample,
// then `retrieveSource(source, { maxChars: 14000 })` to build it. Drift between
// those two literals would have been silent and exactly backwards — the prompt
// claiming a whole document while sending an excerpt of it.
//
// One name per budget, so a change is a change everywhere it means anything.
// ---------------------------------------------------------------------------

/** Character budgets for the source excerpt in each kind of prompt. */
export const SOURCE_BUDGET = {
  /** Whole-issue planner: a representative spread across the WHOLE document, so
   *  the running order reflects all of it rather than its opening pages. */
  plan: 14_000,
  /** One page draft: the passages most relevant to that page's own intent. */
  page: 6_000,
  /** The in-studio page agent (chat), which works one page at a time. */
  chat: 8_000,
} as const;

/**
 * Characters the DOCUMENT MAP may use in the planner prompt (sourceOutline.ts).
 *
 * Its own budget, on top of SOURCE_BUDGET.plan rather than inside it, because the
 * two buy different things: the excerpt buys detail about part of the document, the
 * map buys the shape of all of it. Taking the map out of the excerpt budget would
 * mean paying for breadth by giving up the depth that makes a page worth reading.
 *
 * 3,000 characters is roughly seventy mapped pages at full length, and far more
 * once thinning kicks in — enough to map any real document.
 */
export const OUTLINE_BUDGET = 3_000;

/**
 * NOT here yet, deliberately: the two INTAKE caps — the 60k slice in
 * POST /issues/generate and the 80k slice in the ingest response. They live in
 * routes owned by other work in flight this week, and Phase 2 removes both
 * outright when the document becomes a stored object with chunk rows instead of
 * a string on the wire. Centralising them now would mean adding a constant whose
 * only future is deletion.
 */
