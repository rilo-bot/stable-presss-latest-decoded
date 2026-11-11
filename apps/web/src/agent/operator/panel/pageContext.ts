// ---------------------------------------------------------------------------
// Page-context derivation — shared by both Stablehand modes.
//
// Turns the current path into a small hint the assistant can use ("this horse",
// "this magazine"). The agent resolves names/details itself via its tools using
// the entity id. It lived inside AgentWidget.tsx; it moved here when the panel
// split into Concierge + Operator so both transports (and the step timeline,
// which names pages the Operator opened) read the SAME titles.
// ---------------------------------------------------------------------------

export interface PageContext {
  path: string;
  title: string;
  entity?: { type: string; id: string };
}

export function describePage(pathname: string): PageContext {
  const seg = pathname.split('/').filter(Boolean);
  const titleFor: Record<string, string> = {
    '': 'Home',
    news: 'The News',
    bulletins: 'Print Bulletins',
    horses: 'Horse Register',
    articles: 'Article',
    tipping: 'Tipping Ring',
    podcast: 'The Stable Press Podcast',
    parties: 'Industry Directory',
    dashboard: 'Your Dashboard',
    orgs: 'Organisation',
    studio: 'Profile Studio',
    newsroom: 'Newsroom',
    'site-content': 'Site Content',
  };
  const entityType: Record<string, string> = {
    horses: 'horse',
    articles: 'article',
    parties: 'party',
    bulletins: 'bulletin',
    orgs: 'organisation',
    studio: 'party',
  };
  const root = seg[0] ?? '';
  // Production System (the staff CMS) — one route per sidebar screen, plus the
  // full-screen magazine editors underneath it.
  if (root === 'production-system') {
    const screenTitles: Record<string, string> = {
      overview: 'Overview', workflow: 'Workflow Board', pipeline: 'Pipeline Map',
      'all-stories': 'All Stories', 'horse-records': 'Horse Records', 'my-assets': 'My Media Assets',
      compensation: 'My Compensation', horses: 'Horses Register', people: 'People Register',
      'media-records': 'Media Records', 'racing-records': 'Racing Records', team: 'Team Members',
      roles: 'Roles & Permissions', analytics: 'Analytics', settings: 'Settings',
      'magazine-v2': 'Magazine Builder',
    };
    const sub = seg[1] ?? '';
    const ctx: PageContext = {
      path: pathname,
      title: sub && screenTitles[sub] ? `Production System — ${screenTitles[sub]}` : 'Production System',
    };
    if (sub === 'magazine-v2' && seg[2]) ctx.entity = { type: 'magazine', id: seg[2] };
    return ctx;
  }
  const ctx: PageContext = { path: pathname, title: titleFor[root] ?? 'Stable Press' };
  if (seg.length >= 2 && entityType[root]) {
    ctx.entity = { type: entityType[root], id: seg[1] };
  }
  return ctx;
}

/** Short name for a page the Operator opened — the last part of the title
 *  ("Production System — Magazine Builder" → "Magazine Builder"). */
export function shortPageName(path: string): string {
  const clean = path.split(/[?#]/)[0] || '/';
  const ctx = describePage(clean);
  const short = ctx.title.split(' — ').pop() ?? ctx.title;
  // An editor under the builder reads better as "the magazine editor".
  if (ctx.entity?.type === 'magazine') return 'the magazine editor';
  if (ctx.entity && short !== 'Stable Press') return `${short} page`;
  return short;
}
