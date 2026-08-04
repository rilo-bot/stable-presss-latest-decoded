/**
 * The body toolbar — one strip above the writing surface.
 *
 *   B  I  U  |  H2  H3  ¶  |  • List  1. List  "  |  Image  Link  Clear
 *
 * Two kinds of button, which is worth knowing before reading the code:
 *
 *   INLINE MARKS (B, I, U, Link, Clear) act on the current text SELECTION via
 *   `document.execCommand`. execCommand is formally deprecated, but it remains
 *   the only API that applies a mark to a selection inside a contentEditable
 *   without hand-rolling a range/DOM-splitting engine, and every browser still
 *   implements it. The alternative here is a rich-text framework, which is a
 *   much larger dependency than this file.
 *
 *   BLOCK BUTTONS (H2, H3, ¶, lists, quote) RETYPE the block under the caret
 *   through `convertBlock`, carrying its text across. That is what those buttons
 *   do in the editors people already know — they don't insert anything.
 *
 * The one detail that makes any of it work: `onMouseDown` is prevented on every
 * button. A plain click moves focus out of the contentEditable first, which
 * collapses the selection, so the mark would land on nothing. Blocking the
 * default keeps focus — and therefore the selection — exactly where it was.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Bold, Eraser, Image as ImageIcon, Italic, Link2, List, ListOrdered, Pilcrow,
  Quote, Underline,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { RICH_TEXT_KINDS, TEXT_KINDS, convertBlock } from '@/blog/factories';
import { useComposerStore, type ContainerId } from './composerStore';
import type { TextKindTarget } from '@/blog/factories';
import type { Block } from '@/types/blog';

/** Which inline marks are on at the caret, so the buttons can light up. */
function queryMarks(): { bold: boolean; italic: boolean; underline: boolean } {
  try {
    return {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    };
  } catch {
    // Firefox throws when there is no editable selection at all.
    return { bold: false, italic: false, underline: false };
  }
}

function Btn({
  children,
  onRun,
  active,
  disabled,
  title,
  label,
  wide,
}: {
  children: React.ReactNode;
  onRun: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  label: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={title}
      disabled={disabled}
      // THE critical line — see the file header. Without it the selection is
      // gone by the time onClick fires and every mark button is a no-op.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1 rounded-sm text-xs transition-colors',
        wide ? 'px-2' : 'w-7',
        active
          ? 'bg-primary/10 font-semibold text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'pointer-events-none opacity-30',
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-4 w-px flex-shrink-0 bg-border/70" aria-hidden="true" />;
}

export function BodyToolbar({
  onAddImage,
  containerId = null,
}: {
  onAddImage: () => void;
  /**
   * Which writing surface this strip governs: the post body (`null`) or one part.
   *
   * There is a toolbar per surface, and the selection is a single block id for the
   * whole post — so a toolbar that ignored this would light up whenever ANY block
   * were selected, and pressing H2 in part two's toolbar would retype a paragraph
   * in the body. Scoping it means only the strip above the caret is live.
   */
  containerId?: ContainerId;
}) {
  const { blog, selectedId, replaceBlock } = useComposerStore();
  const [marks, setMarks] = useState({ bold: false, italic: false, underline: false });

  // Track the caret so B/I/U reflect where it actually is. `selectionchange` is
  // the only event that fires for caret moves made by typing, arrow keys AND
  // clicks — watching focus alone would leave the buttons stale mid-line.
  useEffect(() => {
    const onSel = () => setMarks(queryMarks());
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  // Only a block in THIS container counts as selected here.
  const ownBlocks: Block[] =
    containerId === null
      ? blog?.blocks ?? []
      : blog?.parts?.find((p) => p.id === containerId)?.blocks ?? [];
  const selected: Block | undefined = ownBlocks.find((b) => b.id === selectedId);

  const exec = useCallback((command: string, value?: string) => {
    try {
      document.execCommand(command, false, value);
    } catch {
      /* nothing sensible to do — the mark simply isn't applied */
    }
    setMarks(queryMarks());
    // execCommand mutates the DOM directly, behind React's back. InlineText
    // commits on input/blur, so fire an input event to make it notice.
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.isContentEditable) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, []);

  const retype = useCallback(
    (to: TextKindTarget) => {
      if (!selected) return;
      const next = convertBlock(selected, to);
      if (next === selected) return;
      replaceBlock(selected.id, next);
    },
    [selected, replaceBlock],
  );

  // No block selected, or a picture selected: there is no text to format. The
  // toolbar stays visible (it is the body's masthead, not a popup) but its text
  // controls are inert rather than lying about what they'd do.
  const isText = !!selected && TEXT_KINDS.has(selected.kind);
  const isRich = !!selected && RICH_TEXT_KINDS.has(selected.kind);

  const level = selected?.kind === 'heading' ? selected.level : null;
  const listOrdered = selected?.kind === 'list' ? selected.ordered : null;

  const addLink = () => {
    const url = window.prompt('Link to which URL?', 'https://');
    if (!url) return;
    const trimmed = url.trim();
    // Matches the server's anchor policy (sanitizeBlogInline): anything that
    // isn't http(s) is dropped on save, so refuse it here where the author can
    // still see why rather than letting it vanish silently.
    if (!/^https?:\/\//i.test(trimmed)) {
      window.alert('Links must start with http:// or https://');
      return;
    }
    exec('createLink', trimmed);
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-t-sm border-b border-border/60 bg-muted/30 px-2 py-1.5"
    >
      <Btn label="Bold" title="Bold (Ctrl+B)" disabled={!isRich} active={marks.bold} onRun={() => exec('bold')}>
        <Bold size={13} />
      </Btn>
      <Btn label="Italic" title="Italic (Ctrl+I)" disabled={!isRich} active={marks.italic} onRun={() => exec('italic')}>
        <Italic size={13} />
      </Btn>
      <Btn
        label="Underline"
        title="Underline (Ctrl+U)"
        disabled={!isRich}
        active={marks.underline}
        onRun={() => exec('underline')}
      >
        <Underline size={13} />
      </Btn>

      <Sep />

      <Btn
        wide
        label="Heading 2"
        title="Heading 2"
        disabled={!isText}
        active={level === 2}
        onRun={() => retype({ kind: 'heading', level: 2 })}
      >
        H2
      </Btn>
      <Btn
        wide
        label="Heading 3"
        title="Heading 3"
        disabled={!isText}
        active={level === 3}
        onRun={() => retype({ kind: 'heading', level: 3 })}
      >
        H3
      </Btn>
      <Btn
        label="Paragraph"
        title="Body text"
        disabled={!isText}
        active={selected?.kind === 'paragraph'}
        onRun={() => retype({ kind: 'paragraph' })}
      >
        <Pilcrow size={13} />
      </Btn>

      <Sep />

      <Btn
        wide
        label="Bulleted list"
        title="Bulleted list"
        disabled={!isText}
        active={listOrdered === false}
        onRun={() => retype({ kind: 'list', ordered: false })}
      >
        <List size={13} />
      </Btn>
      <Btn
        wide
        label="Numbered list"
        title="Numbered list"
        disabled={!isText}
        active={listOrdered === true}
        onRun={() => retype({ kind: 'list', ordered: true })}
      >
        <ListOrdered size={13} />
      </Btn>
      <Btn
        label="Quote"
        title="Quote"
        disabled={!isText}
        active={selected?.kind === 'quote'}
        onRun={() => retype({ kind: 'quote' })}
      >
        <Quote size={13} />
      </Btn>

      <Sep />

      {/* Images are why this is a blog and not a text field, so the button sits
          in the toolbar rather than only behind the slash menu. */}
      <Btn wide label="Insert image" title="Insert an image" onRun={onAddImage}>
        <ImageIcon size={13} />
        <span className="text-[11px]">Image</span>
      </Btn>
      <Btn wide label="Add a link" title="Add a link" disabled={!isRich} onRun={addLink}>
        <Link2 size={13} />
        <span className="text-[11px]">Link</span>
      </Btn>
      <Btn
        wide
        label="Clear formatting"
        title="Clear formatting from the selection"
        disabled={!isRich}
        onRun={() => {
          exec('removeFormat');
          exec('unlink');
        }}
      >
        <Eraser size={13} />
        <span className="text-[11px]">Clear</span>
      </Btn>

      {/* Says what the buttons will act on. Without it, a disabled toolbar looks
          broken rather than waiting for a click into the text. */}
      <span className="ml-auto hidden pl-2 text-[11px] text-muted-foreground/70 sm:block">
        {selected ? (isText ? 'Editing this block' : 'Picture selected') : 'Click into the text'}
      </span>
    </div>
  );
}
