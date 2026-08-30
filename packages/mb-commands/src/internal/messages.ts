// ---------------------------------------------------------------------------
// Rejection text.
//
// Every one of these reaches the user (GL-12 — never silently do nothing), so
// they obey the Section 9 vocabulary: no "item", no "entity", no "thread", no
// "invariant". Kept together so the whole set can be read as prose and checked
// against that vocabulary in one sitting, rather than being scattered across
// fourteen handlers where each one looks fine alone.
// ---------------------------------------------------------------------------

export const MISSING = 'That is no longer in this magazine';
export const LOCKED = 'This is locked. Unlock it before changing it.';
export const LOCKED_IN_GROUP = 'Something in this group is locked. Unlock it first.';
export const MISSING_PAGE = 'That page is no longer in this magazine';
export const MISSING_TEXT = 'That piece of text is no longer in this magazine';
export const NOT_A_TEXT_BOX = 'That is not a text box';
export const CHANGED_SINCE = 'This has changed since then, so it cannot be put back';
export const NO_PLACE = 'Could not work out where to put this';
