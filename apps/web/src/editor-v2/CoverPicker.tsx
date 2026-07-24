// Magazine Builder v2 — cover-image picker (owner only).
//
// The cover is what shows on the public Bulletins newsstand card. Three sources:
//   • Pages   — use one of the issue's pages (its background/hero image)
//   • Library — pick any image already in the issue's media library
//   • Upload  — upload from the device, or paste an image URL
// Empty cover ⇒ the publish step auto-derives it from page 1. All writes go
// through the store's rev-less issue PATCH (owner-gated + URL-validated server-side).

import { useEffect, useRef, useState } from 'react';
import { X, Upload, Link2, Loader2, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { useEditorStore } from './store';
import * as api from './api';
import type { MediaAsset } from './api';

type Tab = 'pages' | 'library' | 'upload';

export function CoverPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useEditorStore();
  const [tab, setTab] = useState<Tab>('pages');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [busy, setBusy] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const cover = s.issue?.coverImage ?? '';

  // Load the media library when the Library tab is first opened.
  useEffect(() => {
    if (!open || tab !== 'library' || !s.issueId) return;
    let active = true;
    setLoadingMedia(true);
    api.listMedia(s.issueId)
      .then((a) => { if (active) setAssets(a); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingMedia(false); });
    return () => { active = false; };
  }, [open, tab, s.issueId]);

  if (!open) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const onUploadFile = (file: File) => run(async () => {
    if (!s.issueId) return;
    try {
      const asset = await api.uploadMediaImage(s.issueId, file);
      if (await s.setCover({ coverImage: asset.url })) onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    }
  });

  const onUseUrl = () => run(async () => {
    const v = urlValue.trim();
    if (!v) return;
    if (await s.setCover({ coverImage: v })) onClose();
  });

  const tabBtn = (t: Tab, label: string) =>
    <button
      key={t}
      onClick={() => setTab(t)}
      className={'px-3 py-1.5 text-[12px] rounded-sm ' + (tab === t ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5')}
    >{label}</button>;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[560px] max-w-full flex-col overflow-hidden rounded-lg border border-white/15 bg-[#0d1626] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="h-14 w-11 flex-shrink-0 overflow-hidden rounded-sm border border-white/15 bg-white/5">
            {cover
              ? <img src={cover} alt="" className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center text-white/25"><ImageOff size={16} /></div>}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Cover image</p>
            <p className="truncate text-[11px] text-white/40">{cover ? 'Custom cover set' : 'Automatic (page 1)'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {cover && (
              <button
                disabled={busy}
                onClick={() => run(async () => { await s.setCover({ coverImage: '' }); })}
                className="rounded-sm border border-white/15 px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 disabled:opacity-40"
              >Reset to automatic</button>
            )}
            <button onClick={onClose} className="rounded-sm p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-white/10 px-3 py-2">
          {tabBtn('pages', 'Pages')}
          {tabBtn('library', 'Library')}
          {tabBtn('upload', 'Upload / URL')}
          {busy && <Loader2 size={14} className="ml-auto animate-spin text-white/40" />}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'pages' && (
            <div>
              <p className="mb-2 text-[11px] text-white/45">Use a page's image as the cover. Pages with no image can't be used.</p>
              <div className="grid grid-cols-6 gap-2">
                {s.pages.map((p, i) => (
                  <button
                    key={p.id}
                    disabled={busy}
                    onClick={() => run(async () => { if (await s.setCover({ coverPageId: p.id })) onClose(); })}
                    className={'flex aspect-[3/4] flex-col items-center justify-center rounded-sm border text-[12px] disabled:opacity-40 ' +
                      (p.id === s.currentPageId ? 'border-[var(--gold-bright)]/70 bg-white/10 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:bg-white/10')}
                    title={`Use page ${i + 1}`}
                  >{i + 1}</button>
                ))}
              </div>
            </div>
          )}

          {tab === 'library' && (
            loadingMedia
              ? <div className="flex h-32 items-center justify-center text-white/40"><Loader2 size={16} className="mr-2 animate-spin" /> Loading media…</div>
              : assets.length === 0
                ? <p className="py-10 text-center text-[12px] text-white/40">No media yet. Upload an image or generate/import content first.</p>
                : (
                  <div className="grid grid-cols-3 gap-2">
                    {assets.map((a) => (
                      <button
                        key={a.id}
                        disabled={busy}
                        onClick={() => run(async () => { if (await s.setCover({ coverImage: a.url })) onClose(); })}
                        className="relative aspect-[4/3] overflow-hidden rounded border border-white/10 hover:border-[var(--gold-bright)] disabled:opacity-40"
                        title={a.alt || a.kind}
                      >
                        <img src={a.url} alt={a.alt} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )
          )}

          {tab === 'upload' && (
            <div className="space-y-4">
              <div>
                <button
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/20 py-6 text-[12px] text-white/60 hover:bg-white/5 disabled:opacity-40"
                >
                  <Upload size={15} /> Upload an image from your device
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadFile(f); e.target.value = ''; }}
                />
                <p className="mt-1 text-[10px] text-white/35">PNG, JPEG, WebP, or GIF · up to 15 MB</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Link2 size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/35" />
                  <input
                    value={urlValue}
                    onChange={(e) => setUrlValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void onUseUrl(); }}
                    placeholder="Paste an image URL"
                    className="w-full rounded border border-white/20 bg-[#0b1220] py-1.5 pl-7 pr-2 text-[12px] text-white placeholder:text-white/30"
                  />
                </div>
                <button
                  disabled={busy || !urlValue.trim()}
                  onClick={() => void onUseUrl()}
                  className="rounded-sm bg-[var(--gold-bright)] px-3 py-1.5 text-[12px] font-semibold text-[#0b1220] disabled:opacity-40"
                >Set</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
