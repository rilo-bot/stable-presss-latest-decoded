import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { can, canOpenModule } from '@/lib/permissions';
import type { UserRole } from '@/stores/authStore';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { Article } from '@/types/article';
import type { ArticleUpdate } from '@/stores/articleStore';
import type { Horse } from '@/types/horse';
import type { MediaItem } from '@/types/mediaItem';
import type { Sale } from '@/types/sale';
import type { HorseReport } from '@/types/horseReport';
import { EDITOR_TABS } from '../constants';
import type { EditorTab } from '../constants';
import { EditorReviewQueue } from './EditorReviewQueue';
import { EditorAssignments } from './EditorAssignments';
import { EditorApprovalRouting } from './EditorApprovalRouting';
import { EditorScheduling } from './EditorScheduling';
import { EditorMediaLibrary } from './EditorMediaLibrary';
import { HorseRecordsTab } from '../production-systems/HorseRecordsTab';

interface EditorHubViewProps {
  userRole: UserRole | null;
  editorTab: EditorTab;
  setEditorTab: (tab: EditorTab) => void;
  // Shared data + handlers
  articles: Article[];
  buckets: Record<KanbanStatus, Article[]>;
  onAdvance: (articleId: string, toStatus: KanbanStatus) => void;
  onEdit: (article: Article) => void;
  onNewInColumn: (status: KanbanStatus) => void;
  onOpenStudio: () => void;
  // Assignments
  assignDialogArticle: Article | null;
  setAssignDialogArticle: (a: Article | null) => void;
  assignNote: string;
  setAssignNote: (v: string) => void;
  updateArticle: (id: string, updates: ArticleUpdate) => Promise<boolean>;
  // Media library
  mediaItems: MediaItem[];
  horses: Horse[];
  onOpenMediaForm: (item?: MediaItem) => void;
  onMediaDelete: (item: MediaItem) => void;
  // Horse records
  salesRecords: Sale[];
  reportRecords: HorseReport[];
  setEditSale: (s: Sale | undefined) => void;
  setSalesFormOpen: (v: boolean) => void;
  removeSale: (id: string) => void;
  setEditReport: (r: HorseReport | undefined) => void;
  setReportFormOpen: (v: boolean) => void;
  removeReport: (id: string) => void;
}

export function EditorHubView(props: EditorHubViewProps) {
  const { userRole, editorTab, setEditorTab } = props;
  // Each tab is both a module (an admin can untick it on a custom role) and an
  // action — a tab needs both to show.
  const availableTabs = EDITOR_TABS.filter(
    (t) => canOpenModule(t.id) && can(userRole, t.permission),
  );
  const activeTab = availableTabs.find((t) => t.id === editorTab)?.id ?? availableTabs[0]?.id;

  return (
    <div className="space-y-5">
      {userRole === 'administrator' && (
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-sm border text-[13px] font-medium"
          style={{ borderColor: 'hsl(var(--primary) / 0.25)', background: 'hsl(var(--primary) / 0.06)', color: 'hsl(var(--primary))' }}
        >
          <Star size={13} />
          Viewing Editor Hub as Administrator — full editorial access granted.
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-border/50 pb-0">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setEditorTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-[13px] uppercase tracking-[0.1em] font-semibold border-b-2 transition-all -mb-px',
              activeTab === tab.id
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
            )}
            aria-selected={activeTab === tab.id}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {availableTabs.find((t) => t.id === activeTab) && (
        <p className="text-[13px] text-muted-foreground leading-relaxed -mt-1">
          {availableTabs.find((t) => t.id === activeTab)?.description}
        </p>
      )}

      <div>
        {activeTab === 'review-queue' && (
          <EditorReviewQueue
            buckets={props.buckets}
            onNewInColumn={props.onNewInColumn}
            onOpenStudio={props.onOpenStudio}
            onAdvance={props.onAdvance}
            onEdit={props.onEdit}
          />
        )}
        {activeTab === 'assignments' && (
          <EditorAssignments
            articles={props.articles}
            assignDialogArticle={props.assignDialogArticle}
            setAssignDialogArticle={props.setAssignDialogArticle}
            assignNote={props.assignNote}
            setAssignNote={props.setAssignNote}
            updateArticle={props.updateArticle}
            onNewInColumn={props.onNewInColumn}
            onOpenStudio={props.onOpenStudio}
            onEdit={props.onEdit}
          />
        )}
        {activeTab === 'approval-routing' && (
          <EditorApprovalRouting
            articles={props.articles}
            onAdvance={props.onAdvance}
            setEditorTab={props.setEditorTab}
          />
        )}
        {activeTab === 'scheduling' && (
          <EditorScheduling
            articles={props.articles}
            buckets={props.buckets}
            onAdvance={props.onAdvance}
            setEditorTab={props.setEditorTab}
          />
        )}
        {activeTab === 'media-library' && (
          <EditorMediaLibrary
            articles={props.articles}
            mediaItems={props.mediaItems}
            horses={props.horses}
            onOpenMediaForm={props.onOpenMediaForm}
            onMediaDelete={props.onMediaDelete}
          />
        )}
        {activeTab === 'horse-records' && (
          <HorseRecordsTab
            horses={props.horses}
            salesRecords={props.salesRecords}
            reportRecords={props.reportRecords}
            setEditSale={props.setEditSale}
            setSalesFormOpen={props.setSalesFormOpen}
            removeSale={props.removeSale}
            setEditReport={props.setEditReport}
            setReportFormOpen={props.setReportFormOpen}
            removeReport={props.removeReport}
          />
        )}
      </div>
    </div>
  );
}
