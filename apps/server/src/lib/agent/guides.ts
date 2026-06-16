// ---------------------------------------------------------------------------
// Static "how do I…" knowledge for the featureGuide tool. Keeping this as data
// (rather than in the system prompt) keeps the prompt small and the guidance
// accurate and consistent. Update these when the corresponding flows change.
// ---------------------------------------------------------------------------

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
    'Bulletins are the print-style magazine editions. Browse them on the Bulletins page and open one to read it page by page. Staff create and publish editions from the Newsroom → Magazine Studio.',

  newsroom:
    'The Newsroom is the editorial workspace for staff: an editorial Kanban, story drafting and review, the Magazine Studio for bulletins, and Production System modules for horses, parties, media and racing data. It is available to editorial staff accounts.',

  organisations:
    'An organisation (syndicate, stud, stable or agency) groups members and the parties/horses it manages under one umbrella. Create one during sign-up (choose Organisation) or manage it from My Organisation: invite members, add managed parties, and verify members’ role claims for parties your organisation controls.',

  'verify-claims':
    'Administrators review pending racing-role claims under Verify Claims; organisation owners/managers can verify claims for parties their organisation controls from My Organisation. Approving a claim activates the role for that member.',

  contact:
    'I can help right here on any page — just ask. For account or content matters that need a person, point staff to the Newsroom, and members to their Dashboard where most self-service options live.',
}

export const GUIDE_TOPICS = Object.keys(FEATURE_GUIDES)
