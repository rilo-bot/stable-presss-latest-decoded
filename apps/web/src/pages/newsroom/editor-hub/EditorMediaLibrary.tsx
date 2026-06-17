import { Upload, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import type { Article } from '@/types/article';
import type { Horse } from '@/types/horse';
import type { MediaItem } from '@/types/mediaItem';

interface EditorMediaLibraryProps {
  articles: Article[];
  mediaItems: MediaItem[];
  horses: Horse[];
  onOpenMediaForm: (item?: MediaItem) => void;
  onMediaDelete: (item: MediaItem) => void;
}

export function EditorMediaLibrary({ articles, mediaItems, horses, onOpenMediaForm, onMediaDelete }: EditorMediaLibraryProps) {
  const allArticles = articles ?? [];
  const publishedWithMedia = allArticles.filter(
    (a) => a.status === 'published' || a.status === 'newsletter' || a.status === 'bulletin'
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="border-2 border-dashed border-primary/30 rounded-sm p-6 flex flex-col items-center justify-center gap-3 hover:border-primary/50 transition-colors cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="Upload media asset"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
          onClick={() => onOpenMediaForm()}
        >
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Upload size={18} className="text-primary" />
          </div>
          <div className="text-center">
            <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground mb-0.5">Upload Media</p>
            <p className="text-[13px] text-muted-foreground">Add images, graphics, and audio for any story.</p>
          </div>
          <Button size="sm" variant="outline" className="text-sm gap-1.5">
            <Upload size={11} />Choose Files
          </Button>
        </div>

        <div className="border border-border/60 rounded-sm p-5 bg-card space-y-3">
          <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Library Stats</p>
          {[
            { label: 'Total Published Stories', value: publishedWithMedia.length },
            { label: 'Media Records (Production System)', value: (mediaItems ?? []).length },
            { label: 'Storage Used', value: '—' },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">{s.label}</span>
              <span className="text-[13px] font-bold tabular-nums text-primary">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border/40 bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen size={13} className="text-muted-foreground" />
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Media Records</p>
          </div>
          <p className="text-[12px] text-muted-foreground italic">Editor view — full access</p>
        </div>
        {(mediaItems ?? []).length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={FolderOpen}
              heading="No media records yet."
              description="Add photos, video, press and publications here. Each record links to a horse and surfaces automatically on that horse's profile."
              ctaLabel="Add Media"
              onCta={() => onOpenMediaForm()}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {['Title', 'Type', 'Horse', 'Source', 'Manage'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(mediaItems ?? []).map((item, idx) => {
                  const horse = horses.find((h) => h.id === item.horse_id);
                  return (
                    <tr key={item.id} className={cn('border-b border-border/30 hover:bg-muted/10 transition-colors', idx % 2 === 0 ? 'bg-card' : 'bg-background')}>
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="text-sm font-medium text-foreground line-clamp-1 block">{item.title}</span>
                        {item.subject && <span className="text-[12px] text-muted-foreground line-clamp-1 block">{item.subject}</span>}
                      </td>
                      <td className="px-4 py-3"><span className="text-[12px] uppercase tracking-[0.08em] font-semibold text-primary">{item.media_type}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-muted-foreground">{horse ? (horse.isUnnamed ? 'Un-Named' : horse.name) : '—'}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-muted-foreground">{item.source_publication ?? '—'}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => onOpenMediaForm(item)}
                            className="text-[12px] uppercase tracking-[0.08em] font-semibold text-primary hover:text-primary/80 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onMediaDelete(item)}
                            className="text-[12px] uppercase tracking-[0.08em] font-semibold text-destructive hover:text-destructive/80 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
