/**
 * InlineEdit — a click-to-edit text field for the public article page. Unlike
 * the magazine editor's EditableText (which is wired to the Zustand magazine
 * store), this is a standalone controlled-on-commit field: it renders its own
 * contentEditable surface, highlights while editing, and reports plain-text
 * changes upward via `onChange`.
 *
 * It is *uncontrolled* at the DOM level on purpose — React never re-writes the
 * innerText while the user is typing, so the caret never jumps. The initial
 * text is seeded once on mount; because the parent conditionally mounts this
 * component only in edit mode, entering edit mode always re-seeds from the
 * latest article value.
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Initial text to seed the editor with (read once, on mount). */
  value: string;
  /** Fired with the latest plain text on every keystroke / blur. */
  onChange: (value: string) => void;
  /** Render as an inline span (e.g. inside a heading) or a block div. */
  as?: 'span' | 'div';
  /** Allow newlines (Enter inserts a line break instead of committing). */
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}

export function InlineEdit({
  value,
  onChange,
  as = 'div',
  multiline = false,
  className,
  placeholder,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  // Seed the editable surface exactly once, on mount. We deliberately do NOT
  // sync `value` back in on later renders — doing so would reset the caret to
  // the start of the field on every keystroke.
  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Tag = as as 'div';

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline}
      data-placeholder={placeholder}
      spellCheck
      onInput={(e) => onChange((e.currentTarget as HTMLElement).innerText)}
      onKeyDown={(e) => {
        // In single-line fields, Enter should not insert a newline.
        if (!multiline && e.key === 'Enter') e.preventDefault();
      }}
      onPaste={(e) => {
        // Force plain-text paste so no markup leaks into the article copy.
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(multiline ? text : text.replace(/\n/g, ' ')));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        onChange((e.currentTarget as HTMLElement).innerText);
      }}
      className={cn(
        'outline-none cursor-text rounded-sm transition-shadow',
        'ring-2 ring-purple-400/70 ring-offset-2 ring-offset-transparent focus:ring-purple-500',
        'bg-purple-400/10 px-1.5 -mx-1.5 py-0.5',
        // Show the placeholder when the field is empty.
        'empty:before:content-[attr(data-placeholder)] empty:before:opacity-50',
        multiline && 'whitespace-pre-wrap',
        className,
      )}
    />
  );
}
