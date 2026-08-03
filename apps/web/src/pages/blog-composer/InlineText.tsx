/**
 * contentEditable inline editor for a block's rich text.
 *
 * Two things make this fiddlier than it looks, and both are why the value is
 * NOT written back into the DOM on every render:
 *
 *  1. Setting innerHTML on a focused contentEditable collapses the caret to the
 *     start. Re-rendering from state on each keystroke would make typing jump.
 *     So the DOM is seeded once, and thereafter the DOM is the source of truth
 *     while focused; state is updated from it, not the other way round.
 *
 *  2. A paste carries arbitrary markup — Word, a web page, another CMS. It is
 *     intercepted and inserted as plain text, so the block model stays intact
 *     and nothing arrives that the sanitizer would have to strip later.
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { sanitizeBlogHtml } from '@/blog/sanitize';

interface InlineTextProps {
  value: string;
  onChange: (html: string) => void;
  /** Plain text only — used for headings and code, where markup is meaningless. */
  plain?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** Enter creates the next block instead of a line break. */
  onEnter?: () => void;
  /** Backspace in an empty block removes it. */
  onEmptyBackspace?: () => void;
  autoFocus?: boolean;
  /**
   * "/" typed in an EMPTY block opens the block menu. Only when empty: mid
   * sentence a slash is just a slash, and hijacking it there would make dates
   * and and/or impossible to type.
   */
  onSlash?: () => void;
}

export function InlineText({
  value,
  onChange,
  plain = false,
  placeholder,
  className,
  ariaLabel,
  onEnter,
  onEmptyBackspace,
  autoFocus,
  onSlash,
}: InlineTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  // What we last pushed to the parent, so an echo of our own value doesn't
  // trigger a DOM write and move the caret.
  //
  // Starts as null, NOT as `value`: seeding it with `value` made the guard below
  // true on the very first run, so the initial content was never written to the
  // DOM at all. Every text block in a saved post opened blank, and the next
  // save wrote that blankness back. null can never equal a string, so the first
  // pass always seeds.
  const lastEmitted = useRef<string | null>(null);

  // Seed the DOM only when the incoming value genuinely differs from what this
  // element last emitted — i.e. the first render, or an external change (undo,
  // reload, AI later).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    const current = plain ? el.textContent ?? '' : el.innerHTML;
    if (value === current) return;
    if (plain) el.textContent = value;
    else el.innerHTML = sanitizeBlogHtml(value);
    lastEmitted.current = value;
  }, [value, plain]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const next = plain ? el.textContent ?? '' : sanitizeBlogHtml(el.innerHTML);
    lastEmitted.current = next;
    onChange(next);
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={!onEnter}
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      onInput={emit}
      onBlur={emit}
      onPaste={(e) => {
        e.preventDefault();
        // Plain text only. `insertText` keeps this on the browser's own undo
        // stack, which execCommand-free DOM surgery would not.
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
      onKeyDown={(e) => {
        // Slash opens the block menu, but only in an empty block — mid-sentence a
        // slash has to stay a slash.
        if (e.key === '/' && onSlash && (ref.current?.textContent ?? '').length === 0) {
          e.preventDefault();
          onSlash();
          return;
        }
        if (e.key === 'Enter' && onEnter && !e.shiftKey) {
          e.preventDefault();
          emit();
          onEnter();
          return;
        }
        if (e.key === 'Backspace' && onEmptyBackspace) {
          const empty = (ref.current?.textContent ?? '').length === 0;
          if (empty) {
            e.preventDefault();
            onEmptyBackspace();
          }
        }
        // Keep the browser's native bold/italic — the sanitizer allows both, and
        // reimplementing them would be strictly worse than what is built in.
      }}
      className={cn(
        'outline-none focus:ring-0',
        // The placeholder is CSS-only: a real one would need a value in the DOM,
        // which the caret logic above must not have to distinguish from content.
        'empty:before:pointer-events-none empty:before:text-muted-foreground/50 empty:before:content-[attr(data-placeholder)]',
        className,
      )}
    />
  );
}
