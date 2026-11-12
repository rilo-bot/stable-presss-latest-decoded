// ---------------------------------------------------------------------------
// Keep database ids out of AI chat replies (user report 2026-11-12: "It's live
// on the public Bulletins page at /bulletins/6af5c3eaa98c20aa13ac0746").
//
// The models are told never to show ids, but a reply is the last line of
// defence, so every assistant message passes through here before Markdown
// rendering (components/MarkdownMessage.tsx). PURE: text in, text out.
//
//   - An in-app path that carries an id — bare, in `code`, or as a link's text —
//     becomes a Markdown link with a plain label: [Open in Bulletins](/bulletins/…).
//     MarkdownMessage turns internal links into in-app navigation.
//   - A raw id left on its own (24-hex Mongo id or UUID) is removed together with
//     its usual wrappers: "(ID: …)", "id …", backticks.
//   - Fenced code blocks are left alone.
// ---------------------------------------------------------------------------

const HEX24 = '[a-f0-9]{24}';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ID = `(?:${HEX24}|${UUID})`;

/** Friendly link labels, most specific first. Paths match apps/web/src/App.tsx. */
const ROUTE_LABELS: Array<[RegExp, string]> = [
  [/^\/production-system\/magazine-v2\//, 'Open the magazine'],
  [/^\/production-system\/blogs\//, 'Open the blog post'],
  [/^\/production-system\/ai-activity\//, 'Open AI Activity'],
  [/^\/production-system\//, 'Open it in the Campaign Engine'],
  [/^\/bulletins\//, 'Open in Bulletins'],
  [/^\/horses\//, 'Open the horse profile'],
  [/^\/studio\/horse\//, 'Open the horse in the studio'],
  [/^\/studio\//, 'Open it in the studio'],
  [/^\/parties\//, 'Open the profile'],
  [/^\/orgs\//, 'Open the organisation'],
  [/^\/articles\//, 'Open the article'],
  [/^\/blog\//, 'Open the blog post'],
];

/** The plain-language label for an in-app path. */
export function labelForPath(path: string): string {
  for (const [re, label] of ROUTE_LABELS) if (re.test(path)) return label;
  return 'Open it';
}

/** An in-app path (starts with "/", not "//") with at least one id segment. */
const ID_PATH = `\\/(?!\\/)[A-Za-z0-9._~%/-]*?${ID}(?:\\/[A-Za-z0-9._~%-]*)*`;

const reMdLinkWithIdText = new RegExp(`\\[([^\\]]*${ID}[^\\]]*)\\]\\((\\/[^)\\s]*)\\)`, 'gi');
const reCodePath = new RegExp('`\\s*(' + ID_PATH + ')\\s*`', 'gi');
// Not already a link target ("](…") and not part of a URL ("https://x/…").
const reBarePath = new RegExp(`(^|[\\s(“"'])(${ID_PATH})(?=$|[\\s).,;:!?”"'])`, 'gi');
const reWrappedId = new RegExp(`\\s*\\((?:id|ID|Id)?[:\\s]*\`?${ID}\`?\\)`, 'g');
const reLabelledId = new RegExp(`\\s*\\b(?:id|ID|Id)[:\\s]+\`?${ID}\`?`, 'g');
const reCodeId = new RegExp('`' + ID + '`', 'gi');
const reHasId = new RegExp(`\\b${ID}\\b`, 'i');

const reMdLink = /\[[^\]]*\]\([^)\s]*\)/g;
const reBareIdG = new RegExp(`\\b${ID}\\b`, 'gi');

function humanizeChunk(text: string): string {
  // Finished links are set aside so later rules never rewrite inside one (an
  // id in a link TARGET is fine — that is how the link works).
  const kept: string[] = [];
  const keep = (link: string) => `\u0000${kept.push(link) - 1}\u0000`;
  const link = (path: string) => keep(`[${labelForPath(path)}](${path})`);

  const out = text
    // [6af5…](/bulletins/6af5…) or [/bulletins/6af5…](/bulletins/6af5…) → friendly label
    .replace(reMdLinkWithIdText, (_m, _label: string, href: string) => link(href))
    // every other link stays exactly as written
    .replace(reMdLink, (m) => keep(m))
    // `/bulletins/6af5…` → link
    .replace(reCodePath, (_m, path: string) => link(path))
    // /bulletins/6af5… → link
    .replace(reBarePath, (_m, lead: string, path: string) => `${lead}${link(path)}`)
    // "(ID: 6af5…)", "id 6af5…", "`6af5…`", bare 6af5… → gone
    .replace(reWrappedId, '')
    .replace(reLabelledId, '')
    .replace(reCodeId, '')
    .replace(reBareIdG, '')
    // Tidy what a removal leaves behind.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/,(\s*,)+/g, ',')
    .replace(/[ \t]+$/gm, '')
    .replace(/\(\s*\)/g, '');

  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)] ?? '');
}

/** Replace raw ids in an assistant reply with readable links / nothing. */
export function humanizeIds(text: string): string {
  if (!text || !reHasId.test(text)) return text;
  // Leave fenced code blocks untouched: split on ``` fences, humanize the prose parts.
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) => (i % 2 === 1 ? part : humanizeChunk(part)))
    .join('');
}
