import { Plus, FileText, Users, CheckCircle, Eye, EyeOff, RotateCcw, Trash, Edit, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { MagazineSummary, IssueSummary } from '@/types/magazine';

interface MagazineStudioProps {
  magazines: MagazineSummary[];
  magIssues: IssueSummary[];
  onNewMagazine: () => void;
  onOpenMagazine: (id: string) => void;
  onDeleteMagazine: (id: string) => void;
  onUpdateEdition: (magId: string, issue: { id: string; scope: 'full' | 'selected' }) => void;
  onUnpublishEdition: (id: string) => void;
  onDeleteEdition: (id: string) => void;
}

export function MagazineStudio({
  magazines,
  magIssues,
  onNewMagazine,
  onOpenMagazine,
  onDeleteMagazine,
  onUpdateEdition,
  onUnpublishEdition,
  onDeleteEdition,
}: MagazineStudioProps) {
  // magIssues is loaded with includeUnpublished, so it holds both live + hidden editions.
  const editionsFor = (magId: string) =>
    magIssues
      .filter((i) => i.magazineId === magId)
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const liveCountFor = (magId: string) =>
    magIssues.filter((i) => i.magazineId === magId && !i.unpublishedAt).length;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[12px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
            Bulletin Magazine Builder
          </p>
          <p className="text-sm text-muted-foreground">
            {magazines.length === 0
              ? 'Design a full multi-page bulletin magazine, then publish it to the public Bulletins page.'
              : `${magazines.length} magazine${magazines.length !== 1 ? 's' : ''} in your studio`}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
          onClick={onNewMagazine}
        >
          <Plus size={13} />
          New Magazine
        </Button>
      </div>

      {magazines.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          heading="Start your first bulletin magazine."
          description="Open the full-screen studio to edit a 20-page NZTROF-style magazine — headlines, copy, photos and QR codes are all editable in place. Publish the full edition or selected pages to the public Bulletins page."
          ctaLabel="Create a Magazine"
          onCta={onNewMagazine}
          size="lg"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {magazines.map((mag) => {
            const editions = editionsFor(mag.id);
            const liveCount = liveCountFor(mag.id);
            return (
              <div
                key={mag.id}
                className="border border-border/60 rounded-sm bg-card overflow-hidden flex flex-col"
              >
                <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
                  <div className="flex items-start gap-2">
                    <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground line-clamp-1 flex-1">
                      {mag.title}
                    </p>
                    {mag.myRole !== 'owner' && (
                      <span className="flex-shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-sky-600">
                        {mag.myRole === 'editor' ? 'Shared · Editor' : 'Shared · Contributor'}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5">{mag.edition}</p>
                </div>
                <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <FileText size={11} /> {mag.pageCount} pages
                  </span>
                  {liveCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle size={11} /> {liveCount} live
                    </span>
                  )}
                  {mag.collaborators.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} /> {mag.collaborators.length} collaborator{mag.collaborators.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {mag.myRole === 'owner' && mag.ownerName && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground/70">You own this</span>
                  )}
                  {mag.myRole !== 'owner' && mag.ownerName && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground/70">by {mag.ownerName}</span>
                  )}
                </div>

                {/* Published editions — manage what readers see */}
                {editions.length > 0 && (
                  <div className="px-4 pb-3 space-y-1.5 border-t border-border/40 pt-2.5">
                    <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                      Editions
                    </p>
                    {editions.map((issue) => {
                      const live = !issue.unpublishedAt;
                      return (
                        <div key={issue.id} className="flex items-center gap-1.5 text-[12px]">
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full flex-shrink-0',
                              live ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                            )}
                            title={live ? 'Live on Bulletins' : 'Hidden from the public'}
                          />
                          <span className="font-semibold text-foreground tabular-nums">v{issue.version}</span>
                          <span className="text-muted-foreground truncate">
                            {issue.scope === 'selected' ? `${issue.pageCount}p` : 'full'} · {fmtDate(issue.publishedAt)}
                          </span>
                          <span className="ml-auto flex items-center gap-0.5">
                            {live && (
                              <a
                                href={`/bulletins/${issue.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View on Bulletins"
                                className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/60"
                              >
                                <Eye size={12} />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => onUpdateEdition(mag.id, issue)}
                              title={live ? 'Update from current draft' : 'Republish (make live again)'}
                              className="p-1 rounded-sm text-muted-foreground hover:text-primary hover:bg-muted/60"
                            >
                              <RotateCcw size={12} />
                            </button>
                            {live && (
                              <button
                                type="button"
                                onClick={() => onUnpublishEdition(issue.id)}
                                title="Unpublish (hide from public)"
                                className="p-1 rounded-sm text-muted-foreground hover:text-amber-600 hover:bg-muted/60"
                              >
                                <EyeOff size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteEdition(issue.id)}
                              title="Delete edition permanently"
                              className="p-1 rounded-sm text-muted-foreground hover:text-destructive hover:bg-muted/60"
                            >
                              <Trash size={12} />
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-auto flex items-center gap-2 px-4 py-3 border-t border-border/40">
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm flex-1"
                    onClick={() => onOpenMagazine(mag.id)}
                  >
                    <Edit size={12} /> {mag.myRole === 'contributor' ? 'Open my pages' : 'Open'}
                  </Button>
                  {mag.myRole === 'owner' && (
                    <button
                      onClick={() => onDeleteMagazine(mag.id)}
                      className="text-[12px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors px-2"
                      aria-label={`Delete ${mag.title}`}
                    >
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-sm border border-border/50 bg-muted/20">
        <Eye size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Magazines you publish appear on the public <strong className="text-foreground">Bulletins</strong> page as
          readable editions. Edit text, swap photos and set QR links live in the studio. Under each magazine you can
          view, <strong className="text-foreground">update</strong> an edition from the current draft,{' '}
          <strong className="text-foreground">unpublish</strong> it to hide it from readers, or delete it.
        </p>
      </div>
    </div>
  );
}
