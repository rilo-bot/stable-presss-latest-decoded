// Makes an article field clickable while the Article Studio drawer is open: a
// click selects it (purple ring + label tag) and tells the assistant to focus
// it. When the studio is closed it renders its children untouched, so the public
// reading experience is unchanged.

import { useArticleStudioUi } from '@/stores/articleStudioUiStore';
import { cn } from '@/lib/utils';

interface Props {
  fieldId: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function SelectableField({ fieldId, label, children, className }: Props) {
  const open = useArticleStudioUi((s) => s.open);
  const selected = useArticleStudioUi((s) => s.selectedFieldId === fieldId);
  const select = useArticleStudioUi((s) => s.select);

  if (!open) return <>{children}</>;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Select ${label} to edit with AI`}
      onClick={(e) => {
        e.stopPropagation();
        select(fieldId);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select(fieldId);
        }
      }}
      className={cn(
        'relative cursor-pointer rounded-sm transition-shadow ring-offset-2 ring-offset-transparent',
        selected ? 'ring-2 ring-purple-500' : 'hover:ring-2 hover:ring-purple-400/50',
        className,
      )}
    >
      {selected && (
        <span className="pointer-events-none absolute -top-2.5 left-2 z-10 rounded-full bg-purple-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
