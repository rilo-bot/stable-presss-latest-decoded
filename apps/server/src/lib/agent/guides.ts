// ---------------------------------------------------------------------------
// Static "how do I…" knowledge for the featureGuide tool. Keeping this as data
// (rather than in the system prompt) keeps the prompt small and the guidance
// accurate and consistent. Update these when the corresponding flows change.
// ---------------------------------------------------------------------------

// Where staff build bulletins: the Production System sidebar's free-form
// "Magazine Builder". The old template Magazine Studio is retired.
const BUILDER = 'Magazine Builder'

export const FEATURE_GUIDES: Record<string, string> = {
  overview:
    'Stable Press is a racing publication and industry Production System. Anyone can browse Horses, Parties, the News, print Bulletins, the Podcast and the Tipping Ring. Creating a free account lets you follow horses, take part in tipping, and — once verified — manage your own stable. Editorial staff manage content from the Production System (the staff CMS).',

  'get-started':
    'Create a free account from the Sign up page (top-right). Sign-in is passwordless: enter your email and we send a 6-digit code. Once in, you land on your Dashboard, where you can follow horses, join the Tipping Ring, claim a racing role, or set up an organisation.',

  'sign-in':
    'Click Log in (top-right) and enter your email — we email you a 6-digit code (no password to remember). Enter the code and you are in. New here? Use Sign up instead.',

  'claim-role':
    'To manage your own horses, you claim a racing role (owner, trainer, jockey, breeder, bloodstock agent, syndicate manager, or personnel). Go to your Dashboard → Racing Roles, choose the role(s) that apply, and optionally attach a document as evidence. Staff review the claim; once verified, the matching tools and your stable unlock. While pending, the role is read-only.',

  'register-horse':
    'Once you have a verified racing role (or are setting up your own party profile), open your Dashboard → My Stable, or your party profile, and use "Register Horse". Newly registered horses start as provisional (hidden from the public) until verified, but you can see and edit them straight away.',

  'manage-stable':
    'Your Dashboard → My Stable shows the horses you can manage. Open one in the Horse Studio to edit its profile, connections, media, racing entries, sales and reports — the studio has its own assistant that can update details with you. You can only edit horses you are currently linked to (or that you registered).',

  tipping:
    'The Tipping Ring is a free virtual-coin tipping game — no real money. Open Tipping, pick a race, choose a horse and stake some coins. Your balance, record and the leaderboard update as races resolve. You need a (free) account to place tips.',

  follow:
    'Use the Follow button on a horse to add it to "My Stable" on the Horses page and your Dashboard, so you can track it easily. Following is just for you and needs a free account.',

  bulletins:
    `Bulletins are the print-style magazine editions. Browse them on the Bulletins page and open one to read it page by page. Staff create and publish editions from the Production System → ${BUILDER}.`,

  'production-system':
    `The Production System is the staff CMS (it replaced the old "Newsroom" — the old links redirect). Its sidebar screens are each their own page: Overview, Workflow Board (the story Kanban), Pipeline Map, All Stories, Editor Hub (review queue, assignments, approval routing, scheduling), My Media Assets, My Compensation, the racing-data registers (Horses, People, Media Records, Racing Records), Team Members, Roles & Permissions, Analytics and Settings — plus the ${BUILDER} for bulletins. Which screens you see depends on your role.`,

  'file-story':
    'Filing a story is an editorial-staff action. In the Production System, the "File a Story" button (on Overview, the Workflow Board, All Stories and the Editor Hub) offers two ways: the AI Story Studio — a drawer where you tell the assistant your story and it writes and files the draft with you — or a manual draft form. Either way the draft lands on the Workflow Board, where you write/polish, link horses, set the category and submit for review; editors move it along the pipeline (draft → review → published / newsletter / bulletin). If you are not editorial staff yet, I can show you what you can do instead, or you can ask an editor to grant access.',

  'edit-bulletin':
    'Bulletins (the print magazine) are built in the Production System → Magazine Builder. Start a magazine three ways: Build with AI from a brief (attach source documents/images if you like), Import a PDF/DOCX pixel-faithfully, or start Blank. Then edit each page on the free-form canvas — the docked assistant can write, fill and restyle pages for you. When ready, Publish (the full edition or selected pages) to put it on the public Bulletins page.',

  'ai-studios':
    `Stable Press has AI studios — each surface has its own assistant that does the work with you. Story Studio (Production System): tell it your story and it writes & files the draft. ${BUILDER} (Production System): build a bulletin from an AI brief, an imported PDF/DOCX or blank, with an in-editor assistant. Horse Studio (Dashboard → My Stable → open a horse): edit your horse's profile with an assistant. Profile Studio (Dashboard → your profile): complete your own party profile with an assistant. Writers editing an article also get an assistant right on the article page. Ask me to open any of them.`,

  organisations:
    'An organisation (syndicate, stud, stable or agency) groups members and the register entries it fields under one umbrella. Create one during sign-up (choose Organisation) or manage it from My Organisation: add members as owner, manager or member, and field people in the register under the org.',

  contact:
    'I can help right here on any page — just ask. For account or content matters that need a person, point staff to the Production System, and members to their Dashboard where most self-service options live.',
}

export const GUIDE_TOPICS = Object.keys(FEATURE_GUIDES)
