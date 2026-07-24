// Magazine Builder v2 — library + the Create popup (the AI entry point).
// Two AI-first paths: "Build with AI" (describe → LLM generates the issue) and
// "Upload PDF" (extract → coming in the import phase). Plus a plain Blank start.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, FileUp, FilePlus, X, Loader2, FileText, FileScan, Globe, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import * as api from './api';
import type { IssueSummary } from './api';
import { ingestFile, attachmentSourceText, ATTACH_ACCEPT } from '@/editor/agent/documentUpload';

type Mode = 'menu' | 'ai' | 'generating';

// Reassuring, on-theme status lines cycled while the AI plans the issue (the
// long, silent phase before per-page progress starts). They describe what's
// actually happening so an empty progress bar never reads as "stuck".
const PLAN_HINTS = [
  'Choosing a cohesive colour palette and fonts…',
  'Planning the page flow — cover, features, photo essay…',
  'Writing the cover and section headlines…',
  'Sourcing photography for each page…',
  'Laying out and polishing every page…',
];

export default function MagazineV2Home() {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('menu');
  const [brief, setBrief] = useState('');
  const [pageCount, setPageCount] = useState(8);
  const [progress, setProgress] = useState<{ done: number; total: number; stage: string }>({ done: 0, total: 0, stage: '' });
  const [hintIdx, setHintIdx] = useState(0); // rotates PLAN_HINTS during the planning phase
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null); // optional source document to build from
  const [pubBusy, setPubBusy] = useState<string | null>(null); // issue id being (un)published
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null); // PDF import (pixel-faithful extraction)

  useEffect(() => {
    api.listIssues().then(setIssues).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Cycle the reassuring hints only while planning (no per-page progress yet).
  useEffect(() => {
    if (mode !== 'generating' || progress.done > 0) { setHintIdx(0); return; }
    const t = setInterval(() => setHintIdx((i) => (i + 1) % PLAN_HINTS.length), 2500);
    return () => clearInterval(t);
  }, [mode, progress.done]);

  const openEditor = (id: string) => navigate(`/newsroom/magazine-v2/${id}`);

  // Publishing is done from inside the editor now; the card only deletes
  // (and its published Bulletins edition, server-side).
  const removeIssue = async (it: IssueSummary) => {
    if (pubBusy) return;
    if (!window.confirm(`Delete “${it.title}”?${it.publishedIssueId ? ' Its published edition will also be removed from Bulletins.' : ''} This cannot be undone.`)) return;
    setPubBusy(it.id);
    try {
      await api.deleteIssue(it.id);
      setIssues((prev) => prev.filter((r) => r.id !== it.id));
      toast.success('Magazine deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setPubBusy(null);
    }
  };

  const startBlank = async () => {
    try {
      const { issue } = await api.createBlankIssue('Untitled Magazine');
      openEditor(issue.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    }
  };

  const startAI = async () => {
    if (!brief.trim() && !file) return;
    setError(null);
    setMode('generating');
    setProgress({ done: 0, total: pageCount, stage: file ? 'Reading your document…' : 'Designing the Magazine' });
    try {
      let sourceText: string | undefined;
      if (file) {
        try {
          // Use fullText for PDF/DOCX/text, or the flattened digest for images
          // (vision-only) — so an attached photo/scan actually feeds generation.
          sourceText = attachmentSourceText(await ingestFile(file));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not read that document.');
          setMode('ai');
          return;
        }
        setProgress({ done: 0, total: pageCount, stage: 'Designing the Magazine' });
      }
      const { issue } = await api.generateIssue(brief.trim(), pageCount, sourceText);
      const id = issue.id;
      pollRef.current = setInterval(async () => {
        try {
          const { issue: cur } = await api.getIssue(id);
          setProgress({ done: cur.pagesProcessed ?? 0, total: cur.pagesTotal ?? pageCount, stage: cur.stage ?? '' });
          if (cur.status === 'ready') {
            if (pollRef.current) clearInterval(pollRef.current);
            openEditor(id);
          } else if (cur.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(cur.processingError || 'Generation failed.');
            setMode('ai');
          }
        } catch {
          /* transient — keep polling */
        }
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start generation');
      setMode('ai');
    }
  };

  // PDF IMPORT — pixel-faithful extraction (NOT AI generation): upload → S3 →
  // confirm → the worker digitizes the PDF into editable pages. Reuses the same
  // 'processing' poll + overlay as generation.
  const startImport = async (f: File) => {
    setError(null);
    setOpen(true);
    setMode('generating');
    const isImg = /^image\//.test(f.type) || /\.(jpe?g|png)$/i.test(f.name);
    const label = isImg ? 'image' : f.type.includes('word') || /\.docx$/i.test(f.name) ? 'document' : 'PDF';
    setProgress({ done: 0, total: 0, stage: `Uploading your ${label}…` });
    try {
      const { issue, uploadUrl } = await api.uploadIssue(f.name, f.type || 'application/pdf', f.size);
      await api.putToS3(uploadUrl, f);
      setProgress({ done: 0, total: 0, stage: isImg ? 'Building your page…' : 'Digitizing pages…' });
      await api.confirmUpload(issue.id, f.name);
      const id = issue.id;
      pollRef.current = setInterval(async () => {
        try {
          const { issue: cur } = await api.getIssue(id);
          setProgress({ done: cur.pagesProcessed ?? 0, total: cur.pagesTotal ?? 0, stage: cur.stage ?? '' });
          if (cur.status === 'ready') {
            if (pollRef.current) clearInterval(pollRef.current);
            openEditor(id);
          } else if (cur.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(cur.processingError || 'Import failed.');
            setOpen(false);
            setMode('menu');
          }
        } catch {
          /* transient — keep polling */
        }
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setOpen(false);
      setMode('menu');
    }
  };

  const close = () => {
    if (mode === 'generating') return; // don't abandon an in-flight generation
    setOpen(false);
    setMode('menu');
    setBrief('');
    setFile(null);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Magazine Builder v2</h1>
        <button className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => { setOpen(true); setMode('menu'); }}>
          <Plus size={16} /> Create
        </button>
      </div>

      {error && !open && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : issues.length === 0 ? (
        <p className="text-sm text-muted-foreground">No magazines yet. Click <b>Create</b> to build one with AI.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {issues.map((it) => {
            const published = !!it.publishedIssueId;
            const busy = pubBusy === it.id;
            return (
              <div key={it.id} className="flex flex-col rounded border border-border p-4 hover:border-[#7c3aed]">
                <button className="min-w-0 flex-1 text-left" onClick={() => openEditor(it.id)}>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{it.title}</span>
                    {published && (
                      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <Globe size={9} /> Live
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {it.status} · {it.pageCount} page{it.pageCount === 1 ? '' : 's'}{it.ownerName ? ` · ${it.ownerName}` : ''}
                  </div>
                  {!it.myRole && (
                    <span className="mt-1.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">View only</span>
                  )}
                </button>
                {(it.myRole === 'owner' || (published && it.publishedIssueId)) && (
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
                    {it.myRole === 'owner' && (
                      <button
                        onClick={() => void removeIssue(it)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded border border-red-300/40 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300/90 dark:hover:bg-red-500/10"
                        title="Delete this magazine"
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Delete
                      </button>
                    )}
                    {published && it.publishedIssueId && (
                      <a href={`/bulletins/${it.publishedIssueId}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-[#7c3aed] hover:underline">
                        View on Bulletins
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create popup */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="w-full max-w-lg rounded-lg bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create a magazine</h2>
              {mode !== 'generating' && <button className="rounded p-1 hover:bg-muted" onClick={close}><X size={18} /></button>}
            </div>

            {mode === 'menu' && (
              <div className="grid gap-3">
                <button className="flex items-start gap-3 rounded border border-border p-4 text-left hover:border-[#7c3aed] hover:bg-muted" onClick={() => setMode('ai')}>
                  <Sparkles size={22} className="mt-0.5 text-[#7c3aed]" />
                  <span><span className="block font-medium">Build with AI</span><span className="text-xs text-muted-foreground">Describe the magazine you want — the AI designs and writes the whole Magazine.</span></span>
                </button>
                {/* <button className="flex items-start gap-3 rounded border border-border p-4 text-left hover:border-[#7c3aed] hover:bg-muted" onClick={() => setMode('ai')}>
                  <FileUp size={22} className="mt-0.5 text-[#7c3aed]" />
                  <span><span className="block font-medium">From a document</span><span className="text-xs text-muted-foreground">Upload a PDF or doc — the AI reads it and builds the whole issue from its content.</span></span>
                </button> */}
                <button className="flex items-start gap-3 rounded border border-border p-4 text-left hover:border-[#7c3aed] hover:bg-muted" onClick={() => importRef.current?.click()}>
                  <FileScan size={22} className="mt-0.5 text-[#7c3aed]" />
                  <span><span className="block font-medium">Import a PDF, Word doc or image <span className="ml-1 rounded bg-[#7c3aed]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#7c3aed]">keeps layout</span></span><span className="text-xs text-muted-foreground">Digitize an existing PDF, .docx or JPEG/PNG into editable pages — layout, text & images, pixel-faithful.</span></span>
                </button>
                <button className="flex items-start gap-3 rounded border border-border p-4 text-left hover:border-[#7c3aed] hover:bg-muted" onClick={() => void startBlank()}>
                  <FilePlus size={22} className="mt-0.5" />
                  <span><span className="block font-medium">Blank</span><span className="text-xs text-muted-foreground">Start from an empty page and build it yourself.</span></span>
                </button>
                <input ref={importRef} type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/jpeg,image/png,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void startImport(f); if (importRef.current) importRef.current.value = ''; }} />
              </div>
            )}

            {mode === 'ai' && (
              <div className="grid gap-3">
                <label className="text-sm font-medium">Describe your magazine {file && <span className="text-xs font-normal text-muted-foreground">— optional, building from your document</span>}</label>
                <textarea
                  className="w-full rounded border border-border bg-background p-2.5 text-sm"
                  rows={4}
                  autoFocus
                  placeholder="e.g. A spring issue for New Zealand racehorse owners… — or attach a document below and the AI builds the issue from it."
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                />
                <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file ? (
                  <div className="flex items-center gap-2 rounded border border-border bg-muted/40 px-2.5 py-2 text-sm">
                    <FileText size={16} className="shrink-0 text-[#7c3aed]" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <button className="rounded p-1 hover:bg-muted" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Remove document"><X size={14} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground hover:border-[#7c3aed] hover:text-foreground">
                    <FileUp size={16} /> Attach a document (PDF, text) — build the issue from its content
                  </button>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Pages:</span>
                  <select className="rounded border border-border bg-background px-2 py-1" value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))}>
                    {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button className="rounded px-3 py-2 text-sm hover:bg-muted" onClick={() => setMode('menu')}>Back</button>
                  <button className="inline-flex items-center gap-2 rounded bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!brief.trim() && !file} onClick={() => void startAI()}>
                    <Sparkles size={16} /> Generate
                  </button>
                </div>
              </div>
            )}

            {mode === 'generating' && (() => {
              const composing = progress.done > 0; // per-page progress has started
              const pct = composing && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
              return (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Loader2 size={28} className="animate-spin text-[#7c3aed]" />
                  <div className="font-medium">{composing ? 'Composing your pages' : 'Designing your Magazine'}</div>
                  <div className="text-sm text-muted-foreground">
                    {composing ? `Composed ${progress.done} of ${progress.total} pages` : PLAN_HINTS[hintIdx]}
                  </div>
                  <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                    {composing ? (
                      // Real progress once pages start landing.
                      <div className="h-full bg-[#7c3aed] transition-all" style={{ width: `${pct}%` }} />
                    ) : (
                      // Planning phase: a pulsing partial bar reads as "working", not stuck.
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-[#7c3aed]" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">This usually takes 20–60 seconds — you can leave this open.</div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
