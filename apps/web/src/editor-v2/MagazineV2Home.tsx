// Magazine Builder v2 — home. Leads with a single, centered AI composer: the
// user describes the magazine (and/or attaches a document/image) and the AI
// designs + writes + illustrates the whole issue. On generate we drop STRAIGHT
// into the studio — pages stream in live there — instead of a blocking loader.
// Import (pixel-faithful) and Blank are quiet secondary starts.

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Paperclip, X, Loader2, FileText, FileScan, FilePlus, Globe, Trash2, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import * as api from './api';
import type { IssueSummary } from './api';
import { ingestFile, attachmentSourceText, ATTACH_ACCEPT } from '@/editor/agent/documentUpload';

const ACCENT = '#7c3aed';

const IMPORT_ACCEPT =
  'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/jpeg,image/png,.jpg,.jpeg,.png';

export default function MagazineV2Home() {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false); // brief: reading doc / creating the issue before we navigate
  const [startMsg, setStartMsg] = useState('');
  const [brief, setBrief] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null); // optional source document/image to build from
  const [dragOver, setDragOver] = useState(false);
  const [pubBusy, setPubBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.listIssues().then(setIssues).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false));
  }, []);

  const openEditor = (id: string) => navigate(`/newsroom/magazine-v2/${id}`);

  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  };

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
    if (starting) return;
    try {
      const { issue } = await api.createBlankIssue('Untitled Magazine');
      openEditor(issue.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    }
  };

  // Build with AI → create the issue, then jump straight into the studio. The
  // editor polls and reveals each page as it's composed (no blocking loader).
  const startAI = async () => {
    if ((!brief.trim() && !file) || starting) return;
    setError(null);
    setStarting(true);
    try {
      let sourceText: string | undefined;
      if (file) {
        setStartMsg('Reading your document…');
        try {
          sourceText = attachmentSourceText(await ingestFile(file));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not read that document.');
          setStarting(false);
          setStartMsg('');
          return;
        }
      }
      setStartMsg('Opening the studio…');
      // No page count from the UI — the AI plans a short preview (or the number
      // the user named in their prompt); more pages can be added afterwards.
      const { issue } = await api.generateIssue(brief.trim(), undefined, sourceText);
      openEditor(issue.id); // studio takes over — pages appear as they build
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start generation');
      setStarting(false);
      setStartMsg('');
    }
  };

  // Import (pixel-faithful): upload → confirm → into the studio; the editor
  // shows digitized pages as the worker extracts them.
  const startImport = async (f: File) => {
    if (starting) return;
    setError(null);
    setStarting(true);
    const isImg = /^image\//.test(f.type) || /\.(jpe?g|png)$/i.test(f.name);
    const label = isImg ? 'image' : f.type.includes('word') || /\.docx$/i.test(f.name) ? 'document' : 'PDF';
    setStartMsg(`Uploading your ${label}…`);
    try {
      const { issue, uploadUrl } = await api.uploadIssue(f.name, f.type || 'application/pdf', f.size);
      await api.putToS3(uploadUrl, f);
      setStartMsg('Opening the studio…');
      await api.confirmUpload(issue.id, f.name);
      openEditor(issue.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setStarting(false);
      setStartMsg('');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); setError(null); }
  };

  const canGenerate = (!!brief.trim() || !!file) && !starting;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      {/* ── Hero composer ─────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pt-16 text-center sm:pt-24">
        <span
          className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: `${ACCENT}14`, color: ACCENT }}
        >
          <Sparkles size={13} /> AI Magazine Builder
        </span>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">What magazine shall we make?</h1>
        <p className="mt-3 max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
          Describe it in a sentence — the AI designs the layout, writes the copy, and finds the photography.
          Or attach a document or image and it builds the issue from that.
        </p>

        {/* The one input the whole flow starts from. */}
        <div
          className="mt-8 w-full max-w-2xl rounded-2xl border bg-background text-left shadow-sm transition-shadow focus-within:shadow-md"
          style={{ borderColor: dragOver ? ACCENT : undefined, boxShadow: dragOver ? `0 0 0 3px ${ACCENT}33` : undefined }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <textarea
            ref={taRef}
            className="w-full resize-none rounded-2xl bg-transparent px-4 pt-4 text-[15px] leading-relaxed placeholder:text-muted-foreground focus:outline-none"
            rows={3}
            autoFocus
            placeholder="e.g. A spring issue for New Zealand racehorse owners — bold, modern, photo-led…"
            value={brief}
            disabled={starting}
            onChange={(e) => { setBrief(e.target.value); autoGrow(); }}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void startAI(); }}
          />

          {file && (
            <div className="mx-4 mt-1 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-sm">
              <FileText size={15} className="shrink-0" style={{ color: ACCENT }} />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">building from this</span>
              <button className="rounded p-1 hover:bg-muted" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Remove attachment"><X size={14} /></button>
            </div>
          )}

          {/* toolbar */}
          <div className="flex items-center justify-between gap-2 px-2.5 py-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={starting}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                title="Attach a document or image to build from"
              >
                <Paperclip size={16} /> <span className="hidden sm:inline">Attach</span>
              </button>
              <span className="hidden pl-1 text-xs text-muted-foreground sm:inline">
                Shows a quick preview — say how many pages you want, or add more later.
              </span>
            </div>

            <button
              onClick={() => void startAI()}
              disabled={!canGenerate}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: ACCENT }}
            >
              {starting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {starting ? 'Starting…' : 'Generate'}
              {!starting && <ArrowUp size={14} className="opacity-70" />}
            </button>
          </div>

          <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
        </div>

        {/* Brief inline status while we create the issue, then the studio opens. */}
        {starting && startMsg && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" style={{ color: ACCENT }} /> {startMsg}
          </p>
        )}

        {/* Quiet secondary starts. */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <button type="button" onClick={() => importRef.current?.click()} disabled={starting} className="inline-flex items-center gap-1.5 hover:text-foreground disabled:opacity-50">
            <FileScan size={15} /> Import a PDF, Word or image
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${ACCENT}14`, color: ACCENT }}>keeps layout</span>
          </button>
          <span className="hidden text-border sm:inline">·</span>
          <button type="button" onClick={() => void startBlank()} disabled={starting} className="inline-flex items-center gap-1.5 hover:text-foreground disabled:opacity-50">
            <FilePlus size={15} /> Start from blank
          </button>
          <input ref={importRef} type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void startImport(f); if (importRef.current) importRef.current.value = ''; }} />
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>

      {/* ── Your magazines ────────────────────────────────────────────── */}
      <section className="mt-16">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        ) : issues.length > 0 ? (
          <>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Your magazines</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {issues.map((it) => {
                const published = !!it.publishedIssueId;
                const busy = pubBusy === it.id;
                return (
                  <div key={it.id} className="flex flex-col rounded-lg border border-border p-4 transition-colors hover:border-[#7c3aed]">
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
          </>
        ) : null}
      </section>
    </div>
  );
}
