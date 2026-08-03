/**
 * Post-level settings: identity, byline, taxonomy, cover treatment, SEO, access.
 *
 * Distinct from BlockInspector, which edits one block. The right pane switches
 * between the two rather than showing both — a single scrolling column of
 * everything is how these panels become unusable.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useComposerStore } from './composerStore';
import { mediaById } from '@/types/blog';
import type { CoverTreatment, SubscriptionTierLike } from './types';
import { X } from 'lucide-react';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

const inputCls =
  'w-full rounded-sm border border-border/60 bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none';

function Seg<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-sm border px-2.5 py-1.5 text-xs transition-colors',
            value === o.value
              ? 'border-primary/40 bg-primary/10 font-semibold text-primary'
              : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel() {
  const { blog, patchPost } = useComposerStore();
  const [tagInput, setTagInput] = useState('');

  if (!blog) return null;
  const cover = mediaById(blog, blog.cover?.mediaId);

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    if (!blog.tags.includes(tag)) patchPost({ tags: [...blog.tags, tag] });
    setTagInput('');
  };

  return (
    <div className="px-4 py-4">
      <p className="mb-4 border-b border-border/50 pb-3 font-[family-name:var(--font-display)] text-sm font-bold text-foreground">
        Post settings
      </p>

      <Field label="Subtitle">
        <input
          className={inputCls}
          aria-label="Subtitle"
          value={blog.subtitle ?? ''}
          placeholder="A standfirst under the headline"
          onChange={(e) => patchPost({ subtitle: e.target.value })}
        />
      </Field>

      <Field
        label="URL slug"
        hint={
          blog.publishedAt
            ? 'This post is published. Changing the slug keeps the old link working via a redirect.'
            : 'Derived from the title if left blank.'
        }
      >
        <input
          className={inputCls}
          aria-label="URL slug"
          value={blog.slug}
          onChange={(e) => patchPost({ slug: e.target.value })}
        />
        <p className="mt-1 truncate text-[11px] text-muted-foreground/70">/blog/{blog.slug}</p>
      </Field>

      <Field label="Excerpt" hint="Shown on cards and in shares. Taken from the first paragraph if blank.">
        <textarea
          className={cn(inputCls, 'min-h-[4.5rem] resize-y')}
          aria-label="Excerpt"
          value={blog.excerpt ?? ''}
          onChange={(e) => patchPost({ excerpt: e.target.value })}
        />
      </Field>

      {/* ── Byline ── */}
      <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
        Blog by
      </p>
      <Field label="Author name" hint="Free text — a pen name is fine.">
        <input
          className={inputCls}
          aria-label="Author name"
          value={blog.author.name}
          onChange={(e) => patchPost({ author: { ...blog.author, name: e.target.value } })}
        />
      </Field>
      <Field label="Author note" hint="A short bio shown at the foot of the post.">
        <textarea
          className={cn(inputCls, 'min-h-[3.5rem] resize-y')}
          aria-label="Author note"
          value={blog.author.bio ?? ''}
          onChange={(e) => patchPost({ author: { ...blog.author, bio: e.target.value } })}
        />
      </Field>

      {/* ── Taxonomy ── */}
      <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
        Filing
      </p>
      <Field label="Category">
        <input
          className={inputCls}
          aria-label="Category"
          value={blog.category ?? ''}
          placeholder="Bloodstock, Racing, Opinion…"
          onChange={(e) => patchPost({ category: e.target.value })}
        />
      </Field>
      <Field label="Tags">
        <div className="mb-1.5 flex flex-wrap gap-1">
          {blog.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-sm border border-border/60 bg-muted/40 px-1.5 py-0.5 text-xs"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => patchPost({ tags: blog.tags.filter((t) => t !== tag) })}
                className="text-muted-foreground hover:text-destructive"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <input
          className={inputCls}
          aria-label="Add a tag"
          value={tagInput}
          placeholder="Type a tag and press Enter"
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
        />
      </Field>

      {/* ── Cover ── */}
      <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
        Cover
      </p>
      {cover ? (
        <>
          <img
            src={cover.url}
            alt=""
            crossOrigin="anonymous"
            className="mb-2 aspect-[16/9] w-full rounded-sm border border-border/60 object-cover"
          />
          <Field label="Treatment">
            <Seg<CoverTreatment>
              ariaLabel="Cover treatment"
              value={blog.cover?.treatment ?? 'hero-full'}
              onChange={(treatment) =>
                patchPost({ cover: blog.cover ? { ...blog.cover, treatment } : undefined })
              }
              options={[
                { value: 'hero-full', label: 'Full hero' },
                { value: 'hero-split', label: 'Below title' },
                { value: 'inset', label: 'Inset' },
                { value: 'none', label: 'Hidden' },
              ]}
            />
          </Field>
          <button
            type="button"
            onClick={() => patchPost({ cover: undefined })}
            className="mb-4 text-xs text-muted-foreground underline hover:text-destructive"
          >
            Remove cover
          </button>
        </>
      ) : (
        <p className="mb-4 rounded-sm border border-dashed border-border/60 px-2.5 py-3 text-[11px] italic text-muted-foreground">
          Star an image in the media tray to make it the cover.
        </p>
      )}

      {/* ── SEO ── */}
      <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
        Search &amp; sharing
      </p>
      <Field label="Meta title" hint={`Falls back to the post title. ${(blog.seo.metaTitle ?? blog.title).length}/60`}>
        <input
          className={inputCls}
          aria-label="Meta title"
          value={blog.seo.metaTitle ?? ''}
          placeholder={blog.title}
          onChange={(e) => patchPost({ seo: { ...blog.seo, metaTitle: e.target.value } })}
        />
      </Field>
      <Field
        label="Meta description"
        hint={`Falls back to the excerpt. ${(blog.seo.metaDescription ?? blog.excerpt ?? '').length}/160`}
      >
        <textarea
          className={cn(inputCls, 'min-h-[3.5rem] resize-y')}
          aria-label="Meta description"
          value={blog.seo.metaDescription ?? ''}
          onChange={(e) => patchPost({ seo: { ...blog.seo, metaDescription: e.target.value } })}
        />
      </Field>
      <Field label="Indexing">
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={!!blog.seo.noindex}
            onChange={(e) => patchPost({ seo: { ...blog.seo, noindex: e.target.checked } })}
          />
          Ask search engines not to index this post
        </label>
      </Field>

      {/* ── Access ── */}
      <p className="mb-2 mt-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
        Access
      </p>
      <Field label="Minimum tier" hint="Above free, readers see the first paragraph and then the paywall.">
        <Seg<SubscriptionTierLike>
          ariaLabel="Minimum subscription tier"
          value={(blog.minTier ?? 'free') as SubscriptionTierLike}
          onChange={(minTier) => patchPost({ minTier })}
          options={[
            { value: 'free', label: 'Free' },
            { value: 'standard', label: 'Standard' },
            { value: 'premium', label: 'Premium' },
          ]}
        />
      </Field>

      <div className="mt-6 border-t border-border/50 pt-3 text-[11px] text-muted-foreground/70">
        <p>Reading time {blog.readingTime} min · {blog.blocks.length} blocks · {blog.media.length} images</p>
        {blog.slugHistory.length > 0 && <p className="mt-1">{blog.slugHistory.length} old URL(s) redirecting here</p>}
      </div>
    </div>
  );
}
