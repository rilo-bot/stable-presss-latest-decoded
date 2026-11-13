import type { CatalogSurface } from './types.js'

// ---------------------------------------------------------------------------
// Operator catalog — 'site' pack: the PUBLIC SITE and MEMBER AREA. See
// ./types.ts for the contract.
//
// Web side: apps/web/src/pages/operator-site/*.ts, each hook called by its page
// (Landing, NewsIndex, ArticleDetail, BlogIndex, BlogPost, PodcastHub,
// HorseProfiles, HorseDetail, Parties, PartyDetail, Bulletins, BulletinViewer,
// TippingRing, Dashboard, OrgDashboard) and by components/profile/
// OnboardingFocus.tsx for the onboarding steps. Names and arg shapes MUST match
// the zod schemas there.
//
// These share routes with core.ts (and profile.ts for the studios);
// renderCatalog merges by route and the LAST surface's title/who/purpose wins —
// this pack is last, so each purpose here is written to stand alone.
// The static prompt is near its budget: keep every line short.
// ---------------------------------------------------------------------------

const HIDEABLE = 'Anyone (public); hidden if staff switch the section off.'

const onboarding: CatalogSurface['actions'] = [
  { name: 'onboarding.read', description: 'Step on screen: title, fields + values, controls.', args: '{}' },
  {
    name: 'onboarding.completeStep',
    description: 'Fill the step: ALL fields in one call, by label ({"Sire":"X","Dam":"Y"}), or name = person to link. Advances once all are saved. Photo: upload to onboarding.photo-input.',
    args: '{ fields?: Record<string,string>; name?: string }',
  },
  { name: 'onboarding.next', description: 'Skip the current step (press Skip).', args: '{}' },
  { name: 'onboarding.close', description: 'Close the guided journey (entries stay saved).', args: '{}' },
]
const onboardingAnchors = ['onboarding.photo-input']

export const SURFACES: CatalogSurface[] = [
  {
    id: 'site-home',
    title: 'Home',
    route: '/',
    who: 'Anyone (public).',
    purpose: 'The public landing page: headlines, breaking-news ticker, latest blog posts, bulletins and episodes.',
    actions: [{ name: 'site.readHome', description: 'Headlines, ticker, latest posts / editions / episodes.', args: '{}' }],
  },
  {
    id: 'site-news',
    title: 'The News',
    route: '/news',
    who: HIDEABLE,
    purpose: 'Index of published stories by section; each opens /articles/:id.',
    actions: [
      { name: 'site.readNews', description: 'Stories shown (with current search / section).', args: '{}' },
      { name: 'site.searchNews', description: 'Type into the News search box; returns matches.', args: '{ query: string }' },
    ],
  },
  {
    id: 'site-article',
    title: 'Story page',
    route: '/articles/:id',
    who: 'Anyone for a published story; staff also see drafts.',
    purpose: 'One published story with reactions and comments.',
    actions: [{ name: 'site.readArticle', description: 'Headline, byline, category, linked horses, body excerpt.', args: '{}' }],
  },
  {
    id: 'site-blog',
    title: 'Blog',
    route: '/blog',
    who: HIDEABLE,
    purpose: 'Public list of live blog posts; each opens /blog/:slug.',
    actions: [{ name: 'site.readBlog', description: 'Posts shown (title, author, excerpt, path).', args: '{}' }],
  },
  {
    id: 'site-blog-post',
    title: 'Blog post',
    route: '/blog/:slug',
    who: 'Anyone for a live post; drafts only for author and staff.',
    purpose: 'One blog post with reactions and comments.',
    actions: [{ name: 'site.readBlogPost', description: 'Title, author, sections, body excerpt.', args: '{}' }],
  },
  {
    id: 'site-podcast',
    title: 'The Stable Press Podcast',
    route: '/podcast',
    who: HIDEABLE,
    purpose: 'Published podcast episodes with a player.',
    actions: [{ name: 'site.readPodcast', description: 'Published episodes, newest first.', args: '{}' }],
  },
  {
    id: 'site-horses',
    title: 'Horse Register',
    route: '/horses',
    who: HIDEABLE,
    purpose: 'Search horses; followed ones show in My Stable (per-browser bookmarks).',
    actions: [
      { name: 'site.searchHorses', description: 'Type into the search (name/trainer/jockey/owner); returns matches.', args: '{ query: string }' },
      { name: 'horse.follow', description: 'Follow a horse (adds to My Stable).', args: '{ horse: string /* name or id */ }' },
      { name: 'horse.unfollow', description: 'Unfollow a horse.', args: '{ horse: string }' },
    ],
  },
  {
    id: 'site-horse-dossier',
    title: 'Horse dossier',
    route: '/horses/:id',
    who: HIDEABLE,
    purpose: "A horse's read-only public dossier: identity, pedigree, connections, form, media.",
    actions: [
      { name: 'horse.read', description: 'Identity, pedigree, racing, connections, form, studioPath.', args: '{}' },
      { name: 'horse.follow', description: 'Follow this horse.', args: '{ horse?: string }' },
      { name: 'horse.unfollow', description: 'Unfollow this horse.', args: '{ horse?: string }' },
    ],
  },
  {
    id: 'site-directory',
    title: 'Industry Directory',
    route: '/parties',
    who: HIDEABLE,
    purpose: 'People in racing (owners, trainers, jockeys, breeders, agents…): search box + role chips.',
    actions: [
      { name: 'site.searchDirectory', description: 'Name search + optional role chip; returns matches.', args: "{ query: string; role?: string /* e.g. 'trainer', 'all' */ }" },
    ],
  },
  {
    id: 'site-party',
    title: 'Party profile',
    route: '/parties/:id',
    who: HIDEABLE,
    purpose: "A person's read-only public profile and their horses.",
    actions: [{ name: 'site.readParty', description: 'Roles, profession, base, horses, studioPath if you manage it.', args: '{}' }],
  },
  {
    id: 'site-bulletins',
    title: 'Bulletins',
    route: '/bulletins',
    who: HIDEABLE,
    purpose: 'The newsstand of published magazine editions, newest first.',
    actions: [
      { name: 'bulletins.list', description: 'Published editions (id, title, edition, pages).', args: '{}' },
      { name: 'bulletins.open', description: 'Open an edition in the reader (id, title or edition).', args: '{ edition: string }' },
    ],
  },
  {
    id: 'site-bulletin-reader',
    title: 'Bulletin reader',
    route: '/bulletins/:id',
    who: HIDEABLE,
    purpose: 'Reads one edition page by page, with Download PDF.',
    actions: [
      { name: 'bulletins.read', description: 'Title, edition, page count, page in view.', args: '{}' },
      { name: 'bulletins.goToPage', description: 'Scroll to page N (1-based).', args: '{ page: number }' },
      { name: 'bulletins.downloadPdf', description: 'Press Download PDF; reports downloaded / still preparing.', args: '{}' },
    ],
  },
  {
    id: 'site-tipping',
    title: 'Tipping Ring',
    route: '/tipping',
    who: 'Anyone can view; tipping needs an account.',
    purpose: 'Virtual-coin tipping (no real money): one tip per open race; leaderboard by balance.',
    actions: [
      { name: 'tipping.read', description: 'Open/upcoming races + runners/odds, 10 latest settled, your tips, balance.', args: '{}' },
      { name: 'tipping.leaderboard', description: 'Top 20 tippers.', args: '{}' },
      { name: 'tipping.placeTip', description: 'Back a runner (name or barrier no.) with coins; stakes coins.', args: '{ race: string; horse: string; coins: number /* int 1-9999 */ }', confirms: true },
    ],
  },
  {
    id: 'member-dashboard',
    title: 'Dashboard',
    route: '/dashboard',
    who: 'Any signed-in user.',
    purpose: 'Member home: racing roles, My Stable, organisations. Claiming shows only to non-staff without a claimed entry; Add a horse needs one. My Profile = member.read myProfilePath.',
    actions: [
      { name: 'member.read', description: 'Roles, My Stable, followed horses, organisations, what you can do here.', args: '{}' },
      { name: 'member.claimRole', description: 'Claim your register entry under a role (immediate).', args: '{ role: string; entry: string /* name */ }', confirms: true },
      { name: 'member.registerHorse', description: 'With name: Quick form + save. Without: Guided studio (then onboarding.*).', args: '{ name?: string; sex?: string; dob?: string /* YYYY-MM-DD */; colour?: string; country?: string; sire?: string; dam?: string }' },
      { name: 'member.createOrg', description: 'Create an organisation and open it.', args: '{ name: string }' },
    ],
  },
  {
    id: 'member-org',
    title: 'Organisation',
    route: '/orgs/:id',
    who: 'Members of that organisation; owners and managers add members, only owners remove.',
    purpose: "An organisation's members (owner / manager / member), managed parties and horses.",
    actions: [
      { name: 'org.read', description: 'Your role, members, managed parties, horses.', args: '{}' },
      { name: 'org.addMember', description: 'Add by email (needs an account); only owners grant manager/owner. role owner TRANSFERS ownership (you become manager).', args: "{ email: string; role?: 'member'|'manager'|'owner' }", confirms: true },
      { name: 'org.removeMember', description: 'Remove a member (email or name); never yourself.', args: '{ member: string }', confirms: true },
    ],
  },
  {
    id: 'onboarding-horse',
    title: 'Horse Studio',
    route: '/studio/horse/:id',
    who: "Staff, or the horse's owner/trainer.",
    purpose:
      'Editable horse profile + Stable Studio assistant (profile.*; saves directly, profile.undo reverts). A new horse shows the onboarding card (photo, basics, pedigree, then each connection): use onboarding.*.',
    actions: onboarding,
    anchors: onboardingAnchors,
  },
  {
    id: 'onboarding-person',
    title: 'Profile Studio (person)',
    route: '/studio/:id',
    who: 'Staff, or the person who claimed the profile (My Profile).',
    purpose:
      'Editable person profile (My Profile) + Stable Studio assistant (profile.*). While new, the onboarding card walks photo, details, horses: use onboarding.*.',
    actions: onboarding,
    anchors: onboardingAnchors,
  },
]
