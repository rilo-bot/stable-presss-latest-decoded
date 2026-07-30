import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { can } from '@/lib/permissions';
import { FileStoryChoice } from './FileStoryChoice';

interface NewsroomTopBarProps {
  activeNav: string;
  setActiveNav: (nav: string) => void;
  onNewInColumn: (status: 'draft') => void;
  onOpenStudio: () => void;
}

export function NewsroomTopBar({
  activeNav,
  setActiveNav,
  onNewInColumn,
  onOpenStudio,
}: NewsroomTopBarProps) {
  // One "File a Story" button; the AI-vs-manual split is a choice inside it.
  const [choiceOpen, setChoiceOpen] = useState(false);

  return (
    <div className="flex items-center justify-end px-4 md:px-6 py-3.5 border-b border-border/40 bg-card">
      <div className="flex items-center gap-3">
        {/* Role is shown once, in the sidebar's "Your Role(s)" block — not repeated here.
            Quick action buttons per active tab — Horses/Parties/Media/Racing "Add" actions
            live in their own Production System panel, not duplicated here */}

        {activeNav === 'bulletin-templates' && (
          <Button
            size="sm"
            variant="outline"
            className="text-sm gap-1.5"
            onClick={() => setActiveNav('workflow')}
          >
            Back to Workflow
          </Button>
        )}

        {activeNav !== 'horses' && activeNav !== 'parties' && activeNav !== 'media-production-system' && activeNav !== 'racing-production-system' && activeNav !== 'bulletin-templates' && can('content.draft.create') && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
            onClick={() => setChoiceOpen(true)}
          >
            <Plus size={13} />
            <span className="hidden sm:inline">File a Story</span>
            <span className="sm:hidden">New</span>
          </Button>
        )}
      </div>

      <FileStoryChoice
        open={choiceOpen}
        onClose={() => setChoiceOpen(false)}
        onAI={() => { setChoiceOpen(false); onOpenStudio(); }}
        onManual={() => { setChoiceOpen(false); onNewInColumn('draft'); }}
      />
    </div>
  );
}
