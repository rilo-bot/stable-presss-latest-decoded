// Shared Markdown renderer for assistant chat messages (the model replies in
// light Markdown). Used by the global Stablehand widget and the in-editor
// Studio Assistant. react-markdown builds React elements (no dangerouslySet…),
// so it is XSS-safe by construction.

import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components, Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useInRouterContext } from 'react-router-dom';
import { cleanAssistantText } from '@/lib/chatText';

// remark-gfm's autolink step builds a regex with lookbehind `(?<=…)` on every
// parse. Safari / iOS before 16.4 cannot compile lookbehind, so there it threw
// on EVERY render and no assistant reply could be shown at all. Detect it once
// and skip GFM on those engines (tables / ~~strike~~ then read as plain text).
const REMARK_PLUGINS: Options['remarkPlugins'] = (() => {
  try {
    new RegExp('(?<=a)b');
    return [remarkGfm];
  } catch {
    return [];
  }
})();

const mdComponents: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => <ChatLink href={href}>{children}</ChatLink>,
  h1: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-bold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-bold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-2 text-[13px] font-bold first:mt-0">{children}</h4>,
  hr: () => <hr className="my-2 border-border" />,
  // Readers of these chats are racing fans, not programmers: nothing should look
  // like code. Inline `code` reads as emphasis; a block (fenced or indented by a
  // model) reads as an ordinary paragraph that keeps its line breaks.
  code: ({ children }) => <span className="font-medium">{children}</span>,
  pre: ({ children }) => <div className="mb-2 whitespace-pre-wrap leading-relaxed last:mb-0">{children}</div>,
  // Tables (models like them for comparisons) scroll sideways in the narrow chat
  // instead of squashing, with light rules so the columns read.
  table: ({ children }) => (
    <div className="mb-2 max-w-full overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border/60 px-2 py-1 align-top">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-2 italic text-muted-foreground">{children}</blockquote>
  ),
};

const LINK_STYLE = { color: 'hsl(var(--primary))' };

/** In-app paths ("/bulletins/…") navigate inside the app — no new tab, no reload,
 *  so an open assistant keeps its conversation. Anything else opens in a new tab. */
function ChatLink({ href, children }: { href?: string; children?: ReactNode }) {
  const inRouter = useInRouterContext();
  const internal = !!href && href.startsWith('/') && !href.startsWith('//');
  if (internal && inRouter) {
    return (
      <Link to={href} className="underline" style={LINK_STYLE}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target={internal ? undefined : '_blank'} rel="noreferrer" className="underline" style={LINK_STYLE}>
      {children}
    </a>
  );
}

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      {/* Machine text (tool calls, JSON) and raw ids never reach the reader — lib/chatText.ts. */}
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={mdComponents}>
        {cleanAssistantText(text)}
      </ReactMarkdown>
    </div>
  );
}
