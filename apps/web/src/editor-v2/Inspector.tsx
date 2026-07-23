// Magazine Builder v2 — the right-hand inspector for the selected element.
//
// Matches the v1 magazine studio's inspector 1:1 by reusing its own control
// primitives (Section / Stepper / Segmented / ColorControl) and layout, adapted
// to v2's free-form elements. Every change is an undoable commit (before = the
// element as it was when editing started); no direct API calls here.

import { useEditorStore } from './store';
import type { MagazineElement } from './model';
import { Section, Stepper, Segmented, ColorControl } from '@/editor/inspector/controls';
import {
  MousePointerClick, Type, Image as ImageIcon, QrCode, Square,
  AlignLeft, AlignCenter, AlignRight, ArrowUpToLine, FoldVertical, ArrowDownToLine, Trash2,
} from 'lucide-react';

const KIND_META = {
  text: { label: 'Text', icon: Type },
  image: { label: 'Image', icon: ImageIcon },
  shape: { label: 'Shape', icon: Square },
  qr: { label: 'QR Code', icon: QrCode },
} as const;

// The curated font stacks the studio uses (mirrors the generator's font lists).
const FONT_OPTIONS: { label: string; stack: string }[] = [
  { label: 'Playfair Display', stack: 'Playfair Display, Georgia, serif' },
  { label: 'DM Serif Display', stack: 'DM Serif Display, Georgia, serif' },
  { label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { label: 'Montserrat', stack: 'Montserrat, Arial, sans-serif' },
  { label: 'Oswald', stack: 'Oswald, Arial, sans-serif' },
  { label: 'Inter', stack: 'Inter, Arial, sans-serif' },
  { label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
];

export function Inspector() {
  const page = useEditorStore((s) => s.page);
  const pages = useEditorStore((s) => s.pages);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const selectedId = useEditorStore((s) => s.selectedId);
  const commit = useEditorStore((s) => s.commit);
  const deleteElement = useEditorStore((s) => s.deleteElement);

  const el = page?.elements.find((e) => e.id === selectedId) ?? null;

  if (!el) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <MousePointerClick size={26} className="mb-3 text-white/25" />
        <p className="text-sm font-semibold text-white/70">Nothing selected</p>
        <p className="mt-1 text-xs leading-relaxed text-white/40">
          Click any headline, paragraph, photo, or shape on the page to edit it here — or ask the Studio Assistant.
        </p>
      </div>
    );
  }

  // before = current element snapshot, so each inspector change is one undo step.
  const set = (patch: Partial<MagazineElement>) => void commit(el.id, patch, { ...el });
  const meta = KIND_META[el.type];
  const Icon = meta.icon;
  const pageNo = pages.findIndex((p) => p.id === currentPageId) + 1;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-sky-500/20 text-sky-300">
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-white">{meta.label}{el.type === 'text' && el.text ? ` · ${el.text.role}` : ''}</p>
          <p className="truncate text-[10px] text-white/40">Page {pageNo || '—'}</p>
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
                className="w-full resize-none rounded-sm border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-white/30"
              />
            </Section>

            <Section title="Font">
              <select
                value={FONT_OPTIONS.find((f) => f.stack === el.text!.fontFamily)?.stack ?? ''}
                onChange={(e) => set({ text: { ...el.text!, fontFamily: e.target.value } })}
                className="w-full rounded-sm border border-white/15 bg-white/5 px-2.5 py-2 text-sm text-white outline-none hover:bg-white/10"
                style={{ fontFamily: el.text.fontFamily }}
              >
                {!FONT_OPTIONS.some((f) => f.stack === el.text!.fontFamily) && <option value="">{el.text.fontFamily}</option>}
                {FONT_OPTIONS.map((f) => (
                  <option key={f.stack} value={f.stack} style={{ fontFamily: f.stack }}>{f.label}</option>
                ))}
              </select>
            </Section>

            <Section title="Size & weight">
              <div className="grid grid-cols-2 gap-2">
                <Stepper value={Math.round(el.text.fontSize)} min={6} max={400} suffix="px" onChange={(v) => set({ text: { ...el.text!, fontSize: v, maxFontSize: v } })} />
                <Segmented<number>
                  value={el.text.fontWeight >= 700 ? 700 : el.text.fontWeight >= 600 ? 600 : 400}
                  options={[
                    { value: 400, label: 'Reg' },
                    { value: 600, label: 'Semi' },
                    { value: 700, label: 'Bold' },
                  ]}
                  onChange={(v) => set({ text: { ...el.text!, fontWeight: v as 400 | 500 | 600 | 700 | 800 } })}
                />
              </div>
            </Section>

            <Section title="Alignment">
              <Segmented<'left' | 'center' | 'right'>
                value={el.text.align}
                options={[
                  { value: 'left', label: <AlignLeft size={13} /> },
                  { value: 'center', label: <AlignCenter size={13} /> },
                  { value: 'right', label: <AlignRight size={13} /> },
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
              <p className="mb-1 text-[10px] text-white/40">Line height</p>
              <Stepper value={Math.round((el.text.lineHeight ?? 1.3) * 100)} min={80} max={250} step={5} suffix="%" onChange={(v) => set({ text: { ...el.text!, lineHeight: v / 100 } })} />
            </Section>
          </>
        )}

        {el.type === 'image' && el.image && (
          <>
            <Section title="Image URL">
              <input
                key={`iu${el.id}`}
                defaultValue={el.image.url}
                placeholder="https://…  (or use the Studio Assistant to add a photo)"
                onBlur={(e) => set({ image: { ...el.image!, url: e.target.value } })}
                className="w-full rounded-sm border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-white/30"
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
                className="w-full rounded-sm border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-white/30"
              />
            </Section>
            <Section title="Dark"><ColorControl value={el.qr.fg} onChange={(c) => set({ qr: { ...el.qr!, fg: c } })} /></Section>
            <Section title="Light"><ColorControl value={el.qr.bg} onChange={(c) => set({ qr: { ...el.qr!, bg: c } })} /></Section>
          </>
        )}

        {/* Position & size — shared across kinds */}
        <Section title="Position & size">
          <div className="grid grid-cols-2 gap-2">
            <div><p className="mb-1 text-[10px] text-white/40">X</p><Stepper value={Math.round(el.x)} min={0} max={5000} suffix="px" onChange={(v) => set({ x: v })} /></div>
            <div><p className="mb-1 text-[10px] text-white/40">Y</p><Stepper value={Math.round(el.y)} min={0} max={5000} suffix="px" onChange={(v) => set({ y: v })} /></div>
            <div><p className="mb-1 text-[10px] text-white/40">W</p><Stepper value={Math.round(el.w)} min={2} max={5000} suffix="px" onChange={(v) => set({ w: v })} /></div>
            <div><p className="mb-1 text-[10px] text-white/40">H</p><Stepper value={Math.round(el.h)} min={2} max={5000} suffix="px" onChange={(v) => set({ h: v })} /></div>
          </div>
        </Section>

        <div className="px-3.5 py-3">
          <button
            onClick={() => void deleteElement(el.id)}
            className="flex w-full items-center justify-center gap-2 rounded-sm border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
          >
            <Trash2 size={13} /> Delete element
          </button>
        </div>
      </div>
    </div>
  );
}
