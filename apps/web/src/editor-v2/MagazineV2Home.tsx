// Magazine Builder v2 — home. Leads with a single, centered AI composer: the
// user describes the magazine (and/or attaches a document/image) and the AI
// designs + writes + illustrates the whole issue. On generate we drop STRAIGHT
// into the studio — pages stream in live there — instead of a blocking loader.
// Import (pixel-faithful) and Blank are quiet secondary starts.

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Paperclip, X, FileText, FileScan, FilePlus, Globe, Trash2, ArrowUp, Pencil, Eye, LayoutTemplate } from 'lucide-react';
import { toast } from 'sonner';
import * as api from './api';
import type { IssueSummary } from './api';
import { ingestFile, attachmentSourceText, ATTACH_ACCEPT } from '@/agent/attachments/documentUpload';
import { ShimmerText } from './BuildProgress';

const ACCENT = '#7c3aed';

/** Lifecycle status → a word for a person. Anything unmapped falls through as-is,
 *  so a new backend status shows up honestly rather than vanishing. */
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  uploading: 'Uploading',
  processing: 'Building',
  ready: 'Ready',
  published: 'Published',
  revising: 'Revising',
  failed: 'Failed',
};
/** The two that mean "work is happening right now", so they shimmer. */
const STATUS_BUSY = new Set(['uploading', 'processing']);

const IMPORT_ACCEPT =
  'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/jpeg,image/png,.jpg,.jpeg,.png';

const MAX_SOURCE_FILES = 5;

const WORD_NUMS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
};

/** The page count the user explicitly asked for, if any — the LARGEST "N page(s)"
 *  mention in the brief ("two pages of a 16 page bulletin" → 16: the issue size,
 *  not the spread within it). undefined when no usable count is named; the server
 *  only honors 3–16 and ignores anything else, matching its own clamp. */
function parsePageCount(brief: string): number | undefined {
  let best: number | undefined;
  const re = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen)[-\s]*pages?\b/gi;
  for (let m = re.exec(brief); m; m = re.exec(brief)) {
    const n = WORD_NUMS[m[1]!.toLowerCase()] ?? Number(m[1]);
    if (Number.isInteger(n) && (best === undefined || n > best)) best = n;
  }
  return best !== undefined && best >= 3 && best <= 16 ? best : undefined;
}

export default function MagazineV2Home() {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false); // brief: reading doc / creating the issue before we navigate
  const [startMsg, setStartMsg] = useState('');
  const [brief, setBrief] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]); // optional source documents/images to build from
  const [dragOver, setDragOver] = useState(false);
  const [pubBusy, setPubBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.listIssues().then(setIssues).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false));
  }, []);

  const openEditor = (id: string) => navigate(`/production-system/magazine-v2/${id}`);

  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  };

  // Start a new magazine from this one's LAYOUT (copy stripped). Any staff member
  // can reuse any magazine's design — the source is never modified.
  const reuseTemplate = async (it: IssueSummary) => {
    if (pubBusy) return;
    setPubBusy(it.id);
    try {
      const { issue } = await api.reuseIssueTemplate(it.id);
      toast.success('Template copied — the text and photos are yours to fill in.');
      openEditor(issue.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reuse that template');
    } finally {
      setPubBusy(null);
    }
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
    if ((!brief.trim() && files.length === 0) || starting) return;
    setError(null);
    setStarting(true);
    try {
      let sourceText: string | undefined;
      const docFiles: { file: File; text: string }[] = []; // non-image attachments to persist to the Uploads library
      if (files.length > 0) {
        setStartMsg(files.length === 1 ? 'Reading your document…' : 'Reading your attachments…');
        // A generated issue is a SHORT preview, so we only need the first few
        // pages of each doc read up front. For a scanned PDF this is decisive:
        // OCR'ing all pages takes minutes, so we cap it here and note the
        // coverage — the rest can be pulled in later via "Add more pages".
        const parts: string[] = [];
        const skipped: string[] = [];
        for (const f of files) {
          const isImage = f.type.startsWith('image/');
          let text = '';
          try {
            text = attachmentSourceText(await ingestFile(f, { maxPages: 6 }));
            if (text) {
              const label = isImage ? 'Attached image' : 'Attached document';
              parts.push(files.length > 1 ? `[${label} “${f.name}” — content]\n${text}` : text);
            }
          } catch {
            skipped.push(f.name);
          }
          // Persist every document (even one we couldn't read client-side) so it's
          // browsable in the Uploads library; images are stored separately below.
          if (!isImage) docFiles.push({ file: f, text });
        }
        // Don't dead-end the user on a patchy read: build from whatever else they
        // gave and note what was skipped; only hard-fail when nothing is readable.
        if (skipped.length > 0) {
          if (parts.length > 0 || brief.trim()) {
            toast.message(`Couldn't read ${skipped.map((n) => `“${n}”`).join(', ')} — building from the rest.`);
          } else {
            setError('Could not read those attachments. Add a short description and try again.');
            setStarting(false);
            setStartMsg('');
            return;
          }
        }
        sourceText = parts.join('\n\n') || undefined;
      }
      setStartMsg('Opening the studio…');
      // Honor an explicit "N page(s)" from the brief; otherwise the AI plans a
      // short preview — more pages can always be added afterwards.
      const { issue } = await api.generateIssue(brief.trim(), parsePageCount(brief), sourceText);
      // Persist attached IMAGES into the new issue's media library so the studio
      // assistant can actually place them on pages (generation itself writes from
      // the text digests above; the pixels ride along here).
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length > 0 && issue?.id) {
        setStartMsg('Storing your images…');
        await Promise.all(
          imageFiles.map(async (f) => {
            try {
              await api.uploadMediaImage(issue.id, f, f.name);
            } catch {
              toast.message(`Couldn't add “${f.name}” to the magazine's media library.`);
            }
          }),
        );
      }
      // Persist attached DOCUMENTS into the issue's Uploads library so they're
      // browsable & previewable there (generation already consumed their text above).
      if (docFiles.length > 0 && issue?.id) {
        setStartMsg('Saving your documents…');
        await Promise.all(
          docFiles.map(async ({ file, text }) => {
            try {
              await api.uploadMediaDoc(issue.id, file, { sourceText: text });
            } catch {
              toast.message(`Couldn't save “${file.name}” to the magazine's uploads.`);
            }
          }),
        );
      }
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

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const room = Math.max(0, MAX_SOURCE_FILES - files.length);
    if (list.length > room) toast.message(`Up to ${MAX_SOURCE_FILES} attachments — the rest were skipped.`);
    const picked = Array.from(list).slice(0, room);
    if (picked.length > 0) setFiles((prev) => [...prev, ...picked]);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const canGenerate = (!!brief.trim() || files.length > 0) && !starting;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      {/* ── Hero composer ─────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pt-6 text-center sm:pt-10">
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
          className="mt-6 w-full max-w-3xl rounded-[26px] border border-border/70 bg-card text-left shadow-[0_10px_34px_rgba(0,0,0,0.09)] transition-all duration-200 focus-within:border-[#7c3aed]/60 focus-within:shadow-[0_14px_44px_rgba(124,58,237,0.16)]"
          style={{ borderColor: dragOver ? ACCENT : undefined, boxShadow: dragOver ? `0 0 0 3px ${ACCENT}33` : undefined }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <textarea
            ref={taRef}
            className="w-full resize-none rounded-[26px] bg-transparent px-5 pt-5 text-[16px] leading-relaxed placeholder:text-muted-foreground/70 focus:outline-none"
            rows={2}
            autoFocus
            placeholder="e.g. A spring issue for New Zealand racehorse owners — bold, modern, photo-led…"
            value={brief}
            disabled={starting}
            onChange={(e) => { setBrief(e.target.value); autoGrow(); }}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void startAI(); }}
          />

          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="mx-4 mt-1 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-sm">
              <FileText size={15} className="shrink-0" style={{ color: ACCENT }} />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">building from this</span>
              <button className="rounded p-1 hover:bg-muted" onClick={() => { setFiles((prev) => prev.filter((_, j) => j !== i)); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Remove attachment"><X size={14} /></button>
            </div>
          ))}

          {/* toolbar */}
          <div className="flex items-center justify-between gap-2 px-3.5 pb-3 pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={starting}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
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
              className="inline-flex items-center gap-1.5 rounded-2xl px-5 py-2.5 text-[15px] font-semibold text-white shadow-lg shadow-[#7c3aed]/25 transition-all hover:-translate-y-px hover:shadow-xl hover:shadow-[#7c3aed]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
              style={{ backgroundImage: `linear-gradient(135deg, #9061f9 0%, ${ACCENT} 100%)`, backgroundColor: ACCENT }}
            >
              <Sparkles size={16} />
              {starting ? <ShimmerText>Starting…</ShimmerText> : 'Generate'}
              {!starting && <ArrowUp size={15} className="opacity-80" />}
            </button>
          </div>

          <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </div>

        {/* Brief inline status while we create the issue, then the studio opens. */}
        {/* `startMsg` is already the specific step ("Storing your images…"), so it
            shimmers as itself — no rotating flavour here, because these steps are
            a second or two each and a line that flipped once would read as a
            glitch. The long wait is in the studio, which has the full build view. */}
        {starting && startMsg && (
          <p className="mt-3 text-sm" style={{ color: ACCENT }} role="status" aria-live="polite">
            <ShimmerText>{startMsg}</ShimmerText>
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
          // Skeleton cards in the real grid, not a centred "Loading…" — the list
          // arrives in place instead of the page jumping when it does.
          <>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              <ShimmerText>Loading your magazines</ShimmerText>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-4">
                  <div className="h-4 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted/70" />
                  <div className="mt-2 h-6 w-24 rounded bg-muted/50" />
                </div>
              ))}
            </div>
          </>
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
                      {/* The raw status token used to be printed here — "processing"
                          in lowercase, which is a database value, not a sentence.
                          A magazine mid-build now says so, and shimmers while it is.
                          No counts: the list endpoint doesn't send pagesProcessed,
                          and the studio is where the real progress lives. */}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {STATUS_BUSY.has(it.status) ? (
                          <span style={{ color: ACCENT }}>
                            <ShimmerText>{STATUS_LABEL[it.status] ?? 'Working'}</ShimmerText>
                          </span>
                        ) : (
                          (STATUS_LABEL[it.status] ?? it.status)
                        )}{' '}
                        · {it.pageCount} page{it.pageCount === 1 ? '' : 's'}{it.ownerName ? ` · ${it.ownerName}` : ''}
                      </div>
                      {!it.myRole && (
                        <span className="mt-1.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">View only</span>
                      )}
                    </button>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
                      {/* Open the studio. Without a role this is read-only, so it's
                          labelled honestly rather than promising an edit. */}
                      <button
                        onClick={() => openEditor(it.id)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium hover:border-[#7c3aed] hover:text-[#7c3aed]"
                        title={it.myRole ? 'Open this magazine in the studio' : 'Open read-only (you do not have edit access)'}
                      >
                        {it.myRole ? <Pencil size={12} /> : <Eye size={12} />}
                        {it.myRole ? 'Edit' : 'View'}
                      </button>
                      {/* Reuse the DESIGN as a new magazine of your own — allowed on
                          any card, including view-only ones, because it only ever
                          creates a new document and never touches this one. */}
                      <button
                        onClick={() => void reuseTemplate(it)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-medium hover:border-[#7c3aed] hover:text-[#7c3aed] disabled:opacity-50"
                        title="Start a new magazine with this layout — the text and photos are cleared"
                      >
                        <LayoutTemplate size={12} />
                        {busy ? <ShimmerText>Copying…</ShimmerText> : 'Reuse template'}
                      </button>
                      {it.myRole === 'owner' && (
                        <button
                          onClick={() => void removeIssue(it)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded border border-red-300/40 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300/90 dark:hover:bg-red-500/10"
                          title="Delete this magazine"
                        >
                          <Trash2 size={12} />
                          {busy ? <ShimmerText>Deleting…</ShimmerText> : 'Delete'}
                        </button>
                      )}
                      {published && it.publishedIssueId && (
                        <a href={`/bulletins/${it.publishedIssueId}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-[#7c3aed] hover:underline">
                          View on Bulletins
                        </a>
                      )}
                    </div>
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
