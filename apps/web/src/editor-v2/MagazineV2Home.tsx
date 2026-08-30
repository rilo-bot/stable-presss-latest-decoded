// Magazine Builder v2 — home. Leads with a single, centered AI composer: the
// user describes the magazine (and/or attaches a document/image) and the AI
// designs + writes + illustrates the whole issue. On generate we drop STRAIGHT
// into the studio — pages stream in live there — instead of a blocking loader.
// Import (pixel-faithful) and Blank are quiet secondary starts.

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Paperclip, X, FileText, FileScan, FilePlus, Globe, Trash2, ArrowUp, Pencil, Eye, LayoutTemplate } from 'lucide-react';
import { toast } from 'sonner';
import * as api from './api';
import { ApiError, type IssueSummary } from './api';
// ingestFile / attachmentSourceText are deliberately NOT imported any more: this
// screen no longer reads documents in the browser. Reading happens in the worker,
// which is what removed the six-page cap. ATTACH_ACCEPT still governs the picker.
import { ATTACH_ACCEPT } from '@/agent/attachments/documentUpload';
import { filesFromClipboard, isPasteImage } from '@/agent/attachments/clipboard';
import { fullTimestamp, relativeTime, shortDate } from '@/lib/relativeTime';
import { ShimmerText } from './BuildProgress';

/**
 * Gold, in its TWO forms. The library sits on the light app surface, where the
 * raw accent is only 2.06:1 as text — so fills use `ACCENT` and anything a
 * person reads (text, icons) uses `ACCENT_INK`. See docs/THEME-REVIEW.md; this
 * page was violet (#7c3aed), an accent that appears nowhere else in the product
 * and made the library and the studio look like two different applications.
 */
const ACCENT = 'hsl(var(--brand-accent))';
const ACCENT_INK = 'hsl(var(--brand-accent-ink))';
const ACCENT_WASH = 'color-mix(in oklab, hsl(var(--brand-accent)) 12%, transparent)';

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

/** Below this, "started" and "edited" are the same event said twice — a magazine
 *  that was created and never touched since. One minute is generously past the
 *  few seconds the create + first write take. */
const EDIT_IS_DISTINCT_MS = 60_000;

/**
 * The two dates a card can carry, already decided.
 *
 * `started` is absolute: the date a magazine was begun is a fact you file it
 * under, and "43 days ago" is arithmetic. `edited` is relative, because the only
 * question anyone asks of it is how fresh this is.
 *
 * `edited` is omitted in two cases, both of which would be saying nothing. A
 * magazine nobody has touched since it was made has no second date to give. And
 * one that is mid-build has its `updatedAt` bumped by the build itself — the
 * status beside it already shimmers "Building", so "edited just now" would credit
 * the machine's work to the user.
 */
function cardDates(it: IssueSummary): { started: string; startedFull: string; edited: string; editedFull: string } {
  const startedAt = Date.parse(it.createdAt);
  const updatedAt = Date.parse(it.updatedAt);
  const distinct =
    Number.isFinite(startedAt) && Number.isFinite(updatedAt) && updatedAt - startedAt > EDIT_IS_DISTINCT_MS;
  const show = distinct && !STATUS_BUSY.has(it.status);
  return {
    started: shortDate(it.createdAt),
    startedFull: fullTimestamp(it.createdAt),
    edited: show ? relativeTime(it.updatedAt) : '',
    editedFull: show ? fullTimestamp(it.updatedAt) : '',
  };
}

const IMPORT_ACCEPT =
  'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/jpeg,image/png,.jpg,.jpeg,.png';

const MAX_SOURCE_FILES = 5;
/** The name `filesFromClipboard` gives a browser-named bitmap. Matched to continue
 *  the numbering across pastes; must stay in step with that helper. */
const PASTED_IMAGE_NAME = /^Pasted image \d+\./i;
/** Mirrors MAX_SOURCE_BYTES on the server (`lib/magazineV2/config.ts`). Checked here
 *  so an oversized file is refused before it is uploaded rather than after — the
 *  server still enforces it, this only stops the wasted upload. */
const MAX_SOURCE_BYTES = 150 * 1024 * 1024;

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
    const drop = () => setIssues((prev) => prev.filter((r) => r.id !== it.id));
    try {
      await api.deleteIssue(it.id);
      drop();
      toast.success('Magazine deleted.');
    } catch (e) {
      // A magazine that is LIVE is refused the first time, because deleting it also
      // takes the bulletin off the public newsstand; `?confirm=1` retries through it.
      // This path used to stop at the refusal — so the dialog above promised the
      // published edition would be removed, the user agreed, and then nothing
      // happened but a toast of the server's objection. A lock with no key, and the
      // studio's own delete has had the key all along.
      if (e instanceof ApiError && e.status === 409 && e.body?.reason === 'is-live') {
        if (window.confirm(`${e.message}\n\nDelete it anyway? This cannot be undone.`)) {
          try {
            await api.deleteIssue(it.id, true);
            drop();
            toast.success('Magazine deleted, and removed from Bulletins.');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Delete failed');
          }
        }
      } else {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    } finally {
      setPubBusy(null);
    }
  };

  const startBlank = async () => {
    // `starting` has to be SET for the guard above to mean anything — without this
    // the re-entry check never armed, and a double-click on "Blank magazine" made
    // two of them. (The other two start paths set it; this one was missed.)
    if (starting) return;
    setStarting(true);
    setError(null);
    setStartMsg('Creating your magazine…');
    try {
      const { issue } = await api.createBlankIssue('Untitled Magazine');
      openEditor(issue.id); // the studio takes over; `starting` dies with this view
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
      setStarting(false);
      setStartMsg('');
    }
  };

  // Build with AI → create the issue, then jump straight into the studio. The
  // editor polls and reveals each page as it's composed (no blocking loader).
  const startAI = async () => {
    if ((!brief.trim() && files.length === 0) || starting) return;
    setError(null);
    setStarting(true);
    try {
      // UPLOAD FIRST, THEN GENERATE. The old order was the reverse — every
      // attachment was read through the API before the issue existed, so the user
      // watched a spinner for the length of the read. That is precisely why the read
      // was capped at six pages: any more and the wait became intolerable, and a
      // 40-page report silently contributed six pages of itself.
      //
      // Now the issue is reserved first, the bytes go straight to S3 with a real
      // progress bar, and the reading happens in the worker while the studio is
      // already open. Nothing waits on the read, so nothing has to cap it.
      const docIds: string[] = [];
      let preparedId: string | undefined;
      const docFiles = files.filter((f) => !f.type.startsWith('image/'));

      if (docFiles.length > 0) {
        setStartMsg('Preparing…');
        preparedId = (await api.prepareIssue()).issue.id;
        const failed: string[] = [];
        for (let i = 0; i < docFiles.length; i++) {
          const f = docFiles[i]!;
          const label = docFiles.length > 1 ? ` (${i + 1} of ${docFiles.length})` : '';
          try {
            const docId = await api.uploadSourceDoc(
              preparedId,
              f,
              (fraction) => {
                // A percentage, not a spinner: with no page cap a source file can be
                // hundreds of megabytes, and an indeterminate spinner over a long
                // upload is indistinguishable from a hang.
                setStartMsg(`Uploading “${f.name}”${label} — ${Math.round(fraction * 100)}%`);
              },
              // Defer the read: the generate call below enqueues one per document,
              // carrying the continuation. Without this the document is read twice.
              true,
            );
            docIds.push(docId);
          } catch (e) {
            console.warn('[magazine] source upload failed', f.name, e);
            failed.push(f.name);
          }
        }
        // Do not dead-end the user on one bad file: build from the rest, and only
        // stop when there is nothing left to build from at all.
        if (failed.length > 0) {
          if (docIds.length > 0 || brief.trim()) {
            toast.message(`Couldn't upload ${failed.map((n) => `“${n}”`).join(', ')} — building from the rest.`);
          } else {
            setError('Those files could not be uploaded. Check your connection, or add a short description instead.');
            setStarting(false);
            setStartMsg('');
            return;
          }
        }
      }

      setStartMsg('Opening the studio…');
      // Honor an explicit "N page(s)" from the brief; otherwise the AI plans a
      // short preview — more pages can always be added afterwards. The documents are
      // cited by ID: unlike the text that used to be posted here, an id can be
      // re-read by every later pass, which is what makes "add more pages" able to
      // consult the document instead of inventing from the title.
      const { issue } = await api.generateIssue(
        brief.trim(),
        parsePageCount(brief),
        undefined,
        docIds.length > 0 ? docIds : undefined,
        preparedId,
      );
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
      // Also list the documents in the issue's browsable Uploads library.
      //
      // This IS a second upload of the same bytes, and it is a rough edge rather than
      // a design: the Uploads library and the source-document store are two
      // collections that grew separately, and the panel that renders Uploads reads
      // only the former. Dropping it would make an attached document vanish from a
      // place the user can currently see it, which is a worse trade than a duplicate
      // upload of a small file.
      //
      // So: small files behave exactly as before, and a large one is skipped with the
      // reason said out loud — re-sending two hundred megabytes to populate a list is
      // not defensible, and now that the caps are gone that size is reachable. The
      // real fix is for the panel to read the source store; see step 8.
      const UPLOADS_COPY_LIMIT = 25 * 1024 * 1024;
      const copyable = docFiles.filter((f) => f.size <= UPLOADS_COPY_LIMIT);
      const tooBigToCopy = docFiles.filter((f) => f.size > UPLOADS_COPY_LIMIT);
      if (copyable.length > 0 && issue?.id) {
        setStartMsg('Saving your documents…');
        await Promise.all(
          copyable.map(async (file) => {
            try {
              await api.uploadMediaDoc(issue.id, file);
            } catch {
              toast.message(`Couldn't save “${file.name}” to the magazine's uploads.`);
            }
          }),
        );
      }
      if (tooBigToCopy.length > 0) {
        toast.message(
          `${tooBigToCopy.map((f) => `“${f.name}”`).join(', ')} ${tooBigToCopy.length === 1 ? 'is' : 'are'} attached and being read — too large to also copy into Uploads.`,
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

  // Takes a FileList (picker, drop) or a plain array (paste) — the clipboard
  // helper hands back real Files, not a FileList, because it renames some of them.
  const addFiles = (list: FileList | File[] | null) => {
    const incoming = list ? Array.from(list) : [];
    if (incoming.length === 0) return;
    const room = Math.max(0, MAX_SOURCE_FILES - files.length);
    if (incoming.length > room) toast.message(`Up to ${MAX_SOURCE_FILES} attachments — the rest were skipped.`);

    // Check the size HERE, at the picker. There was no client-side check at all, so
    // an oversized file was uploaded in full and only then refused — the user spent
    // the whole upload to be told the file was too big, and on a slow connection
    // that is minutes of wasted time and bandwidth. The size is known the instant
    // the file is chosen; there is no reason to send a byte of it.
    const chosen = incoming.slice(0, room);
    const picked = chosen.filter((f) => f.size <= MAX_SOURCE_BYTES);
    const oversize = chosen.filter((f) => f.size > MAX_SOURCE_BYTES);
    if (oversize.length > 0) {
      toast.message(
        `${oversize.map((f) => `“${f.name}”`).join(', ')} ${oversize.length === 1 ? 'is' : 'are'} over the ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)} MB limit.`,
      );
    }
    if (picked.length > 0) setFiles((prev) => [...prev, ...picked]);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  /**
   * Paste a screenshot (or a copied file) straight into the brief.
   *
   * The studio's assistant has had this; this composer — the one every magazine
   * actually starts from — did not, so the only way in was the picker, and a
   * region grab (Win+Shift+S, Cmd+Ctrl+Shift+4) never touches disk for the picker
   * to find. `filesFromClipboard` is the same helper AiPanel uses: it reads both
   * clipboard shapes, de-duplicates, and gives browser-named bitmaps a numbered
   * name so three chips don't all read "image.png".
   *
   * The handler sits on the composer wrapper, so a paste into the textarea bubbles
   * up to it and a paste anywhere else in the box is caught too. A paste carrying
   * no attachable file returns WITHOUT preventDefault, leaving ordinary text
   * pasting into the brief exactly as it was.
   */
  const onPasteFiles = (e: ClipboardEvent) => {
    if (starting) return; // the issue is already being created; a new attachment can't join it
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable) return;
    const pasted = filesFromClipboard(e.clipboardData, {
      // Continue the numbering across separate pastes rather than restarting at 1.
      // Counted off the staged names because this screen keeps plain Files with no
      // room for a "came from the clipboard" flag.
      startIndex: files.filter((f) => PASTED_IMAGE_NAME.test(f.name)).length,
    });
    if (pasted.length === 0) return; // plain text — the textarea keeps its paste
    e.preventDefault();
    if (files.length >= MAX_SOURCE_FILES) {
      toast.message(`Up to ${MAX_SOURCE_FILES} attachments — remove one to paste another.`);
      return;
    }
    addFiles(pasted);
    // A paste is invisible until the chip renders below the textarea, which is not
    // where the user is looking — so say what landed. Images only: pasting a
    // document is already a deliberate enough act to need no confirmation.
    const images = pasted.filter(isPasteImage).length;
    if (images > 0) {
      toast.success(images === 1 ? 'Image attached from your clipboard.' : `${images} images attached from your clipboard.`);
    }
  };

  const canGenerate = (!!brief.trim() || files.length > 0) && !starting;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      {/* ── Hero composer ─────────────────────────────────────────────── */}
      <section className="flex flex-col items-center pt-6 text-center sm:pt-10">
        <span
          className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-ui-sm font-medium"
          style={{ backgroundColor: ACCENT_WASH, color: ACCENT_INK }}
        >
          <Sparkles size={13} /> AI Magazine Builder
        </span>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">What magazine shall we make?</h1>
        <p className="mt-3 max-w-xl text-balance text-ui text-muted-foreground sm:text-ui-lg">
          Describe it in a sentence — the AI designs the layout, writes the copy, and finds the photography.
          Or attach a document or image and it builds the issue from that.
        </p>

        {/* The one input the whole flow starts from. */}
        <div
          className="mt-6 w-full max-w-3xl rounded-[26px] border border-border/70 bg-card text-left shadow-[0_10px_34px_rgba(0,0,0,0.09)] transition-all duration-200 focus-within:border-brand-accent focus-within:shadow-[0_14px_44px_rgba(212,168,67,0.20)]"
          style={{ borderColor: dragOver ? ACCENT : undefined, boxShadow: dragOver ? '0 0 0 3px color-mix(in oklab, hsl(var(--brand-accent)) 26%, transparent)' : undefined }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onPaste={onPasteFiles}
        >
          <textarea
            ref={taRef}
            className="w-full resize-none rounded-[26px] bg-transparent px-5 pt-5 text-ui-lg leading-relaxed placeholder:text-muted-foreground/70 focus:outline-none"
            rows={2}
            autoFocus
            placeholder="e.g. A spring issue for New Zealand racehorse owners — bold, modern, photo-led…"
            value={brief}
            disabled={starting}
            onChange={(e) => { setBrief(e.target.value); autoGrow(); }}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void startAI(); }}
          />

          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="mx-4 mt-1 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-ui">
              <FileText size={15} className="shrink-0" style={{ color: ACCENT_INK }} />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="hidden text-ui-sm text-muted-foreground sm:inline">building from this</span>
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
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-ui text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                title="Attach a document or image to build from — you can also paste or drop one"
              >
                <Paperclip size={16} /> <span className="hidden sm:inline">Attach</span>
              </button>
              <span className="hidden pl-1 text-ui-sm text-muted-foreground sm:inline">
                Shows a quick preview — say how many pages you want, or add more later.
              </span>
            </div>

            <button
              onClick={() => void startAI()}
              disabled={!canGenerate}
              className="inline-flex items-center gap-1.5 rounded-2xl px-5 py-2.5 text-ui-lg font-semibold shadow-lg shadow-[rgba(212,168,67,0.35)] transition-all hover:-translate-y-px hover:shadow-xl hover:shadow-[rgba(212,168,67,0.45)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--gold-light) 0%, var(--gold-bright) 100%)', backgroundColor: 'var(--gold-bright)', color: 'var(--forest-deep)' }}
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
          <p className="mt-3 text-ui" style={{ color: ACCENT_INK }} role="status" aria-live="polite">
            <ShimmerText>{startMsg}</ShimmerText>
          </p>
        )}

        {/* Quiet secondary starts. */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-ui text-muted-foreground">
          <button type="button" onClick={() => importRef.current?.click()} disabled={starting} className="inline-flex items-center gap-1.5 hover:text-foreground disabled:opacity-50">
            <FileScan size={15} /> Import a PDF, Word or image
            <span className="rounded px-1.5 py-0.5 text-ui-sm font-medium" style={{ backgroundColor: ACCENT_WASH, color: ACCENT_INK }}>keeps layout</span>
          </button>
          <span className="hidden text-border sm:inline">·</span>
          <button type="button" onClick={() => void startBlank()} disabled={starting} className="inline-flex items-center gap-1.5 hover:text-foreground disabled:opacity-50">
            <FilePlus size={15} /> Start from blank
          </button>
          <input ref={importRef} type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void startImport(f); if (importRef.current) importRef.current.value = ''; }} />
        </div>

        {error && <p className="mt-4 text-ui text-red-600">{error}</p>}
      </section>

      {/* ── Your magazines ────────────────────────────────────────────── */}
      <section className="mt-16">
        {loading ? (
          // Skeleton cards in the real grid, not a centred "Loading…" — the list
          // arrives in place instead of the page jumping when it does.
          <>
            <h2 className="mb-3 text-ui font-semibold text-muted-foreground">
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
            <h2 className="mb-3 text-ui font-semibold text-muted-foreground">Your magazines</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {issues.map((it) => {
                const published = !!it.publishedIssueId;
                const busy = pubBusy === it.id;
                const when = cardDates(it);
                return (
                  <div key={it.id} className="flex flex-col rounded-lg border border-border p-4 transition-colors hover:border-brand-accent">
                    <button className="min-w-0 flex-1 text-left" onClick={() => openEditor(it.id)}>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{it.title}</span>
                        {published && (
                          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-ui-sm font-semibold text-emerald-700">
                            <Globe size={9} /> Live
                          </span>
                        )}
                      </div>
                      {/* The raw status token used to be printed here — "processing"
                          in lowercase, which is a database value, not a sentence.
                          A magazine mid-build now says so, and shimmers while it is.
                          No counts: the list endpoint doesn't send pagesProcessed,
                          and the studio is where the real progress lives. */}
                      <div className="mt-1 text-ui-sm text-muted-foreground">
                        {STATUS_BUSY.has(it.status) ? (
                          <span style={{ color: ACCENT_INK }}>
                            <ShimmerText>{STATUS_LABEL[it.status] ?? 'Working'}</ShimmerText>
                          </span>
                        ) : (
                          (STATUS_LABEL[it.status] ?? it.status)
                        )}{' '}
                        · {it.pageCount} page{it.pageCount === 1 ? '' : 's'}{it.ownerName ? ` · ${it.ownerName}` : ''}
                      </div>
                      {/* When, on its own quieter line — the line above is what the
                          magazine IS, this is when it happened, and running the two
                          together made a five-clause sentence nobody finished reading.
                          Absolute for the start, relative for the edit; see cardDates. */}
                      {(when.started || when.edited) && (
                        <div className="mt-0.5 text-ui-sm text-muted-foreground/80">
                          {when.started && (
                            <span title={when.startedFull || undefined}>Started {when.started}</span>
                          )}
                          {when.started && when.edited && ' · '}
                          {when.edited && (
                            <span title={when.editedFull || undefined}>Edited {when.edited}</span>
                          )}
                        </div>
                      )}
                      {!it.myRole && (
                        <span className="mt-1.5 inline-block rounded bg-muted px-1.5 py-0.5 text-ui-sm font-medium text-muted-foreground">View only</span>
                      )}
                    </button>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
                      {/* Open the studio. Without a role this is read-only, so it's
                          labelled honestly rather than promising an edit. */}
                      <button
                        onClick={() => openEditor(it.id)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-ui-sm font-medium hover:border-brand-accent hover:text-brand-accent-ink"
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
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-ui-sm font-medium hover:border-brand-accent hover:text-brand-accent-ink disabled:opacity-50"
                        title="Start a new magazine with this layout — the text and photos are cleared"
                      >
                        <LayoutTemplate size={12} />
                        {busy ? <ShimmerText>Copying…</ShimmerText> : 'Reuse template'}
                      </button>
                      {it.myRole === 'owner' && (
                        <button
                          onClick={() => void removeIssue(it)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded border border-red-300/40 px-2 py-1 text-ui-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300/90 dark:hover:bg-red-500/10"
                          title="Delete this magazine"
                        >
                          <Trash2 size={12} />
                          {busy ? <ShimmerText>Deleting…</ShimmerText> : 'Delete'}
                        </button>
                      )}
                      {published && it.publishedIssueId && (
                        <a href={`/bulletins/${it.publishedIssueId}`} target="_blank" rel="noreferrer" className="ml-auto text-ui-sm text-brand-accent-ink hover:underline">
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
