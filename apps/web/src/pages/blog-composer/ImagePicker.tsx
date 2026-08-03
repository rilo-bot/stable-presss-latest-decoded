/**
 * Image picker — what replaced the permanent media-tray column.
 *
 * The pool still exists in the document (it is what makes one upload placeable
 * several times, and alt text editable once), it just isn't a column any more.
 * It surfaces here, on demand, when someone is actually choosing a picture.
 *
 * Opens either from "+ → Image" or from dropping files on the canvas.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useComposerStore } from './composerStore';
import { blocksUsingMedia } from '@/types/blog';
import type { BlogMedia } from '@/types/blog';
import { ImagePlus, Loader2, Trash2, Upload, X } from 'lucide-react';

export function ImagePicker({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen asset. The caller decides what to do with it. */
  onChoose: (media: BlogMedia) => void;
}) {
  const { blog, uploading, addMedia, removeMedia } = useComposerStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Straight to the file dialog when the pool is empty — making someone click
  // "Upload" inside an empty picker is a step with no information in it.
  useEffect(() => {
    if (open && blog && blog.media.length === 0 && uploading === 0) {
      fileRef.current?.click();
    }
  }, [open, blog?.media.length, uploading]);

  if (!open || !blog) return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    // Sequential: each registration is a read-modify-write of the same
    // document's media array, so parallel posts would lose entries.
    let last: BlogMedia | null = null;
    for (const file of Array.from(files)) {
      last = await addMedia(file);
    }
    // One file picked reads as "use this one", so place it and get out of the way.
    if (last && files.length === 1) {
      onChoose(last);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose an image"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-sm border border-border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">
            Images in this post
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <Upload size={12} />
              Upload
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = ''; // so re-picking the same file fires change again
          }}
        />

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
            'slim-scroll flex-1 overflow-y-auto p-4 transition-colors',
            dragOver && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
          )}
        >
          {blog.media.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border/60 py-14 text-center transition-colors hover:border-primary/40"
            >
              {uploading > 0 ? (
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              ) : (
                <ImagePlus size={22} className="text-muted-foreground/50" />
              )}
              <span className="text-xs text-muted-foreground">
                {uploading > 0 ? 'Uploading…' : 'Drop images here, or click to choose files'}
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {blog.media.map((m) => {
                const uses = blocksUsingMedia(blog.blocks, m.id).length;
                return (
                  <div key={m.id} className="group relative overflow-hidden rounded-sm border border-border/60">
                    <button
                      type="button"
                      onClick={() => {
                        onChoose(m);
                        onClose();
                      }}
                      className="block w-full"
                      title={uses > 0 ? `Already used ${uses}× — place again` : 'Place this image'}
                    >
                      <img
                        src={m.url}
                        alt={m.alt}
                        crossOrigin="anonymous"
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    </button>
                    {uses > 0 && (
                      <span className="absolute left-1 top-1 rounded-sm bg-black/70 px-1 text-[9px] font-bold text-white">
                        {uses}×
                      </span>
                    )}
                    {/* Flagged at authoring time rather than at publish. */}
                    {!m.alt && (
                      <span className="absolute bottom-1 left-1 rounded-sm bg-amber-500/90 px-1 text-[9px] font-bold text-black">
                        no alt
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Remove from post"
                      title="Remove from post"
                      onClick={() => void removeMedia(m.id)}
                      className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:bg-destructive/80 hover:text-white group-hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
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

        <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          Uploaded once, placeable anywhere. Alt text and credit are stored per image, not per placement.
        </p>
      </div>
    </div>
  );
}
