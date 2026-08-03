/**
 * The post's media pool.
 *
 * Uploading and placing are deliberately separate steps. An asset lands in the
 * tray first, then gets placed — as an image block, into a gallery, or as the
 * cover — which is what lets one upload be used in several places and have its
 * alt text edited once. It is also the surface the AI phase will draw from.
 */
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useComposerStore } from './composerStore';
import { image as makeImage, gallery as makeGallery } from '@/blog/factories';
import { blocksUsingMedia } from '@/types/blog';
import type { BlogMedia } from '@/types/blog';
import { ImagePlus, Loader2, Star, Trash2, Upload } from 'lucide-react';

export function MediaTray() {
  const { blog, uploading, addMedia, removeMedia, insertBlock, patchPost, selectedId } = useComposerStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  if (!blog) return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    // Sequential rather than parallel: each registration is a read-modify-write
    // of the same document's media array, so concurrent posts would race and
    // lose entries.
    for (const file of Array.from(files)) {
      await addMedia(file);
    }
  };

  /** Place an asset. Into the selected gallery if there is one, else as a new image block. */
  const place = (media: BlogMedia) => {
    const selected = blog.blocks.find((b) => b.id === selectedId);
    if (selected?.kind === 'gallery') {
      useComposerStore.getState().updateBlock(selected.id, {
        items: [...selected.items, { mediaId: media.id }],
      } as never);
      return;
    }
    insertBlock(makeImage(media.id));
  };

  const usageCount = (id: string) => blocksUsingMedia(blog.blocks, id).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Media · {blog.media.length}
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
        >
          <Upload size={12} />
          Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files);
            // Reset so re-picking the same file fires change again.
            e.target.value = '';
          }}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'slim-scroll flex-1 overflow-y-auto p-3 transition-colors',
          dragOver && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
        )}
      >
        {blog.media.length === 0 && !uploading ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border/60 py-10 text-center">
            <ImagePlus size={20} className="text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">Drop images here</p>
            <p className="text-[11px] text-muted-foreground/70">or use Upload above</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {blog.media.map((m) => {
              const uses = usageCount(m.id);
              const isCover = blog.cover?.mediaId === m.id;
              return (
                <div key={m.id} className="group relative overflow-hidden rounded-sm border border-border/60">
                  <img
                    src={m.url}
                    alt={m.alt}
                    crossOrigin="anonymous"
                    loading="lazy"
                    className="aspect-square w-full cursor-pointer object-cover"
                    onClick={() => place(m)}
                    title={uses > 0 ? `Used ${uses}×  ·  click to place again` : 'Click to place'}
                  />

                  {/* Usage badge — tells you at a glance what is already in the post. */}
                  {uses > 0 && (
                    <span className="absolute left-1 top-1 rounded-sm bg-black/70 px-1 text-[9px] font-bold text-white">
                      {uses}×
                    </span>
                  )}
                  {isCover && (
                    <span
                      className="absolute right-1 top-1 rounded-sm px-1 text-[9px] font-bold text-black"
                      style={{ background: 'hsl(var(--brand-accent))' }}
                    >
                      Cover
                    </span>
                  )}

                  {/* An asset with no alt text will fail accessibility review, so
                      flag it here rather than at publish time. */}
                  {!m.alt && (
                    <span className="absolute bottom-1 left-1 rounded-sm bg-amber-500/90 px-1 text-[9px] font-bold text-black">
                      no alt
                    </span>
                  )}

                  <div className="absolute inset-x-0 bottom-0 flex justify-end gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      title={isCover ? 'Remove as cover' : 'Set as cover'}
                      aria-label={isCover ? 'Remove as cover' : 'Set as cover'}
                      onClick={() =>
                        patchPost(
                          isCover
                            ? { cover: undefined }
                            : { cover: { mediaId: m.id, treatment: 'hero-full' } },
                        )
                      }
                      className="rounded p-1 text-white/80 hover:bg-white/20 hover:text-white"
                    >
                      <Star size={12} fill={isCover ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      title="Remove from post"
                      aria-label="Remove from post"
                      onClick={() => void removeMedia(m.id)}
                      className="rounded p-1 text-white/80 hover:bg-destructive/70 hover:text-white"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}

            {uploading > 0 && (
              <div className="flex aspect-square items-center justify-center rounded-sm border border-dashed border-border/60">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </div>

      {blog.media.length > 1 && (
        <div className="border-t border-border/50 p-3">
          <button
            type="button"
            onClick={() => insertBlock(makeGallery(blog.media.map((m) => m.id)))}
            className="w-full rounded-sm border border-border/60 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            Add all as a gallery
          </button>
        </div>
      )}
    </div>
  );
}
