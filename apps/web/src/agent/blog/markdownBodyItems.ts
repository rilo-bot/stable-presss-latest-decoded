/**
 * Plain markdown → BodyItem[] — for writers (the Stablehand Operator) that hand
 * over a post body as text rather than as structured items.
 *
 * Deliberately small: the BodyItem union is paragraph / heading / list / quote,
 * so that is all this recognises. Inline emphasis markers are stripped, because
 * a BodyItem holds plain text and `blockForItem` escapes it on the way in — a
 * literal `**` in a published paragraph is worse than losing the bold.
 *
 *   # / ## Heading     → heading level 2      ### Heading → heading level 3
 *   - item / * item    → bulleted list        1. item     → numbered list
 *   **Lead:** text     → list point with a lead
 *   > quote            → quote ("— Name" on its last line, or a short " — Name"
 *                        ending a one-line quote, becomes the attribution)
 *   a leading heading  → dropped (a body never opens on a heading)
 *   anything else      → paragraphs, split on blank lines
 */
import type { BodyItem } from '@/blog/bodyItems';

const MAX_ITEMS = 60;

function inline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → their words
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=[^*\w]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function point(raw: string): { lead?: string; text: string } {
  const m = /^\s*(?:\*\*|__)([^*_]{1,80}?):?(?:\*\*|__)\s*:?\s*(.+)$/.exec(raw);
  if (m) {
    const lead = inline(m[1] ?? '');
    const text = inline(m[2] ?? '');
    if (lead && text) return { lead, text };
  }
  return { text: inline(raw) };
}

const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

export function markdownToBodyItems(markdown: string): BodyItem[] {
  const lines = (markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: BodyItem[] = [];
  let para: string[] = [];

  const flushPara = () => {
    const text = inline(para.join(' '));
    if (text) out.push({ kind: 'paragraph', text });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || RULE.test(line)) {
      flushPara();
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      flushPara();
      const text = inline(h[2] ?? '');
      if (text) out.push({ kind: 'heading', level: (h[1]!.length >= 3 ? 3 : 2) as 2 | 3, text: text.slice(0, 200) });
      continue;
    }

    if (QUOTE.test(line)) {
      flushPara();
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        quoted.push(QUOTE.exec(lines[i]!)![1] ?? '');
        i++;
      }
      i--;
      let attribution: string | undefined;
      const last = quoted[quoted.length - 1]?.trim() ?? '';
      const att = /^(?:—|--|-|–)\s*(.+)$/.exec(last);
      if (att && quoted.length > 1) {
        attribution = inline(att[1] ?? '').slice(0, 120);
        quoted.pop();
      } else {
        // `> "It is the race everyone watches." — Bart Cummings` on ONE line:
        // a short trailing name after a spaced dash is the attribution too.
        const tail = /^(.*\S)\s+(?:—|–|--)\s+([^—–.!?]{2,60})$/.exec(quoted.join(' ').trim());
        if (tail && tail[2]!.trim().split(/\s+/).length <= 6) {
          attribution = inline(tail[2] ?? '').slice(0, 120);
          quoted.splice(0, quoted.length, tail[1]!);
        }
      }
      const text = inline(quoted.join(' ').replace(/^["“]|["”]$/g, ''));
      if (text) out.push({ kind: 'quote', text, ...(attribution ? { attribution } : {}) });
      continue;
    }

    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      flushPara();
      const re = ordered ? NUMBERED : BULLET;
      const points: { lead?: string; text: string }[] = [];
      while (i < lines.length && re.test(lines[i]!)) {
        const p = point(re.exec(lines[i]!)![1] ?? '');
        if (p.text) points.push(p);
        i++;
      }
      i--;
      if (points.length === 1) {
        const only = points[0]!;
        out.push({ kind: 'paragraph', text: only.lead ? `${only.lead}: ${only.text}` : only.text });
      } else if (points.length > 1) {
        out.push({ kind: 'list', ordered, items: points.slice(0, 12) });
      }
      continue;
    }

    para.push(line.trim());
  }
  flushPara();

  // A body that opens with a heading reads as a fragment of something longer —
  // the same rule the Blog Studio's item validator applies.
  while (out.length > 0 && out[0]!.kind === 'heading') out.shift();
  return out.slice(0, MAX_ITEMS);
}

/** An array of paragraph strings → paragraph items (each one may itself hold markdown). */
export function paragraphsToBodyItems(paragraphs: string[]): BodyItem[] {
  return markdownToBodyItems(paragraphs.map((p) => p.trim()).filter(Boolean).join('\n\n'));
}
