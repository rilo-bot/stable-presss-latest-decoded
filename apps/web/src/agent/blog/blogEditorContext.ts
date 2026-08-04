/**
 * The editor blob sent with every studio turn, so the assistant knows what is on
 * the author's screen: which post is open, what every input currently holds,
 * WHAT THE AUTHOR HAS POINTED AT, the parts outline, and the photo pool.
 *
 * Mirrors `agent/article/articleContext.ts`. Read at SEND time, never cached —
 * the author can select a different paragraph between two messages, and a stale
 * selection is worse than none because "this" would resolve to the wrong thing.
 *
 * ── Previews, not the whole post ──
 *
 * Every field travels as a short preview; only the SELECTED one travels in full.
 * Shipping the entire body each turn would make a long post cost more with every
 * message, for content the assistant usually doesn't need — `openBlogPost` is
 * still there for when it does.
 */
import { useComposerStore } from '@/pages/blog-composer/composerStore';
import { blockLabel } from '@/blog/factories';
import { blogFieldPreview, blogFields, blogFieldFilled, readBlogField } from './blogFields';
import { partHasContent, type Blog } from '@/types/blog';

export interface BlogEditorFieldCtx {
  field: string;
  name: string;
  kind: string;
  filled: boolean;
  preview: string;
}

export interface BlogEditorSelection {
  /** 'field' for an input, 'block' for a paragraph or picture in the body. */
  kind: 'field' | 'block';
  id: string;
  name: string;
  /** The selected thing's current content, in full — this is what "this" means. */
  value: string;
}

export interface BlogEditorContext {
  /** False when the composer is closed (the drawer opened from the list). */
  open: boolean;
  postId?: string;
  title?: string;
  status?: string;
  /** True when there are edits the server has not seen yet. */
  unsaved?: boolean;
  fields?: BlogEditorFieldCtx[];
  selection?: BlogEditorSelection | null;
  parts?: { index: number; id: string; title: string; words: number; empty: boolean }[];
  media?: { id: string; filename: string; hasAlt: boolean }[];
  bodyBlocks?: number;
}

const MEDIA_CAP = 24;

function wordsIn(blog: Blog, field: string): number {
  const text = readBlogField(blog, field);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function buildBlogEditorContext(): BlogEditorContext {
  const { blog, selectedId, selectedFieldId, saveState } = useComposerStore.getState();
  if (!blog) return { open: false };

  const fields = blogFields(blog).map<BlogEditorFieldCtx>((f) => ({
    field: f.field,
    name: f.name,
    kind: f.kind,
    filled: blogFieldFilled(blog, f.field),
    preview: blogFieldPreview(blog, f.field),
  }));

  let selection: BlogEditorSelection | null = null;
  if (selectedId) {
    const block =
      blog.blocks.find((b) => b.id === selectedId) ??
      (blog.parts ?? []).flatMap((p) => p.blocks).find((b) => b.id === selectedId);
    if (block) {
      selection = {
        kind: 'block',
        id: block.id,
        name: blockLabel(block),
        value: readBlogField(blog, `block:${block.id}`) || blogFieldPreview(blog, `block:${block.id}`),
      };
    }
  } else if (selectedFieldId) {
    const def = blogFields(blog).find((f) => f.field === selectedFieldId);
    if (def) {
      selection = {
        kind: 'field',
        id: def.field,
        name: def.name,
        value: readBlogField(blog, def.field),
      };
    }
  }

  return {
    open: true,
    postId: blog.id,
    title: blog.title,
    status: blog.status,
    unsaved: saveState === 'dirty' || saveState === 'saving',
    fields,
    selection,
    parts: (blog.parts ?? []).map((part, index) => ({
      index: index + 1,
      id: part.id,
      title: part.title,
      words: wordsIn(blog, `part:${part.id}.body`),
      empty: !partHasContent(part),
    })),
    media: blog.media.slice(0, MEDIA_CAP).map((m) => ({
      id: m.id,
      filename: m.filename,
      hasAlt: m.alt.trim().length > 0,
    })),
    bodyBlocks: blog.blocks.length,
  };
}
