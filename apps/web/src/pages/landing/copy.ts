/**
 * Every static string on the front page, in one file.
 *
 * WHY ONE FILE. Phase 2 (docs/LANDING-PAGE-RESTRUCTURE.md §7) swaps some of these
 * blocks for live data and promotes others into an admin-editable `siteContent`
 * collection. Keeping the strings out of the JSX makes that a swap rather than a
 * hunt through six components.
 *
 * THE RULE FOR EVERYTHING IN HERE: it must be TRUE TODAY, and checkable.
 *
 * That rule is why there are no testimonials, no reader numbers, no awards, no
 * partner logos and no founding date below. Not because those blocks would not
 * look good — because we do not have them, and this repo has removed fabricated
 * data from the public site three times already (see docs/FAKE-DATA-REMOVED.md and
 * the memory note `fake-data-review`). A placeholder quote is a fabricated quote
 * the moment someone screenshots the page.
 *
 * Where a claim is checkable, the check is written beside it as a comment. If you
 * edit a line here, edit its check too — or delete the claim.
 */

/* ── Block 4 · What Stable Press is ───────────────────────────────────────── */

export const MANIFESTO = {
  kicker: 'What Stable Press is',
  /** Matches the site description in Landing.tsx's usePageMeta call. */
  heading: 'The record of Australian and New Zealand thoroughbred racing.',
  /**
   * Three sentences, each describing something a visitor can verify on this site
   * within two clicks. No audience size, no history, no superlatives.
   */
  body: [
    'Every meeting we attend is written up, bylined and dated.',
    'Every horse we cover keeps a profile, and the owners, trainers and jockeys behind it are named in the register.',
    'Nothing reaches this page without an editor approving it first.',
  ],
  pillars: [
    {
      name: 'Report',
      /** The three `news` categories in pages/news-index/constants.tsx. */
      line: 'Race reports, industry news and the morning dispatch — filed by the desk, dated, and credited to whoever wrote them.',
      to: '/news',
      linkLabel: 'The newsroom',
      /** Governed by the same Website Customisation switch as the nav tab. */
      section: 'news',
    },
    {
      name: 'Analyse',
      line: 'Form guides, track notes and bloodstock, alongside interviews with the trainers, jockeys and owners doing the work.',
      to: '/news?section=analysis',
      linkLabel: 'Analysis & interviews',
      section: 'news',
    },
    {
      name: 'Record',
      line: 'A dossier for every horse on our books, and a directory of the people behind each one — kept as a register, not a highlights reel.',
      to: '/horses',
      linkLabel: 'The register',
      section: 'horses',
    },
  ],
} as const;

/* ── Block 7 · What's inside ───────────────────────────────────────────────
   The six cards take their descriptions from PUBLIC_NAV_SECTIONS in
   types/siteSettings.ts — text that already exists and that an admin already
   reads on the visibility switch. Nothing to write here; only the band's own
   heading lives in this file. */

export const SECTIONS_BAND = {
  kicker: "What's inside",
  heading: 'Six sections, one paper.',
  /** True by construction: the cards are filtered by the same switches. */
  note: 'Each section is a switch an editor can turn off. What you see here is what the site is actually running.',
} as const;

/* ── Block 13 · How the desk works ─────────────────────────────────────────
   The five stages are ARTICLE_STATUSES in types/article.ts —
   draft → submitted → approved → scheduled → published. This block is a
   reader-facing description of that pipeline, not a claim about it. */

export const DESK = {
  kicker: 'How the desk works',
  heading: 'Five stages between a writer and this page.',
  standfirst:
    'Racing coverage is only worth as much as the process behind it. Ours is short, and every story goes through all of it.',
  stages: [
    {
      status: 'draft',
      name: 'Drafted',
      line: 'A writer files against a real meeting, horse or person — not a press release.',
    },
    {
      status: 'submitted',
      name: 'Submitted',
      line: 'It goes to an editor. A writer cannot put their own copy on the site.',
    },
    {
      status: 'approved',
      name: 'Approved',
      line: 'An editor signs it off, or sends it back with changes. Nothing skips this.',
    },
    {
      status: 'scheduled',
      name: 'Scheduled',
      line: 'It is given a publication date, so the record shows when we knew something.',
    },
    {
      status: 'published',
      name: 'Published',
      line: 'It appears here with a byline, a date and a reading time. Corrections are edits to the record, not deletions.',
    },
  ],
} as const;

/* ── Block 14 · What an account gets you, and the FAQ ──────────────────────
   REWRITTEN FROM THE OLD SIDEBAR LIST, which promised "Tipping ring entry"
   (the ring is built but not open — see the memory note `landing-navbar-rebuild`)
   and a "Fortnightly print bulletin" (no cadence exists anywhere in the code or
   the data). Both are gone. Every line below maps to something an account
   demonstrably does today. */

export const ACCOUNT = {
  kicker: 'Membership',
  heading: 'An account is a name, an email and a six-digit code.',
  standfirst:
    'There is no card, no tier and no paywall. Signing up is worth doing because of what it lets you do, not what it unlocks.',
  /** Each maps to a real, shipped surface. */
  gets: [
    {
      name: 'React to what you read',
      /** components/ReactionBar.tsx on stories, blogs, horses and people. */
      line: 'The reaction scales at the foot of every story, post and profile are signed-in only — so the counts mean something.',
    },
    {
      name: 'Join the comments',
      /** components/comments/CommentsSection.tsx, moderated in the newsroom. */
      line: 'Comment under any story. Threads are moderated by the desk, not by volume.',
    },
    {
      name: 'Claim your entry in the register',
      /** Claiming moved to the Dashboard — see the note atop pages/Signup.tsx. */
      line: 'If you train, ride or own and you are already in our register, you can claim your own entry from your dashboard.',
    },
    {
      name: 'Your own dashboard',
      /** pages/Dashboard.tsx scopes to authorisedHorseIds(currentUser). */
      line: 'The horses you are connected to, gathered in one place.',
    },
  ],
  faq: [
    {
      q: 'Does it cost anything?',
      a: 'No. There is no paid tier today. If that changes it will be announced here before anything is charged.',
    },
    {
      q: 'Do I get the bulletin in the post?',
      a: 'No. The bulletins are print editions read on this site, page by page. Nothing is mailed.',
    },
    {
      q: 'What is the tipping ring?',
      a: 'A coins-based tipping competition. It is built and it works, but it is not open yet — so we are not advertising entry to it.',
    },
    {
      q: 'How do I get a horse or a person added?',
      a: 'The register is maintained by the desk. Write to us and tell us what is missing; we verify before anything goes in.',
    },
  ],
} as const;

/* ── Block 15 · The membership band ────────────────────────────────────────
   "Premium Membership" was the old kicker on a band advertising a free account.
   The heading kept "the racing record that serious turf followers trust", which
   is a claim about our readers that we have no measurement of. Both replaced. */

export const JOIN_BAND = {
  kicker: 'Free to join',
  heading: 'Read it, react to it, argue with it.',
  standfirst:
    'Create an account and the rest of the site opens up: reactions, comments, and your own entry in the register if you are in it.',
  primaryCta: 'Create an account',
  secondaryCta: 'Browse the newsroom',
} as const;

/* ── Block 16 · Sponsors ───────────────────────────────────────────────────
   Real sponsors, from the sponsors collection. Only the band's framing is
   static, and the enquiries address is deliberately NOT repeated here — it
   appears once, in the sponsor band, and nowhere else on the page. */

export const SPONSORS_BAND = {
  kicker: 'Partners',
  heading: 'Proudly supported by',
  empty: 'No partners listed yet.',
  /**
   * VERIFY THIS RESOLVES. Flagged as D9 in the restructure doc — this address is
   * hardcoded and has never been confirmed to receive mail. If it does not, take
   * it out rather than leave a dead contact on the front page, the same way the
   * placeholder ABN came out of the footer.
   */
  enquiries: 'press@stablepress.com.au',
  enquiriesLabel: 'Sponsorship enquiries',
} as const;

/* ── Block 17 · Footer ─────────────────────────────────────────────────────
   The brand paragraph read "Prestige racing journalism, horse profiles, tipping
   competitions, and expert analysis — curated for the serious turf follower."
   Three problems in one sentence: it advertised the tipping competitions this page
   deliberately does not advertise, and "prestige" and "curated for the serious turf
   follower" are claims about us and about our readers rather than descriptions of
   what is here. */

export const FOOTER = {
  wordmark: 'Stable Press',
  strapline: 'Thoroughbred Racing Record',
  blurb:
    'Race reports, form analysis and interviews, plus the register of the horses and the people behind them — across Australian and New Zealand thoroughbred racing.',
  /** A brand line, and honest as one: it claims nothing measurable. */
  signoff: 'The form is everything. The rest is conversation.',
  /**
   * The placeholder ABN "00 000 000 000" was removed from beside the copyright
   * line. Put the real one here once it is registered — never a formatted stand-in,
   * which reads as a legal identifier and is not one.
   */
  legalName: 'Stable Press Pty Ltd',
} as const;

/* ── Shared ────────────────────────────────────────────────────────────────── */

/** The masthead's skeleton and both empty heroes share this. */
export const HERO = {
  /**
   * Shown ONLY when loading has finished and there is genuinely nothing
   * published. It is never the loading state — that was the bug (D1).
   */
  emptyHeading: 'The premium voice of thoroughbred racing',
  emptyBody:
    'Breaking news, expert analysis, exclusive interviews and in-depth features from the world’s greatest racetracks.',
  /**
   * Shown when the request for stories FAILED, which is a different fact from
   * "nothing is published" and must not borrow its copy. The old behaviour was a
   * red "HTTP 500" toast over a front page claiming to be a brand-new publication.
   */
  failedHeading: 'Today’s stories did not load',
  failedBody:
    'Something went wrong at our end, not yours — the newsroom is still there. Reload the page, or read on below.',
  failedCta: 'Reload',
  nextUpLabel: 'Next up',
} as const;
