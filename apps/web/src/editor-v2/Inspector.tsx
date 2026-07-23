// Magazine Builder v2 — the inspector for the selected element. Every change is
// an undoable commit (before = the element as it was when editing started). No
// direct API calls here — all edits route through the store's commit().

import type { ReactNode } from 'react';
import { useEditorStore } from './store';
import type { MagazineElement } from './model';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">{children}</span>
    </label>
  );
}

const inputCls = 'w-20 rounded border border-border bg-background px-1.5 py-1 text-xs';

export function Inspector() {
  const page = useEditorStore((s) => s.page);
  const selectedId = useEditorStore((s) => s.selectedId);
  const commit = useEditorStore((s) => s.commit);
  const deleteElement = useEditorStore((s) => s.deleteElement);

  const el = page?.elements.find((e) => e.id === selectedId) ?? null;
  if (!el) {
    return <div className="p-4 text-xs text-muted-foreground">Select an element to edit it.</div>;
  }

  // before = current element snapshot, so each inspector change is one undo step.
  const set = (patch: Partial<MagazineElement>) => void commit(el.id, patch, { ...el });
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium uppercase tracking-wide text-muted-foreground">{el.type}</span>
        <button className="rounded bg-red-50 px-2 py-1 text-red-600 hover:bg-red-100" onClick={() => void deleteElement(el.id)}>
          Delete
        </button>
      </div>

      <fieldset className="rounded border border-border p-2">
        <legend className="px-1 text-[10px] uppercase text-muted-foreground">Position &amp; size</legend>
        <Row label="X"><input type="number" className={inputCls} defaultValue={Math.round(el.x)} key={`x${el.id}${el.x}`} onBlur={(e) => set({ x: num(e.target.value) })} /></Row>
        <Row label="Y"><input type="number" className={inputCls} defaultValue={Math.round(el.y)} key={`y${el.id}${el.y}`} onBlur={(e) => set({ y: num(e.target.value) })} /></Row>
        <Row label="W"><input type="number" className={inputCls} defaultValue={Math.round(el.w)} key={`w${el.id}${el.w}`} onBlur={(e) => set({ w: num(e.target.value) })} /></Row>
        <Row label="H"><input type="number" className={inputCls} defaultValue={Math.round(el.h)} key={`h${el.id}${el.h}`} onBlur={(e) => set({ h: num(e.target.value) })} /></Row>
      </fieldset>

      {el.type === 'text' && el.text && (
        <fieldset className="rounded border border-border p-2">
          <legend className="px-1 text-[10px] uppercase text-muted-foreground">Text</legend>
          <textarea
            className="mb-2 w-full rounded border border-border bg-background p-1.5 text-xs"
            rows={3}
            defaultValue={el.text.content}
            key={`c${el.id}`}
            onBlur={(e) => set({ text: { ...el.text!, content: e.target.value } })}
          />
          <Row label="Size"><input type="number" className={inputCls} defaultValue={Math.round(el.text.fontSize)} key={`fs${el.id}${el.text.fontSize}`} onBlur={(e) => set({ text: { ...el.text!, fontSize: num(e.target.value), maxFontSize: num(e.target.value) } })} /></Row>
          <Row label="Weight">
            <select className={inputCls} value={el.text.fontWeight} onChange={(e) => set({ text: { ...el.text!, fontWeight: Number(e.target.value) as any } })}>
              {[400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </Row>
          <Row label="Align">
            <select className={inputCls} value={el.text.align} onChange={(e) => set({ text: { ...el.text!, align: e.target.value as any } })}>
              {['left', 'center', 'right'].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Row>
          <Row label="Colour"><input type="color" value={el.text.color} onChange={(e) => set({ text: { ...el.text!, color: e.target.value } })} /></Row>
        </fieldset>
      )}

      {el.type === 'shape' && el.shape && (
        <fieldset className="rounded border border-border p-2">
          <legend className="px-1 text-[10px] uppercase text-muted-foreground">Shape</legend>
          <Row label="Fill"><input type="color" value={el.shape.fill} onChange={(e) => set({ shape: { fill: e.target.value } })} /></Row>
        </fieldset>
      )}

      {el.type === 'image' && el.image && (
        <fieldset className="rounded border border-border p-2">
          <legend className="px-1 text-[10px] uppercase text-muted-foreground">Image</legend>
          <input className="mb-2 w-full rounded border border-border bg-background p-1.5 text-xs" placeholder="Image URL" defaultValue={el.image.url} key={`iu${el.id}`} onBlur={(e) => set({ image: { ...el.image!, url: e.target.value } })} />
          <Row label="Fit">
            <select className={inputCls} value={el.image.fit} onChange={(e) => set({ image: { ...el.image!, fit: e.target.value as any } })}>
              {['cover', 'contain'].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Row>
        </fieldset>
      )}

      {el.type === 'qr' && el.qr && (
        <fieldset className="rounded border border-border p-2">
          <legend className="px-1 text-[10px] uppercase text-muted-foreground">QR code</legend>
          <input className="mb-2 w-full rounded border border-border bg-background p-1.5 text-xs" placeholder="https://…" defaultValue={el.qr.url} key={`qu${el.id}`} onBlur={(e) => set({ qr: { ...el.qr!, url: e.target.value } })} />
          <Row label="Dark"><input type="color" value={el.qr.fg} onChange={(e) => set({ qr: { ...el.qr!, fg: e.target.value } })} /></Row>
          <Row label="Light"><input type="color" value={el.qr.bg} onChange={(e) => set({ qr: { ...el.qr!, bg: e.target.value } })} /></Row>
        </fieldset>
      )}
    </div>
  );
}
