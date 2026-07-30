import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileStoryChoice } from './FileStoryChoice';

interface FileStoryButtonProps {
  onOpenStudio: () => void;
  onNewInColumn: (status: 'draft') => void;
}

/**
 * The newsroom's one primary action. Owns the AI-vs-manual chooser state so the
 * page header stays presentational and Newsroom.tsx doesn't carry another flag.
 */
export function FileStoryButton({ onOpenStudio, onNewInColumn }: FileStoryButtonProps) {
  const [choiceOpen, setChoiceOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
        onClick={() => setChoiceOpen(true)}
      >
        <Plus size={13} />
        <span className="hidden sm:inline">File a Story</span>
        <span className="sm:hidden">New</span>
      </Button>

      <FileStoryChoice
        open={choiceOpen}
        onClose={() => setChoiceOpen(false)}
        onAI={() => { setChoiceOpen(false); onOpenStudio(); }}
        onManual={() => { setChoiceOpen(false); onNewInColumn('draft'); }}
      />
    </>
  );
}
