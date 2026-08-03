/**
 * "New post" — a short form before the editor.
 *
 * Dropping straight into a blank canvas means the decisions that shape a post
 * (its headline, its cover, where it files) get made last or not at all. Five
 * fields up front, all of them changeable later, and the post opens with its
 * cover already in place.
 *
 * Only the title is required. Everything else can be filled in from the rail.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ImagePlus, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { uploadImage } from '@/lib/upload';
import { useAuthStore } from '@/stores/authStore';
import { useBlogStore } from '@/stores/blogStore';
import { newBlockId, paragraph } from '@/blog/factories';
import { Field, TextArea, TextInput } from './controls';
import type { Blog, BlogMedia } from '@/types/blog';

/**
 * The cover, uploaded to storage but not yet attached to a post.
 *
 * It carries its own `id`, minted here, so the create call can send the pool
 * entry AND the cover reference together in one request. Letting the server
 * generate the id would leave nothing to point `cover.mediaId` at.
 */
interface PendingCover {
  id: string;
  url: string;
  key?: string;
  filename: string;
  contentType: string;
  width?: number;
  height?: number;
  bytes: number;
  alt: string;
}

export default function BlogCreateForm() {
  const navigate = useNavigate();
  const createBlog = useBlogStore((s) => s.createBlog);
  const displayName = useAuthStore((s) => s.currentUser?.displayName);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [author, setAuthor] = useState(displayName ?? '');
  const [category, setCategory] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [cover, setCover] = useState<PendingCover | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Upload to storage now; it travels with the create call below. */
  const pickCover = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImage(file, { kind: 'blog', maxDim: 2000, quality: 0.82 });
      const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = result.url;
      });
      setCover({
        id: newBlockId(), // any stable unique id; the cover reference needs one
        url: result.url,
        key: result.key,
        filename: file.name,
        contentType: file.type || 'image/jpeg',
        width: dims?.w,
        height: dims?.h,
        bytes: file.size,
        alt: '',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload that image');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Give the post a title.');
      return;
    }
    setSaving(true);

    // ONE call, cover included. An earlier version created the post and then
    // PUT the cover separately — but PUT is a full replace, so that second
    // request silently wiped every field it didn't resend (subtitle, category).
    // The create endpoint already validates `cover.mediaId` against `media`, so
    // sending them together is both simpler and safe.
    //
    // Starts with one empty paragraph so the editor opens with a cursor rather
    // than an empty-state prompt — the standard shape is cover, title, body.
    const created = await createBlog({
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      author: { name: author.trim() || displayName || 'Staff' },
      category: category.trim() || undefined,
      excerpt: excerpt.trim() || undefined,
      blocks: [paragraph()],
      media: cover ? [{ ...cover, kind: 'image' } as BlogMedia] : [],
      cover: cover ? { mediaId: cover.id, treatment: 'hero-full' } : undefined,
      tags: [],
    } as Partial<Blog>);

    if (!created) {
      setSaving(false);
      return;
    }

    navigate(`/production-system/blogs/${created.id}`);
  };

  return (
    <div className="mx-auto max-w-xl px-1 py-2">
      <button
        type="button"
        onClick={() => navigate('/production-system/blogs')}
        className="mb-4 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={13} />
        All posts
      </button>

      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">New blog post</h1>
      <p className="mb-6 mt-1 text-xs text-muted-foreground">
        Just the basics — everything here can be changed later while you write.
      </p>

      <form onSubmit={submit}>
        <Field label="Title" hint="Required. The URL is made from this.">
          <TextInput
            ariaLabel="Title"
            value={title}
            placeholder="A Morning at the Yearling Sales"
            onChange={setTitle}
          />
        </Field>

        <Field label="Standfirst" hint="Optional — one line under the headline.">
          <TextInput ariaLabel="Standfirst" value={subtitle} placeholder="Three weeks on the road" onChange={setSubtitle} />
        </Field>

        <Field label="Cover image" hint="Optional. Appears at the top of the post and on its card.">
          {cover ? (
            <div className="relative overflow-hidden rounded-sm border border-border/60">
              <img
                src={cover.url}
                alt=""
                crossOrigin="anonymous"
                className="aspect-[16/9] w-full object-cover"
              />
              <button
                type="button"
                aria-label="Remove cover"
                onClick={() => setCover(null)}
                className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white/90 hover:bg-destructive/80"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void pickCover(e.dataTransfer.files);
              }}
              className={cn(
                'flex w-full flex-col items-center gap-2 rounded-sm border border-dashed py-10 transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40',
              )}
            >
              {uploading ? (
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              ) : (
                <ImagePlus size={20} className="text-muted-foreground/50" />
              )}
              <span className="text-xs text-muted-foreground">
                {uploading ? 'Uploading…' : 'Drop an image here, or click to choose'}
              </span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pickCover(e.target.files);
              e.target.value = '';
            }}
          />
        </Field>

        <Field label="Byline">
          <TextInput ariaLabel="Byline" value={author} placeholder="Who wrote it" onChange={setAuthor} />
        </Field>

        <Field label="Category" hint="Optional.">
          <TextInput ariaLabel="Category" value={category} placeholder="Bloodstock, Racing, Opinion…" onChange={setCategory} />
        </Field>

        <Field label="Summary" hint="Optional — taken from your first paragraph if left blank.">
          <TextArea ariaLabel="Summary" value={excerpt} onChange={setExcerpt} rows={2} />
        </Field>

        <div className="mt-6 flex items-center gap-2">
          <Button type="submit" disabled={saving || uploading} className="gap-1.5">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create and start writing
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/production-system/blogs')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
