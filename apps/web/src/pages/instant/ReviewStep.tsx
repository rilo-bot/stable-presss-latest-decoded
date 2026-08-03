/**
 * Instant, step two: review before anything is saved.
 *
 * Everything the agent wrote is editable here, and the ✨ chips are the same
 * `AiComposeButton` the article and horse forms use — one field-composer in the
 * codebase, not a second one grown inside this module.
 *
 * The two modes render different rails because they save to different shapes:
 * a story has a category and no excerpt (its `summary` field IS the body), a post
 * has an excerpt and no taxonomy. See docs/INSTANT-CAPTURE-PLAN.md §2.
 */
import { useMemo } from 'react';
import { AlertTriangle, ArrowLeft, Check, Loader2, RotateCcw } from 'lucide-react';

import { AiComposeButton } from '@/agent/compose/AiComposeButton';
import { BlogRenderer } from '@/blog/BlogRenderer';

import { CATEGORY_OPTIONS } from './categories';
import { PhotoTray } from './PhotoTray';
import { blogPlainText, buildBlogPayload } from './buildBlocks';
import { useInstantStore } from './instantStore';
import { isUsable } from './types';

/** Label + ✨, the header every field in here shares. */
function FieldHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-[12.5px] font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}

export function ReviewStep() {
  const {
    mode, topic, transcript, photos, coverPhotoId, story, blog, needsFacts, saving,
    patchStory, patchBlog,
    setCover, setCaption, removePhoto, backToCapture, generate, save,
  } = useInstantStore();

  const usablePhotos = photos.filter(isUsable);

  /* The preview is built from the SAME function that builds the save payload, so
     what is shown cannot drift from what is stored. Rebuilt on any change to the
     body, the photos or the cover choice — the photo placement depends on all
     three (an image block sits before each heading, and the cover is excluded). */
  const { blocks: previewBlocks, media: previewMedia } = useMemo(
    () => (mode === 'blog'
      ? buildBlogPayload(blog, photos, coverPhotoId)
      : { blocks: [], media: [] }),
    [mode, blog, photos, coverPhotoId],
  );

  /** What the ✨ chips are allowed to know. The same sources the draft had. */
  const composeContext = () => ({
    mode,
    topic,
    reporterVoiceNote: transcript,
    photoNotes: usablePhotos.map((p) => p.note).filter(Boolean),
    photoCaptions: usablePhotos.map((p) => p.caption).filter(Boolean),
    title: mode === 'story' ? story.title : blog.title,
    bodySoFar: mode === 'story' ? story.body : blogPlainText(blog),
    note:
      'Do not introduce any name, result, date, price or figure that is not already present in these fields.',
  });

  const entityKind = mode === 'story' ? 'news story' : 'blog post';

  const tagsValue = (mode === 'story' ? story.tags : blog.tags).join(', ');
  const setTags = (raw: string) => {
    const tags = raw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 6);
    if (mode === 'story') patchStory({ tags });
    else patchBlog({ tags });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      {needsFacts && (
        <p className="flex items-start gap-2.5 rounded-sm border border-[hsl(var(--brand-accent)/0.45)] bg-[hsl(var(--brand-accent)/0.08)] px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-[hsl(var(--brand-accent))]" />
          <span>
            <strong className="font-semibold">Check the facts before you file this.</strong> A photograph can show
            what happened but never who or which — the AI has written only what your sources supported, and has
            flagged that names, results or dates are still missing.
          </span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Main column ── */}
        <div className="space-y-4">
          <div className="rounded-sm border border-border/60 bg-card p-4">
            <FieldHeader label="Title">
              <AiComposeButton
                label="Title"
                fieldKey="title"
                entityKind={entityKind}
                getContext={composeContext}
                getCurrentValue={() => (mode === 'story' ? story.title : blog.title)}
                onAccept={(text) => (mode === 'story' ? patchStory({ title: text }) : patchBlog({ title: text }))}
              />
            </FieldHeader>
            <input
              value={mode === 'story' ? story.title : blog.title}
              onChange={(e) =>
                mode === 'story' ? patchStory({ title: e.target.value }) : patchBlog({ title: e.target.value })
              }
              aria-label="Title"
              className="w-full rounded-sm border border-input bg-background px-3 py-2.5 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            {mode === 'blog' && (
              <div className="mt-3">
                <FieldHeader label="Standfirst (optional)" />
                <input
                  value={blog.subtitle}
                  onChange={(e) => patchBlog({ subtitle: e.target.value })}
                  placeholder="One sentence under the title"
                  aria-label="Standfirst"
                  className="w-full rounded-sm border border-input bg-background px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}
          </div>

          {/* Body — one plain textarea for a story, section groups for a post. */}
          {mode === 'story' ? (
            <div className="rounded-sm border border-border/60 bg-card p-4">
              <FieldHeader label="Body">
                <AiComposeButton
                  label="Body"
                  fieldKey="body"
                  entityKind={entityKind}
                  getContext={composeContext}
                  getCurrentValue={() => story.body}
                  onAccept={(text) => patchStory({ body: text })}
                />
              </FieldHeader>
              <textarea
                value={story.body}
                onChange={(e) => patchStory({ body: e.target.value })}
                rows={16}
                aria-label="Story body"
                className="w-full resize-y rounded-sm border border-input bg-background px-3 py-2.5 text-[13.5px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                Plain paragraphs, separated by a blank line — a story&apos;s body is stored as plain text.
              </p>
            </div>
          ) : (
            /* Blog body: a PREVIEW, not an editor.
             *
             * It renders through the real `BlogRenderer` with the real blocks, so
             * what you see here is what the post will be — and editing happens in
             * the composer, which opens the moment this is saved. The alternative
             * was a second block editor inside Instant: `BodyToolbar` and
             * `BlockCanvas` are both bound to `useComposerStore`, which owns one
             * SAVED post plus its autosave and conflict handling, so embedding
             * them would have meant refactoring two shared components that the
             * composer depends on. */
            <div className="rounded-sm border border-border/60 bg-card p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-medium text-foreground">Body</span>
                <span className="text-[11.5px] text-muted-foreground">
                  {previewBlocks.length} block{previewBlocks.length === 1 ? '' : 's'} · edit after saving
                </span>
              </div>

              {previewBlocks.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                  The draft came back empty. Try Regenerate, or add more to the capture.
                </p>
              ) : (
                <div className="max-h-[32rem] overflow-y-auto rounded-sm border border-border/40 bg-background px-4 py-3">
                  <BlogRenderer blocks={previewBlocks} media={previewMedia} />
                </div>
              )}

              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                Headings, lists and your photos are already laid out. Saving opens this in the composer, where the
                full toolbar — <strong className="font-semibold">B I U · H2 H3 · lists · quotes · images</strong> —
                edits it in place.
              </p>
            </div>
          )}
        </div>

        {/* ── Rail ── */}
        <div className="space-y-4">
          <div className="space-y-4 rounded-sm border border-border/60 bg-card p-4">
            {mode === 'story' ? (
              <div>
                <FieldHeader label="Category" />
                <select
                  value={story.category}
                  onChange={(e) => patchStory({ category: e.target.value })}
                  aria-label="Category"
                  className="w-full rounded-sm border border-input bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">No category</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                  Decides which section of the site carries it.
                </p>
              </div>
            ) : (
              <div>
                <FieldHeader label="Excerpt">
                  <AiComposeButton
                    label="Excerpt"
                    fieldKey="excerpt"
                    entityKind={entityKind}
                    getContext={composeContext}
                    getCurrentValue={() => blog.excerpt}
                    onAccept={(text) => patchBlog({ excerpt: text })}
                  />
                </FieldHeader>
                <textarea
                  value={blog.excerpt}
                  onChange={(e) => patchBlog({ excerpt: e.target.value })}
                  rows={4}
                  aria-label="Excerpt"
                  className="w-full resize-y rounded-sm border border-input bg-background px-3 py-2 text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-1.5 text-[11.5px] text-muted-foreground">Shown on cards and search results.</p>
              </div>
            )}

            <div>
              <FieldHeader label="Tags">
                <AiComposeButton
                  label="Tags"
                  fieldKey="tags"
                  entityKind={entityKind}
                  getContext={composeContext}
                  getCurrentValue={() => tagsValue}
                  onAccept={setTags}
                />
              </FieldHeader>
              <input
                value={tagsValue}
                onChange={(e) => setTags(e.target.value)}
                placeholder="flemington, trackwork"
                aria-label="Tags"
                className="w-full rounded-sm border border-input bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">Comma-separated, up to six.</p>
            </div>

            <div>
              <FieldHeader label={usablePhotos.length > 1 ? 'Photos & cover' : 'Cover image'} />
              {photos.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No photos in this capture.</p>
              ) : (
                <>
                  <PhotoTray
                    photos={photos}
                    coverPhotoId={coverPhotoId}
                    onRemove={removePhoto}
                    onSetCover={setCover}
                    onCaption={setCaption}
                    showCaptions
                  />
                  <p className="mt-2 text-[11.5px] text-muted-foreground">
                    {mode === 'story'
                      ? 'The cover becomes the story image. Captions ride along with the photos.'
                      : 'The cover heads the post; the rest are placed through the body.'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? 'Saving…' : mode === 'blog' ? 'Save & open in composer' : 'Confirm & save draft'}
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-sm border border-border bg-background px-4 py-2.5 text-[13.5px] font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <RotateCcw size={14} /> Regenerate
            </button>
            <button
              type="button"
              onClick={backToCapture}
              disabled={saving}
              className="flex w-full items-center justify-center gap-1.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft size={13} /> Back to capture
            </button>
            <p className="text-center text-[11.5px] text-muted-foreground">
              {mode === 'story'
                ? 'Saves as a draft — it still goes through review before publishing.'
                : 'Saves as a draft and opens the composer. Publishing is a separate step there.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
