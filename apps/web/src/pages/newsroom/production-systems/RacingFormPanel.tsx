import { RacingDataForm } from '@/components/RacingDataForm';
import type { RacingEntry } from '@/types/racingEntry';

interface RacingFormPanelProps {
  racingFormOpen: boolean;
  editRacing: RacingEntry | undefined;
  onClose: () => void;
  onSaved: () => void;
}

export function RacingFormPanel({ racingFormOpen, editRacing, onClose, onSaved }: RacingFormPanelProps) {
  if (!racingFormOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={editRacing ? 'Edit Racing Record' : 'Add Racing Record'}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div className="relative ml-auto w-full max-w-lg h-full overflow-y-auto bg-card border-l border-border/60 shadow-2xl flex flex-col">
        {/* The form — uses its own themed header/footer */}
        <div className="flex-1 overflow-y-auto">
          <RacingDataForm
            initial={editRacing}
            onSave={() => {
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
