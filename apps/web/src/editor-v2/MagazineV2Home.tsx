// Magazine Builder v2 — library + the Create popup (the AI entry point).
// Two AI-first paths: "Build with AI" (describe → LLM generates the issue) and
// "Upload PDF" (extract → coming in the import phase). Plus a plain Blank start.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, FileUp, FilePlus, X, Loader2 } from 'lucide-react';
import * as api from './api';
import type { IssueSummary } from './api';

type Mode = 'menu' | 'ai' | 'generating';

export default function MagazineV2Home() {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('menu');
  const [brief, setBrief] = useState('');
  const [pageCount, setPageCount] = useState(8);
  const [progress, setProgress] = useState<{ done: number; total: number; stage: string }>({ done: 0, total: 0, stage: '' });
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.listIssues().then(setIssues).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const openEditor = (id: string) => navigate(`/newsroom/magazine-v2/${id}`);

  const startBlank = async () => {
    try {
      const { issue } = await api.createBlankIssue('Untitled issue');
      openEditor(issue.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    }
  };

  const startAI = async () => {
    if (!brief.trim()) return;
    setError(null);
    setMode('generating');
    setProgress({ done: 0, total: pageCount, stage: 'Designing the issue' });
    try {
      const { issue } = await api.generateIssue(brief.trim(), pageCount);
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

  const close = () => {
    if (mode === 'generating') return; // don't abandon an in-flight generation
    setOpen(false);
    setMode('menu');
    setBrief('');
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
          {issues.map((it) => (
            <button key={it.id} className="rounded border border-border p-4 text-left hover:border-[#7c3aed] hover:bg-muted" onClick={() => openEditor(it.id)}>
              <div className="truncate font-medium">{it.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{it.status} · {it.pageCount} page{it.pageCount === 1 ? '' : 's'}</div>
            </button>
          ))}
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
                  <span><span className="block font-medium">Build with AI</span><span className="text-xs text-muted-foreground">Describe the magazine you want — the AI designs and writes the whole issue.</span></span>
                </button>
                <button className="flex items-start gap-3 rounded border border-border p-4 text-left opacity-60" disabled title="Coming in the import phase">
                  <FileUp size={22} className="mt-0.5" />
                  <span><span className="block font-medium">Upload a PDF <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">soon</span></span><span className="text-xs text-muted-foreground">Extract an existing PDF into an editable magazine.</span></span>
                </button>
                <button className="flex items-start gap-3 rounded border border-border p-4 text-left hover:border-[#7c3aed] hover:bg-muted" onClick={() => void startBlank()}>
                  <FilePlus size={22} className="mt-0.5" />
                  <span><span className="block font-medium">Blank</span><span className="text-xs text-muted-foreground">Start from an empty page and build it yourself.</span></span>
                </button>
              </div>
            )}

            {mode === 'ai' && (
              <div className="grid gap-3">
                <label className="text-sm font-medium">Describe your magazine</label>
                <textarea
                  className="w-full rounded border border-border bg-background p-2.5 text-sm"
                  rows={5}
                  autoFocus
                  placeholder="e.g. A spring issue for New Zealand racehorse owners — a bold cover, a feature on a champion mare, a pull-quote, a roundup of upcoming meetings, and a back cover with a QR to the club."
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                />
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Pages:</span>
                  <select className="rounded border border-border bg-background px-2 py-1" value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))}>
                    {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button className="rounded px-3 py-2 text-sm hover:bg-muted" onClick={() => setMode('menu')}>Back</button>
                  <button className="inline-flex items-center gap-2 rounded bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!brief.trim()} onClick={() => void startAI()}>
                    <Sparkles size={16} /> Generate
                  </button>
                </div>
              </div>
            )}

            {mode === 'generating' && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Loader2 size={28} className="animate-spin text-[#7c3aed]" />
                <div className="font-medium">{progress.stage || 'Generating…'}</div>
                <div className="text-sm text-muted-foreground">{progress.done > 0 ? `Composed ${progress.done} of ${progress.total} pages` : 'The AI is designing your issue…'}</div>
                <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-[#7c3aed] transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 8}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
