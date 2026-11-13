// ---------------------------------------------------------------------------
// Friendly step labels for the Operator's step timeline.
//
// The model's tool calls are the truest record of what the Stablehand did, but
// "runAction {name:'magazine.sharePages'}" is not something a person should
// have to read. Each call becomes one plain line — "Opened Magazine Builder",
// "Clicked “Share”", "Searched staff" — in the past tense once it has finished
// and the present tense while it runs, like the Claude in Chrome side panel.
// Unknown tools fall back to a humanised name, so a new server tool shows up
// sensibly without a change here.
// ---------------------------------------------------------------------------

import { shortPageName } from './pageContext';
import { humanizeActionName } from '../contracts';
import { looksLikeId, nameFromAgentId, scrubIds } from '../runtime/humanRef';
import { findAgentEl, labelOf } from '../runtime/dom';

type Input = Record<string, unknown> | undefined;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** "getHorseForm" / "find_staff" → "Get horse form". */
export function humanise(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

// Words that describe the KIND of control, not what it is. Dropped so
// "mag.share-button" reads as “Share”, not “Share button”.

/** A data-agent-id → a short human name: "mag.share-button" → "Share". */
export function anchorName(agentId: string | undefined, fallbackLabel?: string): string {
  if (fallbackLabel) return scrubIds(fallbackLabel, 'this item');
  // The element's own label while it is on screen ("Team Members" for ref:8,
  // "Remove" for team.remove-<id>) — the same words the runtime's step uses.
  // Ids inside the anchor ("team.remove-6650f1a2…") never reach the step line.
  const el = agentId && typeof document !== 'undefined' ? findAgentEl(agentId) : null;
  const live = el ? labelOf(el) : '';
  return live ? scrubIds(live, 'this item') : nameFromAgentId(agentId, 'an element');
}

/** The label an output may carry back (runtime echoes the element label). */
function outputLabel(output: unknown): string | undefined {
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    return str(o.label) ?? str(o.title);
  }
  return undefined;
}

// Server-executed lookups: [while running, when done].
const SERVER_TOOL_LABELS: Record<string, [string, string]> = {
  searchHorses: ['Searching horses', 'Searched horses'],
  getHorse: ['Looking up the horse', 'Looked up the horse'],
  searchParties: ['Searching the directory', 'Searched the directory'],
  getParty: ['Looking up the profile', 'Looked up the profile'],
  findStaff: ['Searching staff', 'Searched staff'],
  findMagazines: ['Looking for magazines', 'Looked up magazines'],
  getMagazine: ['Reading the magazine', 'Read the magazine'],
  searchKnowledge: ['Checking the help guide', 'Checked the help guide'],
  searchArticles: ['Searching articles', 'Searched articles'],
  searchStories: ['Searching stories', 'Searched stories'],
  listBulletins: ['Looking up bulletins', 'Looked up bulletins'],
  listHorses: ['Listing horses', 'Listed horses'],
  getHorseDossier: ['Reading the horse’s file', 'Read the horse’s file'],
  getArticle: ['Reading the article', 'Read the article'],
  getProfile: ['Reading the profile', 'Read the profile'],
  listRaces: ['Looking up races', 'Looked up races'],
  listPodcasts: ['Looking up podcasts', 'Looked up podcasts'],
  listBlogPosts: ['Looking up blog posts', 'Looked up blog posts'],
  tippingLeaderboard: ['Checking the leaderboard', 'Checked the leaderboard'],
  myAccount: ['Checking your account', 'Checked your account'],
  whatCanIDo: ['Checking what you can do', 'Checked what you can do'],
  featureGuide: ['Checking the feature guide', 'Checked the feature guide'],
  searchStockPhotos: ['Searching stock photos', 'Searched stock photos'],
};

/**
 * One line for a tool call.
 * @param running true while the call has no result yet.
 */
export function stepLabel(toolName: string, input: unknown, output: unknown, running: boolean): string {
  const a = (input && typeof input === 'object' ? input : undefined) as Input;
  const label = outputLabel(output);
  switch (toolName) {
    case 'navigate': {
      const path = str(a?.path);
      // The page's own title is often just the site name ("Stable Press") —
      // the route-derived name says more, so it wins unless the title is real.
      const real = label && !/^stable press$/i.test(label.trim()) ? label : undefined;
      const name = (!running && real) || (path ? shortPageName(path) : 'a page');
      return running ? `Opening ${name}` : `Opened ${name}`;
    }
    case 'readScreen':
      return running ? 'Reading the screen' : 'Read the screen';
    case 'runAction': {
      const raw = str(a?.name);
      const name = raw ? humanizeActionName(raw) : 'Action';
      return running ? `${name}…` : name;
    }
    case 'click': {
      const name = anchorName(str(a?.agentId), running ? undefined : label);
      return running ? `Clicking “${name}”` : `Clicked “${name}”`;
    }
    case 'type': {
      const text = truncate(str(a?.text) ?? '', 40);
      const into = anchorName(str(a?.agentId));
      return running ? `Typing into “${into}”` : text ? `Typed “${text}”` : `Cleared “${into}”`;
    }
    case 'select': {
      // An option's VALUE is often a user/horse id — name it only when it reads as text.
      const raw = str(a?.value) ?? '';
      const value = raw && !looksLikeId(raw) ? truncate(raw, 40) : '';
      if (!value) return running ? 'Choosing an option' : 'Chose an option';
      return running ? `Choosing “${value}”` : `Chose “${value}”`;
    }
    case 'waitFor': {
      const name = anchorName(str(a?.agentId));
      return running ? `Waiting for “${name}”` : `Waited for “${name}”`;
    }
    case 'scrollTo': {
      const name = anchorName(str(a?.agentId));
      return running ? `Scrolling to “${name}”` : `Scrolled to “${name}”`;
    }
    case 'upload': {
      // The runtime echoes the real file name (an image re-encoded to JPEG may
      // have had its extension corrected); before that, the name or index asked for.
      const out = output && typeof output === 'object' ? (output as Record<string, unknown>) : undefined;
      const asked = typeof a?.attachment === 'string' ? str(a.attachment) : undefined;
      const name = str(out?.fileName) ?? asked;
      if (running) return name ? `Attaching “${truncate(name, 40)}”` : 'Attaching your file';
      return name ? `Attached “${truncate(name, 40)}”` : 'Attached your file';
    }
    case 'navigateTo': {
      const to = str(a?.to);
      return running ? `Opening ${to ?? 'a page'}` : `Opened ${to ?? 'a page'}`;
    }
  }
  const known = SERVER_TOOL_LABELS[toolName];
  if (known) return running ? known[0] : known[1];
  return humanise(toolName);
}

/** Compact, truncated JSON for the expandable step details. */
export function compactJson(v: unknown, max = 600): string {
  if (v === undefined) return '';
  let s: string;
  try {
    s = JSON.stringify(v, null, 1) ?? String(v);
  } catch {
    s = String(v);
  }
  return truncate(s, max);
}
