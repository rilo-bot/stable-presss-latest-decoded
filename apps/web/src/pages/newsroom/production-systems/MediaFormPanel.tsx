import { File, X } from 'lucide-react';
import { MediaDataForm } from '@/components/MediaDataForm';
import type { MediaItem } from '@/types/mediaItem';

interface MediaFormPanelProps {
  mediaFormOpen: boolean;
  editMedia: MediaItem | undefined;
  onClose: () => void;
  onSaved: () => void;
}

export function MediaFormPanel({ mediaFormOpen, editMedia, onClose, onSaved }: MediaFormPanelProps) {
  if (!mediaFormOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={editMedia ? 'Edit Media Record' : 'Add Media Record'}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div className="relative ml-auto w-full max-w-lg h-full overflow-y-auto bg-card border-l border-border/60 shadow-2xl flex flex-col">
        {/* Panel header */}
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-5 py-4 flex items-center justify-between border-b-2"
          style={{ borderBottomColor: 'hsl(var(--brand-accent))' }}
        >
          <div className="flex items-center gap-2.5">
            <File size={15} style={{ color: 'hsl(var(--brand-accent))' }} />
            <div>
              <p className="text-[12px] uppercase tracking-[0.16em] font-bold opacity-70">
                Media Records Production System
              </p>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold">
                {editMedia ? 'Edit Media Record' : 'Add New Media Record'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm border border-primary-foreground/20 hover:border-primary-foreground/50 transition-colors"
            aria-label="Close form"
          >
            <X size={14} />
          </button>
        </div>

        {/* The form */}
        <div className="flex-1 overflow-y-auto">
          <MediaDataForm
            initial={editMedia}
            onSave={(_id) => {
              onSaved();
            }}
            onCancel={onClose}
            compact
          />
        </div>
      </div>
    </div>
  );
}
