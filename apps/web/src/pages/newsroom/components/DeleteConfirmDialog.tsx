import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DeleteConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Confirm delete" className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div aria-hidden onClick={onCancel} className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />
      <div className="relative z-[1] w-[min(94vw,440px)] rounded-sm border border-destructive/30 bg-card shadow-xl">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50">
          <Trash2 size={15} className="text-destructive flex-shrink-0" />
          <span className="text-sm font-bold text-foreground">{title}</span>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-foreground leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50 bg-muted/20">
          <Button size="sm" variant="outline" className="text-sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" className="text-sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
