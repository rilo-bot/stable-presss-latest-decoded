// ---------------------------------------------------------------------------
// Static "how do I…" knowledge for the featureGuide tool. Keeping this as data
// (rather than in the system prompt) keeps the prompt small and the guidance
// accurate and consistent. Update these when the corresponding flows change.
// ---------------------------------------------------------------------------

import { MAGAZINE_V2_ENABLED } from '../magazineV2/config.js'

// Where staff build bulletins. With MAGAZINE_V2 on, the Newsroom sidebar shows
// the free-form "Magazine Builder"; the old template Magazine Studio entry is
// retired from the nav.
const BUILDER = MAGAZINE_V2_ENABLED ? 'Magazine Builder' : 'Magazine Studio'

export const FEATURE_GUIDES: Record<string, string> = {
  overview:
    'Stable Press is a racing publication and industry Production System. Anyone can browse Horses, Parties, the News, print Bulletins, the Podcast and the Tipping Ring. Creating a free account lets you follow horses, take part in tipping, and — once verified — manage your own stable. Editorial staff manage content from the Newsroom.',

  'get-started':
    'Create a free account from the Sign up page (top-right). Sign-in is passwordless: enter your email and we send a 6-digit code. Once in, you land on your Dashboard, where you can follow horses, join the Tipping Ring, claim a racing role, or set up an organisation.',

  'sign-in':
    'Click Log in (top-right) and enter your email — we email you a 6-digit code (no password to remember). Enter the code and you are in. New here? Use Sign up instead.',

  'claim-role':
    'To manage your own horses, you claim a racing role (owner, trainer, jockey, breeder, bloodstock agent, syndicate manager, or personnel). Go to your Dashboard → Racing Roles, choose the role(s) that apply, and optionally attach a document as evidence. Staff review the claim; once verified, the matching tools and your stable unlock. While pending, the role is read-only.',

  'register-horse':
    'Once you have a verified racing role (or are setting up your own party profile), open your Dashboard → My Stable, or your party profile, and use "Register Horse". Newly registered horses start as provisional (hidden from the public) until verified, but you can see and edit them straight away.',

  'manage-stable':
    'Your Dashboard → My Stable shows the horses you can manage. Open one in the Horse Studio to edit its profile, connections, media, racing entries, sales and reports. You can only edit horses you are currently linked to (or that you registered).',

  'upgrade-plan':
    'Some articles and content are premium. Plans are free, standard and premium. Open your Dashboard → Your Plan to switch tiers. (Billing is handled separately; the selector sets your access level.)',

  tipping:
    'The Tipping Ring is a free virtual-coin tipping game — no real money. Open Tipping, pick a race, choose a horse and stake some coins. Your balance, record and the leaderboard update as races resolve. You need a (free) account to place tips.',

  follow:
    'Use the Follow button on a horse to add it to "My Stable" on the Horses page and your Dashboard, so you can track it easily. Following is just for you and needs a free account.',

  bulletins:
    `Bulletins are the print-style magazine editions. Browse them on the Bulletins page and open one to read it page by page. Staff create and publish editions from the Newsroom → ${BUILDER}.`,

  newsroom:
    `The Newsroom is the editorial workspace for staff: an editorial Kanban, story drafting and review, the ${BUILDER} for bulletins, and Production System modules for horses, parties, media and racing data. It is available to editorial staff accounts.`,

  'file-story':
    'Filing a story is an editorial-staff action. Go to the Newsroom — from there start a new story/draft on the editorial board, write the headline, summary and body, link any horses, set the category, then submit it for review. Editors move it along the pipeline (draft → review → published / newsletter / bulletin). If you are not editorial staff yet, I can show you what you can do instead, or you can ask an editor to grant access.',

  'edit-bulletin': MAGAZINE_V2_ENABLED
    ? 'Bulletins (the print magazine) are built in the Newsroom → Magazine Builder. Start a magazine three ways: Build with AI from a brief (attach source documents/images if you like), Import a PDF/DOCX pixel-faithfully, or start Blank. Then edit each page on the free-form canvas — the docked assistant can write, fill and restyle pages for you. When ready, Publish (the full edition or selected pages) to put it on the public Bulletins page.'
    : 'Bulletins (the print magazine) are built in the Newsroom → Magazine Studio. Open or create a magazine, edit each page\'s regions, and use the in-editor Studio Assistant to write/fill pages. When ready, owners/editors Publish it to the public Bulletins page.',

  organisations:
    'An organisation (syndicate, stud, stable or agency) groups members and the parties/horses it manages under one umbrella. Create one during sign-up (choose Organisation) or manage it from My Organisation: invite members, add managed parties, and verify members’ role claims for parties your organisation controls.',

  'verify-claims':
    'Administrators review pending racing-role claims under Verify Claims; organisation owners/managers can verify claims for parties their organisation controls from My Organisation. Approving a claim activates the role for that member.',

  contact:
    'I can help right here on any page — just ask. For account or content matters that need a person, point staff to the Newsroom, and members to their Dashboard where most self-service options live.',
}

export const GUIDE_TOPICS = Object.keys(FEATURE_GUIDES)
