/**
 * EditableText — the smoothness keystone.
 *
 * An UNCONTROLLED contentEditable: React never owns its text children, so typing
 * does zero per-keystroke React work and the caret never jumps. Edits are
 * committed to the store on a short debounce (and flushed on blur). The store
 * value is only written back into the DOM when it changes *externally* while the
 * node is NOT focused.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMagazineStore } from '@/stores/magazineStore';
import { useEditorContext } from '../EditorContext';
import { textStyleToCss } from './regionStyle';
import { sanitizeRichText } from '../lib/sanitize';
import type { TextContent } from '@/types/magazine';
import { cn } from '@/lib/utils';

interface Props {
  regionId: string;
  className?: string;
}

export function EditableText({ regionId, className }: Props) {
  const { magazineId, pageId } = useEditorContext();

  const content = useMagazineStore((s) => {
    const p = s.magazines.find((m) => m.id === magazineId)?.pages.find((pg) => pg.id === pageId);
    const c = p?.content[regionId];
    return c && c.kind === 'text' ? (c as TextContent) : undefined;
  });
  const selected = useMagazineStore((s) => s.selectedRegionId === regionId && s.selectedPageId === pageId);
  const setText = useMagazineStore((s) => s.setText);
  const select = useMagazineStore((s) => s.select);

  const ref = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);

  // Sync DOM from store only when not focused (avoids caret reset while typing).
  // Sanitize on read too: content loaded from the server is rendered via innerHTML
  // here, so this is the edit-mode counterpart to the read-only view's sanitization.
  useEffect(() => {
    const el = ref.current;
    if (!el || focusedRef.current) return;
    const html = sanitizeRichText(content?.html ?? '');
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [content?.html]);

  const commit = useCallback(() => {
    const el = ref.current;
    if (!el || !magazineId || !pageId) return;
    setText(magazineId, pageId, regionId, el.innerHTML);
  }, [magazineId, pageId, regionId, setText]);

  const onInput = () => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(commit, 180);
  };

  useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  if (!content) return null;

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-region-id={regionId}
      onFocus={() => {
        focusedRef.current = true;
        select(regionId, pageId);
      }}
      onMouseDown={() => select(regionId, pageId)}
      onInput={onInput}
      onBlur={() => {
        focusedRef.current = false;
        window.clearTimeout(debounceRef.current);
        commit();
      }}
      onPaste={(e) => {
        // Insert as plain text so foreign markup can't break the fixed layout.
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
      className={cn(
        'outline-none cursor-text rounded-[2px] transition-shadow',
        'hover:ring-1 hover:ring-sky-400/50',
        selected && 'ring-2 ring-sky-500/80',
        className
      )}
      style={textStyleToCss(content.style)}
    />
  );
}
