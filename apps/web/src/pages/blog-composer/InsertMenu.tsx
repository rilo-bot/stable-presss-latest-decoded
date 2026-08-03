/**
 * "Add a block" menu.
 *
 * Appears between blocks on hover and as the empty-state call to action. Image
 * and gallery are absent by design — they need a media id, so they are created
 * by clicking an asset in the tray. An empty image block would be dropped by the
 * validator on the next save, which reads as content vanishing.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { INSERTABLE_KINDS } from '@/blog/factories';
import type { Block } from '@/types/blog';
import { Plus } from 'lucide-react';

export function InsertMenu({
  onInsert,
  compact,
  align = 'left',
}: {
  onInsert: (block: Block) => void;
  compact?: boolean;
  align?: 'left' | 'center';
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a menu that traps focus in a canvas
  // full of contentEditables is worse than no menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cn('relative', align === 'center' && 'flex justify-center')}>
      <button
        type="button"
        aria-label="Add a block"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm border border-dashed transition-colors',
          open
            ? 'border-primary/50 bg-primary/5 text-primary'
            : 'border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-primary',
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-xs',
        )}
      >
        <Plus size={compact ? 11 : 13} />
        {compact ? 'Add' : 'Add a block'}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-sm border border-border bg-popover p-1 shadow-lg',
            'slim-scroll',
            align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0',
          )}
        >
          {INSERTABLE_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onInsert(k.make());
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-foreground">{k.label}</span>
                <span className="block text-[11px] text-muted-foreground">{k.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
