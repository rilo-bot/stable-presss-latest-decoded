// ---------------------------------------------------------------------------
// What an AI reply may show a reader. PURE: text in, text out. Applied to every
// assistant message before Markdown rendering (components/MarkdownMessage.tsx).
//
// User report 2026-11-12: "sometimes it sends the message in coding language".
// The chat models (Gemini Flash on the public chat) occasionally put machine text
// in a reply — a tool call written out as code ("print(default_api.searchHorses(
// …))", a tool_code / json block, a {"name": …} object) — or narrate their own
// tool use ("Let's offer some quick options:"). None of that is for the reader:
//   - fenced blocks that are tool calls or raw JSON are dropped;
//   - a bare tool-call / JSON line is dropped;
//   - a trailing "let me / let's offer … options:" style aside is dropped;
//   - raw database ids become labelled links or vanish (humanizeIds).
// Everything else — prose, lists, tables, links — passes through untouched.
// ---------------------------------------------------------------------------

import { humanizeIds } from './humanizeIds';

/** A tool name the assistants use, or the shapes models write tool calls in. */
const TOOL_CALL = /\b(?:default_api|tool_code|print\s*\(|offer_choices|navigateTo|runAction|readScreen|search[A-Z]\w*|get[A-Z]\w*|list[A-Z]\w*|featureGuide|whatCanIDo)\s*\(?/;
const JSONISH = /^\s*[[{][\s\S]*[\]}]\s*$/;

function isMachineBlock(lang: string, body: string): boolean {
  if (/^(tool_code|tool|tool_call|function|json|jsonc|python|py|js|javascript|ts|typescript)$/i.test(lang.trim())) return true;
  return TOOL_CALL.test(body) || JSONISH.test(body);
}

/** Strip machine text the reader should never see. */
export function stripMachineText(text: string): string {
  if (!text) return text;
  let out = text
    // ```lang\n…\n``` blocks that are tool calls or JSON
    .replace(/```([\w-]*)[^\n]*\n?([\s\S]*?)```/g, (m, lang: string, body: string) => (isMachineBlock(lang, body) ? '' : m))
    // a whole line that is just a tool call: "print(default_api.searchHorses(query='Winx'))", "offer_choices({...})"
    .replace(/^[ \t]*(?:print\s*\()?(?:default_api\.)?[a-z_][\w.]*\s*\(\s*(?:\{|[a-z_]+\s*=)[^\n]*\)\s*\)?[ \t]*$/gim, (line) =>
      TOOL_CALL.test(line) || /default_api|print\s*\(/.test(line) ? '' : line,
    )
    // a whole line (or paragraph) that is a bare JSON object/array
    .replace(/^[ \t]*\{[^\n]*"[\w-]+"\s*:[^\n]*\}[ \t]*$/gm, '')
    // narration of its own tool use at the very end: "Let's offer some quick options:"
    .replace(/\s*(?:Let(?:'|’)s|Let me|I(?:'|’)ll now|I will now)\s+(?:offer|show|give|present|call|use)[^.!?\n]*(?:options|choices|buttons|tool)[^.!?\n]*[:.]?\s*$/i, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/** Everything an assistant message goes through before it is rendered. */
export function cleanAssistantText(text: string): string {
  return humanizeIds(stripMachineText(text));
}
