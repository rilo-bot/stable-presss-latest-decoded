// Magazine Builder v2 — the right-hand inspector for the selected element.
//
// Matches the v1 magazine studio's inspector 1:1 by reusing its own control
// primitives (Section / Stepper / Segmented / ColorControl) and layout, adapted
// to v2's free-form elements. Every change is an undoable commit (before = the
// element as it was when editing started); no direct API calls here.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useEditorStore } from './store';
import { ShimmerText } from './BuildProgress';
import { LayoutReference } from './LayoutReference';
import { CopyDocumentPage } from './CopyDocumentPage';
import { columnOf, COLUMN_LABEL, COLUMN_TONE } from './review';
import type { MagazineElement, ElementType, ElementTextAlign, ElementTextWeight } from './model';
import * as api from './api';
import type { MediaAsset } from './api';
import { Section, Stepper, Segmented, ColorControl, FontFamilyMenu } from '@/editor-v2/controls';
import { ICON_NAMES, resolveIcon } from '@/lib/iconRegistry';
import {
  Type, Image as ImageIcon, QrCode, Square, Shapes,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, ArrowUpToLine, FoldVertical, ArrowDownToLine, Trash2,
  Sliders, Images, Upload, Copy, BringToFront, SendToBack, FileText,
} from 'lucide-react';

const KIND_META = {
  text: { label: 'Text', icon: Type },
  image: { label: 'Image', icon: ImageIcon },
  shape: { label: 'Shape', icon: Square },
  qr: { label: 'QR Code', icon: QrCode },
  icon: { label: 'Icon', icon: Shapes },
} as const;

/** Hover names for the numeric weight buttons — the numbers are what the pipeline
 *  speaks, but not everyone reads 600 as "Semibold" at a glance. */
const WEIGHT_TITLE: Record<ElementTextWeight, string> = {
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extrabold',
  900: 'Black',
};

/**
 * ADD TO PAGE — the five insert tools, moved here from the top toolbar.
 *
 * They were in the header, competing with Publish and Delete-magazine for the same
 * glance, which was wrong twice over: they act on the CURRENT PAGE rather than the
 * magazine, and they are only usable when there is a page open. Here they sit
 * directly above the panel that edits whatever they just created.
 */
function AddRow({ onAdd, disabled }: { onAdd: (kind: ElementType) => void; disabled: boolean }) {
  const tools: { kind: ElementType; label: string; icon: ReactNode }[] = [
    { kind: 'text', label: 'Text', icon: <Type size={17} /> },
    { kind: 'image', label: 'Photo', icon: <ImageIcon size={17} /> },
    { kind: 'shape', label: 'Shape', icon: <Square size={17} /> },
    { kind: 'qr', label: 'QR code', icon: <QrCode size={17} /> },
    { kind: 'icon', label: 'Icon', icon: <Shapes size={17} /> },
  ];
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-studio-hair px-2 py-2">
      <span className="w-full pb-0.5 text-ui-sm uppercase tracking-wide text-studio-ink-4">Add to this page</span>
      {tools.map((t) => (
        <button
          key={t.kind}
          onClick={() => onAdd(t.kind)}
          disabled={disabled}
          title={`Add ${t.label.toLowerCase()} to this page`}
          aria-label={`Add ${t.label.toLowerCase()}`}
          className="flex min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-sm border border-studio-edge px-1.5 py-1.5 text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink disabled:opacity-30 disabled:hover:bg-transparent"
        >
          {t.icon}
          <span className="text-ui-sm leading-none">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * What the panel shows when nothing is selected: THE PAGE.
 *
 * It used to say "Nothing selected" over an illustration — 300px of screen
 * apologising for itself. A panel that always has something true to show never
 * needs an empty state, and "which page am I on, is it going in the edition, what
 * did the owner say about it" are exactly the questions you have at that moment.
 */
function PagePanel() {
  const pages = useEditorStore((s) => s.pages);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const page = useEditorStore((s) => s.page);
  const setPageSelected = useEditorStore((s) => s.setPageSelected);
  const canManage = useEditorStore((s) => s.canManage());
  const sum = pages.find((p) => p.id === currentPageId);
  if (!sum) return <div className="p-3 text-ui-sm text-studio-ink-3">No page open.</div>;

  const col = columnOf(sum);
  const tone = COLUMN_TONE[col];
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-studio-hair px-3.5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-studio-raise-2 text-studio-ink-2 tabular-nums">
          {sum.index + 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-ui font-bold text-studio-ink">Page {sum.index + 1} of {pages.length}</p>
          <p className="truncate text-ui-sm text-studio-ink-3">
            {sum.elementCount} item{sum.elementCount === 1 ? '' : 's'}
            {page ? ` · ${Math.round(page.width)}×${Math.round(page.height)}` : ''}
          </p>
        </div>
      </div>

      <Section title="In this edition">
        <label className="flex cursor-pointer items-start gap-2 text-ui-sm text-studio-ink-2">
          <input
            type="checkbox"
            checked={sum.selectedForPublish}
            disabled={!canManage}
            onChange={(e) => void setPageSelected(sum.id, e.target.checked)}
            className="mt-0.5 accent-studio-gold"
          />
          <span>
            Include when publishing selected pages
            <span className="block text-studio-ink-4">A full-edition publish always includes every page.</span>
          </span>
        </label>
      </Section>

      <Section title="Review">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-ui-sm ${tone.chip} ${tone.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {COLUMN_LABEL[col]}
          {(sum.reviewRound ?? 0) > 0 && col === 'needs_changes' ? ` · round ${sum.reviewRound}` : ''}
        </span>
        {sum.approvalStale && (
          <p className="mt-1.5 text-ui-sm text-amber-200/90">Edited after approval — it needs approving again.</p>
        )}
        {sum.reviewNote && (
          <p className="mt-1.5 border-l-2 border-studio-edge pl-2 text-ui-sm italic text-studio-ink-2">“{sum.reviewNote}”</p>
        )}
        {!sum.reviewNote && !sum.approvalStale && (
          <p className="mt-1.5 text-ui-sm text-studio-ink-4">
            {col === 'in_progress' ? 'Not submitted for review.' : 'No notes on this page.'}
          </p>
        )}
      </Section>

      {/* TWO DOORS, NAMED FOR WHAT THEY DO TO THE WORDS — the one question that
          separates them. "Match a layout" borrows an arrangement and writes fresh
          copy; "Copy a page exactly" reproduces a PDF page verbatim. They were one
          feature for a while, and "make this page like that one" is ambiguous enough
          that people reached for the wrong half and got a 29% match they could not
          explain. */}
      {canManage && (
        <Section title="Match a layout">
          <LayoutReference />
        </Section>
      )}
      {canManage && (
        <Section title="Copy a page exactly">
          <CopyDocumentPage />
        </Section>
      )}

      <Section title="Editing">
        <p className="text-ui-sm leading-relaxed text-studio-ink-3">
          Click any headline, paragraph, photo or shape on the page to edit it here. Use <b className="text-studio-ink-2">Add</b> above
          to put something new on it, or <b className="text-studio-ink-2">Assets</b> to place a photo you have already uploaded.
        </p>
      </Section>
    </div>
  );
}

export function Inspector({ onAdd }: { onAdd?: (kind: ElementType) => void }) {
  const page = useEditorStore((s) => s.page);
  const selectedId = useEditorStore((s) => s.selectedId);
  const canEdit = useEditorStore((s) => s.canEdit());
  const [tab, setTab] = useState<'element' | 'assets'>('element');

  const el = page?.elements.find((e) => e.id === selectedId) ?? null;

  const tabBtn = (id: 'element' | 'assets', label: string, icon: ReactNode) => (
    <button
      onClick={() => setTab(id)}
      className={
        'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-ui-sm font-semibold transition-colors ' +
        (tab === id ? 'border-studio-gold text-studio-ink' : 'border-transparent text-studio-ink-3 hover:text-studio-ink-2')
      }
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {onAdd && canEdit && <AddRow onAdd={onAdd} disabled={!page} />}
      <div className="flex flex-shrink-0 border-b border-studio-hair">
        {tabBtn('element', el ? 'Element' : 'Page', el ? <Sliders size={13} /> : <FileText size={13} />)}
        {tabBtn('assets', 'Assets', <Images size={13} />)}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* No empty state: with nothing selected the tab shows the PAGE, which is
            always a real thing with real properties. */}
        {tab === 'assets' ? <AssetsTab /> : el ? <ElementPanel el={el} /> : <PagePanel />}
      </div>
    </div>
  );
}

// ── The per-element editing panel (unchanged controls, now tabbed) ────────────
function ElementPanel({ el }: { el: MagazineElement }) {
  const pages = useEditorStore((s) => s.pages);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const issueId = useEditorStore((s) => s.issueId);
  const page = useEditorStore((s) => s.page);
  const commit = useEditorStore((s) => s.commit);
  const deleteElement = useEditorStore((s) => s.deleteElement);
  const duplicateElement = useEditorStore((s) => s.duplicateElement);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // before = current element snapshot, so each inspector change is one undo step.
  const set = (patch: Partial<MagazineElement>) => void commit(el.id, patch, { ...el });

  // Layer order: raise above the current top / drop below the current bottom.
  // zIndex is clamped 0–9999 server-side, so cap the ends accordingly.
  const others = (page?.elements ?? []).filter((e) => e.id !== el.id);
  const bringToFront = () => set({ zIndex: Math.min(9999, others.reduce((m, e) => Math.max(m, e.zIndex), 0) + 1) });
  const sendToBack = () => set({ zIndex: Math.max(0, others.reduce((m, e) => Math.min(m, e.zIndex), el.zIndex) - 1) });

  // Upload a picture from the user's computer and point the selected image element
  // at it — the manual "replace this photo" path (the Assets tab handles picking an
  // existing library photo; a URL can still be pasted below). One commit → one undo.
  const replaceImageFromFile = async (file: File) => {
    if (!issueId || !el.image) return;
    setUploading(true);
    try {
      const asset = await api.uploadMediaImage(issueId, file, el.image.alt || file.name);
      set({ image: { ...el.image, url: asset.url, assetId: asset.id, alt: asset.alt } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };
  const meta = KIND_META[el.type];
  const Icon = meta.icon;
  const pageNo = pages.findIndex((p) => p.id === currentPageId) + 1;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-studio-hair px-3.5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-studio-gold/20 text-studio-gold">
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-ui-sm font-bold text-studio-ink">{meta.label}{el.type === 'text' && el.text ? ` · ${el.text.role}` : ''}</p>
          <p className="truncate text-ui-sm text-studio-ink-3">Page {pageNo || '—'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {el.type === 'text' && el.text && (
          <>
            <Section title="Content">
              <textarea
                key={`c${el.id}`}
                defaultValue={el.text.content}
                rows={3}
                onBlur={(e) => set({ text: { ...el.text!, content: e.target.value } })}
                className="w-full resize-none rounded-sm border border-studio-edge bg-studio-raise px-2 py-1.5 text-ui-sm text-studio-ink outline-none focus:border-studio-edge-strong"
              />
            </Section>

            <Section title="Font">
              {/* The curated registry (lib/fonts/registry.ts), grouped and previewed in
                  each face. It replaced a hand-kept list of seven stacks that had drifted
                  from both the registry AND the generator's own font lists. */}
              <FontFamilyMenu
                value={el.text.fontFamily}
                onChange={(stack) => set({ text: { ...el.text!, fontFamily: stack } })}
              />
            </Section>

            <Section title="Size & weight">
              <Stepper value={Math.round(el.text.fontSize)} min={6} max={400} suffix="px" onChange={(v) => set({ text: { ...el.text!, fontSize: v, maxFontSize: v } })} />
              {/* EVERY weight the model allows, on its own row.
                  Three buttons that collapsed anything ≥700 to "Bold" could not tell the
                  truth about the type on the page: templates and roleScale set headlines,
                  cover titles and stat figures at 800, and the layout DSL emits 900 — all
                  of which displayed as "Bold" and were silently demoted to 700 the moment
                  the control was touched. Numeric labels because that is how the weights
                  are named everywhere else in the pipeline. */}
              <div className="mt-2">
                <Segmented<ElementTextWeight>
                  value={el.text.fontWeight}
                  options={[400, 500, 600, 700, 800, 900].map((w) => ({
                    value: w as ElementTextWeight,
                    label: String(w),
                    title: WEIGHT_TITLE[w as ElementTextWeight],
                  }))}
                  onChange={(v) => set({ text: { ...el.text!, fontWeight: v } })}
                />
              </div>
            </Section>

            <Section title="Alignment">
              {/* Justify is offered because the server can already STORE it: the layout
                  spec lists it (lib/magazineV2/layoutSpec.ts) and generation emits it for
                  body copy. Without the fourth option a justified column showed no
                  selected alignment here and could never be set back to justify by hand. */}
              <Segmented<ElementTextAlign>
                value={el.text.align}
                options={[
                  { value: 'left', label: <AlignLeft size={13} /> },
                  { value: 'center', label: <AlignCenter size={13} /> },
                  { value: 'right', label: <AlignRight size={13} /> },
                  { value: 'justify', label: <AlignJustify size={13} /> },
                ]}
                onChange={(v) => set({ text: { ...el.text!, align: v } })}
              />
            </Section>

            <Section title="Vertical">
              <Segmented<'top' | 'center' | 'bottom'>
                value={el.text.vAlign ?? 'top'}
                options={[
                  { value: 'top', label: <ArrowUpToLine size={13} />, title: 'Top' },
                  { value: 'center', label: <FoldVertical size={13} />, title: 'Middle' },
                  { value: 'bottom', label: <ArrowDownToLine size={13} />, title: 'Bottom' },
                ]}
                onChange={(v) => set({ text: { ...el.text!, vAlign: v } })}
              />
            </Section>

            <Section title="Colour">
              <ColorControl value={el.text.color} onChange={(c) => set({ text: { ...el.text!, color: c } })} />
            </Section>

            <Section title="Spacing">
              <p className="mb-1 text-ui-sm text-studio-ink-3">Line height</p>
              <Stepper value={Math.round((el.text.lineHeight ?? 1.3) * 100)} min={80} max={250} step={5} suffix="%" onChange={(v) => set({ text: { ...el.text!, lineHeight: v / 100 } })} />
            </Section>
          </>
        )}

        {el.type === 'image' && el.image && (
          <>
            <Section title="Replace image">
              {el.image.url && (
                <div className="mb-2 overflow-hidden rounded-sm border border-studio-hair bg-black/20">
                  <img src={el.image.url} alt={el.image.alt} className="max-h-28 w-full object-contain" />
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceImageFromFile(f); e.target.value = ''; }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-2 rounded-sm border border-studio-edge bg-studio-raise px-3 py-2 text-ui-sm font-semibold text-studio-ink hover:bg-studio-raise-2 disabled:opacity-50"
              >
                <Upload size={13} />
                {uploading ? <ShimmerText>Uploading…</ShimmerText> : el.image.url ? 'Upload a replacement' : 'Upload from computer'}
              </button>
              <p className="mt-1.5 text-ui-sm leading-relaxed text-studio-ink-3">
                Or pick an existing photo in the <b>Assets</b> tab, or paste a URL below.
              </p>
            </Section>
            <Section title="Image URL">
              <input
                key={`iu${el.id}`}
                defaultValue={el.image.url}
                placeholder="https://…  (or use the Design Helper to add a photo)"
                onBlur={(e) => set({ image: { ...el.image!, url: e.target.value } })}
                className="w-full rounded-sm border border-studio-edge bg-studio-raise px-2 py-1.5 text-ui-sm text-studio-ink outline-none focus:border-studio-edge-strong"
              />
            </Section>
            <Section title="Fit">
              <Segmented<'cover' | 'contain'>
                value={el.image.fit}
                options={[
                  { value: 'cover', label: 'Cover' },
                  { value: 'contain', label: 'Contain' },
                ]}
                onChange={(v) => set({ image: { ...el.image!, fit: v } })}
              />
            </Section>
          </>
        )}

        {el.type === 'shape' && el.shape && (
          <Section title="Fill">
            <ColorControl value={el.shape.fill} onChange={(c) => set({ shape: { fill: c } })} />
          </Section>
        )}

        {el.type === 'qr' && el.qr && (
          <>
            <Section title="Link">
              <input
                key={`qu${el.id}`}
                defaultValue={el.qr.url}
                placeholder="https://…"
                onBlur={(e) => set({ qr: { ...el.qr!, url: e.target.value } })}
                className="w-full rounded-sm border border-studio-edge bg-studio-raise px-2 py-1.5 text-ui-sm text-studio-ink outline-none focus:border-studio-edge-strong"
              />
            </Section>
            <Section title="Dark"><ColorControl value={el.qr.fg} onChange={(c) => set({ qr: { ...el.qr!, fg: c } })} /></Section>
            <Section title="Light"><ColorControl value={el.qr.bg} onChange={(c) => set({ qr: { ...el.qr!, bg: c } })} /></Section>
          </>
        )}

        {el.type === 'icon' && el.icon && (
          <>
            <Section title="Icon">
              <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto rounded-sm border border-studio-hair bg-studio-raise p-1.5">
                {ICON_NAMES.map((name) => {
                  const Glyph = resolveIcon(name);
                  const active = el.icon!.name === name;
                  return (
                    <button
                      key={name}
                      title={name}
                      onClick={() => set({ icon: { ...el.icon!, name, src: undefined } })}
                      className={
                        'flex aspect-square items-center justify-center rounded-sm border p-1 ' +
                        (active ? 'border-studio-gold bg-studio-gold/20 text-studio-ink' : 'border-transparent text-studio-ink-2 hover:bg-studio-raise-2 hover:text-studio-ink')
                      }
                    >
                      <Glyph size={16} />
                    </button>
                  );
                })}
              </div>
              {el.icon.src && <p className="mt-1.5 text-ui-sm text-studio-ink-3">A custom uploaded icon is in use; pick a glyph above to replace it.</p>}
            </Section>
            <Section title="Colour">
              <ColorControl value={el.icon.color ?? '#111111'} onChange={(c) => set({ icon: { ...el.icon!, color: c } })} />
            </Section>
          </>
        )}

        {/* Position & size — shared across kinds */}
        <Section title="Position & size">
          <div className="grid grid-cols-2 gap-2">
            <div><p className="mb-1 text-ui-sm text-studio-ink-3">X</p><Stepper value={Math.round(el.x)} min={0} max={5000} suffix="px" onChange={(v) => set({ x: v })} /></div>
            <div><p className="mb-1 text-ui-sm text-studio-ink-3">Y</p><Stepper value={Math.round(el.y)} min={0} max={5000} suffix="px" onChange={(v) => set({ y: v })} /></div>
            <div><p className="mb-1 text-ui-sm text-studio-ink-3">W</p><Stepper value={Math.round(el.w)} min={2} max={5000} suffix="px" onChange={(v) => set({ w: v })} /></div>
            <div><p className="mb-1 text-ui-sm text-studio-ink-3">H</p><Stepper value={Math.round(el.h)} min={2} max={5000} suffix="px" onChange={(v) => set({ h: v })} /></div>
          </div>
        </Section>

        <Section title="Rotation">
          <Stepper value={Math.round(el.rotation)} min={-180} max={180} step={1} suffix="°" onChange={(v) => set({ rotation: v })} />
        </Section>

        <Section title="Arrange">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={bringToFront} className="flex items-center justify-center gap-1.5 rounded-sm border border-studio-edge bg-studio-raise px-2 py-1.5 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2">
              <BringToFront size={13} /> To front
            </button>
            <button onClick={sendToBack} className="flex items-center justify-center gap-1.5 rounded-sm border border-studio-edge bg-studio-raise px-2 py-1.5 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2">
              <SendToBack size={13} /> To back
            </button>
          </div>
        </Section>

        <div className="flex flex-col gap-2 px-3.5 py-3">
          <button
            onClick={() => void duplicateElement(el.id)}
            className="flex w-full items-center justify-center gap-2 rounded-sm border border-studio-edge bg-studio-raise px-3 py-2 text-ui-sm font-semibold text-studio-ink-2 hover:bg-studio-raise-2"
          >
            <Copy size={13} /> Duplicate element
          </button>
          <button
            onClick={() => void deleteElement(el.id)}
            className="flex w-full items-center justify-center gap-2 rounded-sm border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-ui-sm font-semibold text-rose-300 hover:bg-rose-500/20"
          >
            <Trash2 size={13} /> Delete element
          </button>
        </div>
      </div>
    </div>
  );
}

// ── The media library: browse the issue's photos and place them ───────────────
// Clicking a thumbnail sets the selected image element's source, or (if nothing
// image-shaped is selected) drops a new image element onto the current page.
function AssetsTab() {
  const issueId = useEditorStore((s) => s.issueId);
  const selectedId = useEditorStore((s) => s.selectedId);
  const page = useEditorStore((s) => s.page);
  const commit = useEditorStore((s) => s.commit);
  const addElement = useEditorStore((s) => s.addElement);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!issueId) return;
    let active = true;
    setLoading(true);
    api.listMedia(issueId)
      .then((a) => { if (active) setAssets(a); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Re-fetch when the page's rev changes (a stock/AI add creates new media).
  }, [issueId, page?.rev]);

  const selEl = page?.elements.find((e) => e.id === selectedId) ?? null;

  const place = (a: MediaAsset) => {
    if (selEl && selEl.type === 'image' && selEl.image) {
      void commit(selEl.id, { image: { ...selEl.image, url: a.url, assetId: a.id, alt: a.alt } }, { ...selEl });
    } else if (page) {
      const w = Math.round(page.width * 0.5);
      const h = Math.round(w * 0.66);
      const topZ = page.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
      void addElement({
        type: 'image',
        x: Math.round(page.width / 2 - w / 2),
        y: Math.round(page.height / 3),
        w, h,
        rotation: 0,
        zIndex: topZ + 1,
        locked: false,
        source: 'manual',
        image: { url: a.url, assetId: a.id, alt: a.alt, fit: 'cover' },
      });
    }
  };

  if (loading) {
    return (
      <div className="p-3">
        <p className="mb-2 text-ui text-studio-ink-3" role="status" aria-live="polite">
          <ShimmerText>Loading your media</ShimmerText>
        </p>
        {/* Thumb-shaped placeholders in the real grid, so the panel doesn't jump. */}
        <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="aspect-square rounded-sm border border-studio-hair bg-studio-raise" />
          ))}
        </div>
      </div>
    );
  }
  if (assets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <Images size={26} className="mb-3 text-studio-ink-4" />
        <p className="text-ui font-semibold text-studio-ink-2">No media yet</p>
        <p className="mt-1 text-ui-sm leading-relaxed text-studio-ink-3">
          Photos appear here when you generate a magazine, import a PDF, or ask the Design Helper to add a photo.
        </p>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto p-3">
      <p className="mb-2 text-ui-sm text-studio-ink-3">
        {selEl?.type === 'image' ? 'Click a photo to set the selected image.' : 'Click a photo to place it on the page.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {assets.map((a) => (
          <button
            key={a.id}
            onClick={() => place(a)}
            className="relative aspect-[4/3] overflow-hidden rounded border border-studio-hair hover:border-studio-gold"
            title={a.alt || a.kind}
          >
            <img src={a.url} alt={a.alt} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
