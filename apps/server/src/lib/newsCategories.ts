// ---------------------------------------------------------------------------
// The news category taxonomy, server side.
//
// The browser owns the DISPLAY of these categories (icon, section, blurb) in
// apps/web/src/pages/news-index/constants.tsx. This file holds only the keys and
// a one-line description — what a model needs to pick the right one.
//
// It exists because the Instant agent must choose a category, and a model given
// a free string invents its own taxonomy ("Racing News", "Breeding") that then
// matches no category tab on the public site and silently disappears from
// /news. The keys below are fed to the model as a closed enum instead.
//
// Keep in step with CATEGORIES in the web file above — the keys are the contract.
// ---------------------------------------------------------------------------

export interface NewsCategoryMeta {
  key: string
  label: string
  /** What belongs here — the line the model reads when choosing. */
  guidance: string
}

export const NEWS_CATEGORIES: NewsCategoryMeta[] = [
  // News
  { key: 'race-reports', label: 'Race Reports', guidance: "Post-race analysis, results, and stewards' decisions from the track." },
  { key: 'industry-news', label: 'Industry News', guidance: 'Transfers, injuries, ownership changes, and industry developments.' },
  { key: 'morning-edition', label: 'Morning Edition', guidance: 'Stable reports, scratchings, and early market moves — the daily dispatch.' },
  // Analysis
  { key: 'form-guide', label: 'Form Guide', guidance: 'Speed ratings, class assessments, and sectional analysis.' },
  { key: 'track-notes', label: 'Track Notes', guidance: 'Going reports, track configurations, and bias assessments.' },
  { key: 'bloodstock', label: 'Bloodstock', guidance: 'Pedigree analysis, stallion updates, sales, and breeding trends.' },
  // Interviews
  { key: 'trainer-profiles', label: 'Trainer Profiles', guidance: 'Conversations with, and profiles of, trainers.' },
  { key: 'jockey-desk', label: 'Jockey Desk', guidance: 'Rider perspectives, riding patterns, and form from the saddle.' },
  { key: 'owner-stories', label: 'Owner Stories', guidance: 'The people behind the horses — partnerships, syndicates, ambitions.' },
]

/** Non-empty tuple of the keys, for a zod enum. */
export const NEWS_CATEGORY_KEYS = NEWS_CATEGORIES.map((c) => c.key) as [string, ...string[]]

export function isNewsCategory(v: unknown): v is string {
  return typeof v === 'string' && NEWS_CATEGORIES.some((c) => c.key === v)
}

/** The taxonomy as prompt lines: `key — guidance`. */
export function categoryGuidanceList(): string {
  return NEWS_CATEGORIES.map((c) => `  ${c.key} — ${c.label}: ${c.guidance}`).join('\n')
}
