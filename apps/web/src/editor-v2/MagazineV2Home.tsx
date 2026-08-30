// Magazine Builder v2 — home. Leads with a single, centered AI composer: the
// user describes the magazine (and/or attaches a document/image) and the AI
// designs + writes + illustrates the whole issue. On generate we drop STRAIGHT
// into the studio — pages stream in live there — instead of a blocking loader.
//
// The composer is now the ONLY way to start a magazine from this screen. The two
// secondary starts that used to sit beneath it — pixel-faithful Import, and a
// Blank magazine — are gone: they read as a caption rather than as controls, and
// clicking either silently discarded whatever was already in the composer. Their
// server routes (POST /issues/upload, /issues/:id/confirm-upload, /issues/blank)
// and the worker's processIssue job are untouched, so nothing else that calls
// them is affected — only this entry point was removed.

import { Fragment, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  X,
  FileText,
  Globe,
  Trash2,
  ArrowUp,
  Pencil,
  Eye,
  LayoutTemplate,
  Database,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import * as api from './api';
import { ApiError, type IssueSummary } from './api';
// ingestFile / attachmentSourceText are deliberately NOT imported any more: this
// screen no longer reads documents in the browser. Reading happens in the worker,
// which is what removed the six-page cap. ATTACH_ACCEPT is still the source of
// truth for what a document picker accepts — DOC_ACCEPT below is derived from it.
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
function cardDates(it: IssueSummary): {
  started: string;
  startedFull: string;
  edited: string;
  editedFull: string;
} {
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

/**
 * The THREE things a person can hand this composer, kept apart on purpose.
 *
 * One "Attach" button could not tell them apart. A PDF meant "write the magazine
 * from this", an image meant "put this photo on a page", and there was no way at
 * all to say "copy this design" — the third is a real feature
 * (docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md) that this screen had no door to.
 *
 * The alternative is guessing intent from the file type, and that is precisely
 * what §5 of that document refuses to do in the chat path: an attached image
 * already means "place this photo", so a sentence is not enough to tell the two
 * apart and a wrong guess is maddening. The composer ASKS instead — the slot the
 * file is in IS the answer, chosen before anything is uploaded.
 */
type Slot = 'data' | 'layout' | 'images';

/** One staged file plus the slot it was put in. A plain File has nowhere to keep
 *  that, and it must survive re-ordering and removal, so they travel together. */
interface Staged {
  file: File;
  slot: Slot;
  /**
   * Layout-slot PDFs only: also WRITE FROM this document, not just copy its design.
   *
   * The first version of this screen forced an either/or — a file was a source or a
   * reference, never both — on the grounds that the layout feature "never takes copy
   * from the reference". That rule exists to stop us reprinting SOMEONE ELSE'S
   * magazine, and it is right for that. It is wrong for the ordinary case, which is a
   * client handing us their OWN last issue: they want this bulletin's stories AND
   * this bulletin's design, and the either/or silently gave them neither. A real run
   * with a 13-page bulletin in the layout slot produced a magazine about page
   * typography, because the planner had the brief and nothing else.
   *
   * So it is a per-file choice, defaulted ON and stated on the chip. The two failures
   * are not symmetric: OFF-by-mistake is silent and total (nothing of the document
   * survives), ON-by-mistake is visible in the first paragraph and one click to undo.
   * Never set for an image — a picture has no text to cite.
   */
  useText?: boolean;
}

const SLOT_ORDER: Slot[] = ['data', 'layout', 'images'];

/**
 * Derived from the shared picker constant rather than re-typed, so a new document
 * type added there reaches this screen instead of drifting out of step. Only the
 * subtraction is stated here: a data reference is a document, never a photo.
 */
const DOC_ACCEPT = ATTACH_ACCEPT.split(',')
  .filter((t) => t.trim() !== 'image/*')
  .join(',');

/** A layout can only be copied from a PDF page or a picture — `canCopyLayout`
 *  on the server says the same thing (a Word file is a stream of words with no
 *  page in it), and the picker should not offer what the server will refuse. */
const LAYOUT_ACCEPT = '.pdf,application/pdf,image/*';

interface SlotMeta {
  label: string;
  /** The group heading above this slot's files. Shorter than `label`, because the
   *  heading sits under a button that already said the long version. */
  heading: string;
  /** What this slot MEANS, said once above its files — so the files themselves can
   *  be bare pills. The first version repeated it on every chip beside a select
   *  offering the same words again, which is the same sentence three times. */
  note: string;
  /** Completes "Use as …" on the move button of a chip in another slot. */
  verb: string;
  icon: typeof Database;
  accept: string;
  /** The toolbar button's tooltip — the long form, for someone deciding. */
  hint: string;
}

const SLOT_META: Record<Slot, SlotMeta> = {
  data: {
    label: 'Data references',
    heading: 'Writing from',
    note: 'the title, sections and every page’s copy come from these',
    verb: 'a data reference',
    icon: Database,
    accept: DOC_ACCEPT,
    hint: 'Documents to WRITE FROM — the AI derives the title, sections and every page’s copy from what they actually say (PDF, Word, text)',
  },
  layout: {
    label: 'Layout match',
    heading: 'Matching the layout of',
    note: 'its composition is copied — photos never are',
    verb: 'a layout to match',
    icon: LayoutTemplate,
    accept: LAYOUT_ACCEPT,
    hint: 'A design to COPY — a PDF page or a picture of a layout. Its composition is matched; its words and photos are never taken',
  },
  images: {
    label: 'Images to use',
    heading: 'Photos to place',
    note: 'saved to the magazine’s media library, ready to drop onto pages',
    verb: 'a photo to place',
    icon: ImageIcon,
    accept: 'image/*',
    hint: 'Your own photos, stored in the magazine’s media library so they can be placed on pages',
  },
};

/** Bytes as a person says them. One decimal only past a megabyte — "1.4 MB" is
 *  useful, "1.43 MB" is noise on a chip. */
function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(kb / 1024 < 10 ? 1 : 0)} MB`;
}

/**
 * A staged photo, shown as itself.
 *
 * "image (1).png" and "aws-architecture.png" are not what a person recognises a
 * picture by, and the composer had them staring at two identical file icons. The
 * object URL is created and revoked HERE, keyed to the component's life, so a
 * removed chip cannot leak a blob — the alternative (a map beside the file list)
 * has to be cleaned up by hand at every remove, reslot and submit.
 */
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? (
    <img src={url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="h-6 w-6 shrink-0 rounded-full bg-muted" />
  );
}

/**
 * One staged file, as a pill sized to its own name.
 *
 * The first version was a full-width bar carrying the slot's meaning in words AND
 * a `<select>` repeating it — so five attachments were five stacked bars of mostly
 * duplicated text. The slot is now said ONCE, in the group heading above; the pill
 * carries only what is specific to this file, and moving it between slots is the
 * two icon buttons that appear on hover (the only thing the select was for, and
 * needed only for a dropped or pasted file that nobody assigned).
 */
function StagedChip({
  row,
  disabled,
  onMove,
  onToggleText,
  onRemove,
}: {
  row: Staged;
  disabled: boolean;
  onMove: (slot: Slot) => void;
  onToggleText: () => void;
  onRemove: () => void;
}) {
  const { file, slot } = row;
  const isImage = file.type.startsWith('image/');
  // Only a PDF in the layout slot has the second question to answer. A picture has
  // no text to take, and a data reference is already being written from.
  const canUseText = slot === 'layout' && !isImage;
  // A Word or text file has no page design, so "use as a layout" is not offered
  // rather than offered and refused — the server would say no, and a control that
  // exists only to be rejected is worse than one that was never there.
  const others = SLOT_ORDER.filter((s) => s !== slot && (s !== 'layout' || canBeLayout(file)));
  return (
    <span className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-1 pr-1 text-ui-sm transition-colors hover:border-brand-accent/60">
      {isImage ? (
        <Thumb file={file} />
      ) : (
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: ACCENT_WASH }}
        >
          <FileText size={13} style={{ color: ACCENT_INK }} />
        </span>
      )}
      <span className="max-w-[11rem] truncate font-medium" title={file.name}>
        {file.name}
      </span>
      <span className="hidden shrink-0 text-muted-foreground/80 sm:inline">{prettySize(file.size)}</span>

      {/* ALWAYS visible, never hover-revealed, and it states the current answer
          rather than the action. This is the switch between "build my bulletin
          again" and "borrow a stranger's grid" — the most consequential thing on
          the chip, and the one a person must be able to see without discovering it. */}
      {canUseText && (
        <button
          type="button"
          disabled={disabled}
          onClick={onToggleText}
          aria-pressed={row.useText !== false}
          title={
            row.useText !== false
              ? 'Its text is being used to write the magazine. Click for layout only — use that for someone else’s magazine.'
              : 'Only its design is being copied. Click to also write the magazine from its text.'
          }
          className="shrink-0 rounded-full border px-1.5 py-0.5 text-ui-sm font-medium transition-colors disabled:opacity-40"
          style={
            row.useText !== false
              ? { backgroundColor: ACCENT_WASH, color: ACCENT_INK, borderColor: 'transparent' }
              : { color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }
          }
        >
          {row.useText !== false ? '+ its text' : 'layout only'}
        </button>
      )}

      {/* Revealed on hover from `sm` up, always visible below it — a touch screen
          has no hover, and a control you can only find with a mouse is missing. */}
      {others.map((s) => {
        const Icon = SLOT_META[s].icon;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onMove(s)}
            title={`Use as ${SLOT_META[s].verb} instead`}
            aria-label={`Use “${file.name}” as ${SLOT_META[s].verb} instead`}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground disabled:opacity-30 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
          >
            <Icon size={13} />
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        aria-label={`Remove ${file.name}`}
      >
        <X size={13} />
      </button>
    </span>
  );
}

/**
 * Put a file in a slot, with that slot's defaults applied.
 *
 * ONE function, called by the picker, the drop, the paste and the move — because
 * `useText` has to default the same way however a file arrives in the layout slot.
 * The first version defaulted it at the picker only, so dragging a PDF in and then
 * moving it to Layout produced a reference with no text: the exact silent failure
 * this whole flag exists to end, reachable by a slightly different route.
 */
function stage(file: File, slot: Slot): Staged {
  return slot === 'layout' && !file.type.startsWith('image/') ? { file, slot, useText: true } : { file, slot };
}

/** Where a file lands when nobody picked a slot — a drop or a paste. Matches the
 *  behaviour this screen has always had (image → photo, anything else → source
 *  document), so the two silent paths are unchanged by the new buttons. */
function defaultSlotFor(f: File): Slot {
  return f.type.startsWith('image/') ? 'images' : 'data';
}

/** A layout reference must be a page or a picture; everything else is refused at
 *  the chip rather than at the upload, where the file is already sent. */
function canBeLayout(f: File): boolean {
  return f.type === 'application/pdf' || f.type.startsWith('image/') || /\.pdf$/i.test(f.name);
}

const MAX_SOURCE_FILES = 5;
/** The name `filesFromClipboard` gives a browser-named bitmap. Matched to continue
 *  the numbering across pastes; must stay in step with that helper. */
const PASTED_IMAGE_NAME = /^Pasted image \d+\./i;
/** Mirrors MAX_SOURCE_BYTES on the server (`lib/magazineV2/config.ts`). Checked here
 *  so an oversized file is refused before it is uploaded rather than after — the
 *  server still enforces it, this only stops the wasted upload. */
const MAX_SOURCE_BYTES = 150 * 1024 * 1024;
/**
 * Mirrors MAX_IMAGE_BYTES — a PICTURE is capped far lower than a document, and this
 * screen was checking every file against the document number.
 *
 * So a 20 MB photo passed the check, uploaded in full, and only then took a 413 from
 * /media/upload-url, surfacing as "Couldn't add … to the magazine's media library"
 * after the wait. That is precisely the failure the comment above says this check
 * exists to prevent, going unprevented for one of the three things you can attach.
 */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** The server's ceiling for what this slot will hold, so the refusal happens at the
 *  picker. A layout reference can be either kind, so it is judged by the file. */
function maxBytesFor(f: File, slot: Slot): number {
  const isImage = f.type.startsWith('image/');
  if (slot === 'images') return MAX_IMAGE_BYTES;
  if (slot === 'layout') return isImage ? MAX_IMAGE_BYTES : MAX_SOURCE_BYTES;
  return MAX_SOURCE_BYTES;
}

const WORD_NUMS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
};

/** The page count the user explicitly asked for, if any — the LARGEST "N page(s)"
 *  mention in the brief ("two pages of a 16 page bulletin" → 16: the issue size,
 *  not the spread within it). undefined when no usable count is named; the server
 *  only honors 3–16 and ignores anything else, matching its own clamp. */
function parsePageCount(brief: string): number | undefined {
  let best: number | undefined;
  const re =
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen)[-\s]*pages?\b/gi;
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
  const [files, setFiles] = useState<Staged[]>([]); // what to build from, each in its own slot
  const [dragOver, setDragOver] = useState(false);
  const [pubBusy, setPubBusy] = useState<string | null>(null);
  // One picker per slot: they accept different things, and a single input would
  // have to be re-`accept`ed on every click — a race with the dialog it opens.
  const dataRef = useRef<HTMLInputElement>(null);
  const layoutRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<HTMLInputElement>(null);
  // Structurally typed, not `RefObject<…>`: React 18 and 19 disagree about whether
  // that generic includes null, and this record only ever needs `.current`.
  const pickers: Record<Slot, { current: HTMLInputElement | null }> = {
    data: dataRef,
    layout: layoutRef,
    images: imagesRef,
  };
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api
      .listIssues()
      .then(setIssues)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
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
    if (
      !window.confirm(
        `Delete “${it.title}”?${it.publishedIssueId ? ' Its published edition will also be removed from Bulletins.' : ''} This cannot be undone.`,
      )
    )
      return;
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

  // Build with AI → create the issue, then jump straight into the studio. The
  // editor polls and reveals each page as it's composed (no blocking loader).
  const startAI = async () => {
    if (!canGenerate) return;
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
      const filesIn = (slot: Slot) => files.filter((s) => s.slot === slot).map((s) => s.file);
      const imageFiles = filesIn('images');

      // WHAT GETS READ, and what is only looked at.
      //
      // `sourceFiles` are the documents the magazine is WRITTEN from — the data slot,
      // plus any layout PDF marked "+ its text" (the usual case: the client's own last
      // issue). They must go through uploadSourceDoc, because a docId is only citable
      // if it is a row in `sourceDocs`: POST /issues/generate hands docIds to
      // resolveSource → getSourceDoc, which reads that collection ALONE. A media-doc
      // id there resolves to nothing and is skipped in silence — the magazine builds
      // from the brief and nobody is told the document was ignored.
      //
      // And one upload serves both purposes, because `magazineDocument()` checks
      // sourceDocs FIRST: the same id is a citable source AND a layout reference. So a
      // "+ its text" PDF is uploaded once, read once, and matchable — not stored twice.
      const layoutRows = files.filter((s) => s.slot === 'layout');
      // One predicate, used for both halves. Splitting the rows by `File` identity
      // instead would work only for as long as no two chips ever hold the same
      // object, which is not a property this list promises.
      const isLayoutText = (s: Staged) => s.useText !== false && !s.file.type.startsWith('image/');
      const layoutTextFiles = layoutRows.filter(isLayoutText).map((s) => s.file);
      // Layout-only: the reference stays out of `sourceDocs` entirely. §1 of the layout
      // doc — its words are not ours to reprint — and an uncited source row would sit
      // at status 'queued' forever in the reading panel.
      const layoutOnlyFiles = layoutRows.filter((s) => !isLayoutText(s)).map((s) => s.file);
      const docFiles = filesIn('data');
      const sourceFiles = [...docFiles, ...layoutTextFiles];

      if (sourceFiles.length > 0) {
        setStartMsg('Preparing…');
        preparedId = (await api.prepareIssue()).issue.id;
        const failed: string[] = [];
        for (let i = 0; i < sourceFiles.length; i++) {
          const f = sourceFiles[i]!;
          const label = sourceFiles.length > 1 ? ` (${i + 1} of ${sourceFiles.length})` : '';
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
      // LAYOUT-ONLY REFERENCES — the ones whose text we are NOT taking. A
      // "+ its text" PDF is already uploaded above and needs nothing here: its
      // sourceDoc id is a layout reference too (`magazineDocument()` checks that
      // store first), so uploading it again would store the same file twice and
      // give "Match a layout" two rows for one document.
      //
      //   a PDF   → the Uploads library (media kind:'doc'). Still a valid `docId`
      //             for POST /issues/:id/layout-reference, which downloads it and
      //             MEASURES the page — no read, no chunking, no model call. NOT a
      //             sourceDoc: an uploaded-but-never-cited source row would sit at
      //             status 'queued' forever in the reading panel.
      //   a picture → media kind:'reference', which GET /media excludes from the
      //             photo picker — a reference is somebody else's licensed page and
      //             offering it as a photo invites the one thing we never do.
      if (layoutOnlyFiles.length > 0 && issue?.id) {
        setStartMsg('Saving your layout reference…');
        await Promise.all(
          layoutOnlyFiles.map(async (f) => {
            try {
              if (f.type.startsWith('image/')) await api.uploadMediaImage(issue.id, f, f.name, 'reference');
              else await api.uploadMediaDoc(issue.id, f);
            } catch {
              toast.message(`Couldn't save “${f.name}” as a layout reference.`);
            }
          }),
        );
      }
      // ONE message about the layout, covering both kinds, and it is deliberately
      // not a success. Whole-issue matching is not built (P5, second half): the
      // reference is STAGED, not applied, and a magazine that comes out looking
      // nothing like the reference is the complaint this sentence exists to
      // pre-empt. Said once here rather than in each branch above, so the two paths
      // cannot drift into promising different things.
      if (layoutRows.length > 0 && issue?.id) {
        const names = layoutRows.map((s) => `“${s.file.name}”`).join(', ');
        toast.message(
          `${names} is saved as a layout reference, but the AI does not design the whole issue from it yet — open a page in the studio and choose “Match a layout” to apply it.`,
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
      //
      // `sourceFiles`, not `docFiles`: a "+ its text" layout PDF went into the same
      // store by the same route, so leaving it out would hide it from Uploads for no
      // reason a user could name. Safe against showing one document twice —
      // list_documents de-duplicates by name and keeps the sourceDoc row, the copy
      // that knows its page count.
      const UPLOADS_COPY_LIMIT = 25 * 1024 * 1024;
      const copyable = sourceFiles.filter((f) => f.size <= UPLOADS_COPY_LIMIT);
      const tooBigToCopy = sourceFiles.filter((f) => f.size > UPLOADS_COPY_LIMIT);
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

  // Takes a FileList (picker, drop) or a plain array (paste) — the clipboard
  // helper hands back real Files, not a FileList, because it renames some of them.
  //
  // `slot` is given when a named picker was used and omitted for a drop or a
  // paste, where nobody said which of the three they meant; defaultSlotFor keeps
  // those two paths behaving exactly as they did before the buttons existed, and
  // the chip lets the choice be corrected without re-picking the file.
  const addFiles = (list: FileList | File[] | null, slot?: Slot) => {
    const incoming = list ? Array.from(list) : [];
    if (incoming.length === 0) return;
    const room = Math.max(0, MAX_SOURCE_FILES - files.length);
    if (incoming.length > room) toast.message(`Up to ${MAX_SOURCE_FILES} attachments — the rest were skipped.`);

    // Check the size HERE, at the picker. There was no client-side check at all, so
    // an oversized file was uploaded in full and only then refused — the user spent
    // the whole upload to be told the file was too big, and on a slow connection
    // that is minutes of wasted time and bandwidth. The size is known the instant
    // the file is chosen; there is no reason to send a byte of it.
    // The cap is PER SLOT, because the server's is: a picture must clear 15 MB and a
    // document 150 MB. One number for all three meant an oversized photo was refused
    // only after it had finished uploading.
    const chosen = incoming.map((file) => ({ file, slot: slot ?? defaultSlotFor(file) })).slice(0, room);
    const picked = chosen.filter(({ file, slot: s }) => file.size <= maxBytesFor(file, s));
    const oversize = chosen.filter(({ file, slot: s }) => file.size > maxBytesFor(file, s));
    if (oversize.length > 0) {
      // The limit is named per file, not once for the batch — a photo and a PDF
      // refused together are refused for different numbers, and quoting one of them
      // makes the other look like a bug.
      toast.message(
        oversize
          .map(({ file, slot: s }) => `“${file.name}” is over the ${Math.round(maxBytesFor(file, s) / 1024 / 1024)} MB limit.`)
          .join(' '),
      );
    }
    if (picked.length > 0) setFiles((prev) => [...prev, ...picked.map(({ file, slot: s }) => stage(file, s))]);
    setError(null);
    // Clear EVERY picker, not the one that fired: re-choosing the same file into
    // the same input is a no-op change event, so a file removed and picked again
    // would silently not come back.
    for (const s of SLOT_ORDER) if (pickers[s].current) pickers[s].current!.value = '';
  };

  /** Move a staged file to a different slot. The only refusal is the server's own:
   *  a Word or text file has no page design, so it cannot be a layout reference. */
  const reslot = (index: number, slot: Slot) => {
    setFiles((prev) => {
      const row = prev[index];
      if (!row) return prev;
      if (slot === 'layout' && !canBeLayout(row.file)) {
        toast.message('A layout can only be copied from a PDF page or a picture.');
        return prev;
      }
      // Through `stage`, so a move into the layout slot gets the same `useText`
      // default a pick into it would — see the note on that function.
      return prev.map((r, i) => (i === index ? stage(r.file, slot) : r));
    });
  };

  /** Layout PDFs only: write from this document as well as copying its design. */
  const toggleText = (index: number) => {
    setFiles((prev) => prev.map((r, i) => (i === index ? { ...r, useText: r.useText === false } : r)));
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
      startIndex: files.filter((s) => PASTED_IMAGE_NAME.test(s.file.name)).length,
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
      toast.success(
        images === 1 ? 'Image attached from your clipboard.' : `${images} images attached from your clipboard.`,
      );
    }
  };

  /**
   * Generate needs something to WRITE FROM — a brief or a data reference.
   *
   * It used to be `brief || files.length`, which was true before the slots existed
   * because every attachment was a source. Now it is not: a layout to copy and a
   * photo to place are both real attachments that say nothing about what the
   * magazine is about, and pressing Generate with only those reserved an issue,
   * uploaded the file, and then took a 400 from a route that requires a prompt or a
   * docId. The button is disabled instead, and the toolbar names the missing half.
   */
  const hasBrief = !!brief.trim();
  // A layout PDF marked "+ its text" IS something to write from — it becomes a
  // cited docId exactly like a data reference, so it has to count here too or the
  // button stays dead on the one flow this change exists to make work.
  const hasData = files.some(
    (s) => s.slot === 'data' || (s.slot === 'layout' && s.useText !== false && !s.file.type.startsWith('image/')),
  );
  const canGenerate = (hasBrief || hasData) && !starting;
  /** Shown beside the disabled Generate: a layout and a photo are not a SUBJECT,
   *  so say which half is missing rather than leaving a dead button with no reason. */
  const needsSubject = files.length > 0 && !hasBrief && !hasData && !starting;

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

        {/* The one input the whole flow starts from. */}
        <div
          className="mt-6 w-full max-w-3xl rounded-[26px] border border-border/70 bg-card text-left shadow-[0_10px_34px_rgba(0,0,0,0.09)] transition-all duration-200 focus-within:border-brand-accent focus-within:shadow-[0_14px_44px_rgba(212,168,67,0.20)]"
          style={{
            borderColor: dragOver ? ACCENT : undefined,
            boxShadow: dragOver
              ? '0 0 0 3px color-mix(in oklab, hsl(var(--brand-accent)) 26%, transparent)'
              : undefined,
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          // Only when the pointer leaves the COMPOSER, not when it crosses one of
          // its children — dragleave fires on every internal boundary, so the bare
          // version flickered the highlight the whole way across the box. It was
          // survivable while that highlight was a border; now it also swaps a line
          // of text, and a sentence strobing under the cursor is not.
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
          }}
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
            onChange={(e) => {
              setBrief(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void startAI();
            }}
          />

          {/* Staged files, GROUPED BY SLOT. Grouping is what let the chips shrink:
              what a file is for is a property of the group, said once in its
              heading, so five attachments are five short pills under two headings
              rather than five full-width bars each restating their own purpose. */}
          {files.length > 0 && (
            <div className="mx-3.5 mt-2 space-y-2.5">
              {SLOT_ORDER.map((slot) => {
                // Indices into `files`, not a filtered copy: remove and move both
                // address the real position, and re-deriving it from a filtered
                // array is the classic way the wrong row gets deleted.
                const rows = files.map((row, i) => ({ row, i })).filter(({ row }) => row.slot === slot);
                if (rows.length === 0) return null;
                const meta = SLOT_META[slot];
                const Icon = meta.icon;
                return (
                  <div key={slot}>
                    <div className="mb-1 flex items-baseline gap-1.5 text-ui-sm">
                      <Icon size={12} className="translate-y-px" style={{ color: ACCENT_INK }} />
                      <span className="font-semibold" style={{ color: ACCENT_INK }}>
                        {meta.heading}
                      </span>
                      <span className="hidden truncate text-muted-foreground/80 sm:inline">— {meta.note}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {rows.map(({ row, i }) => (
                        <StagedChip
                          key={`${row.file.name}-${i}`}
                          row={row}
                          disabled={starting}
                          onMove={(s) => reslot(i, s)}
                          onToggleText={() => toggleText(i)}
                          onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* toolbar — the three things you can hand the builder, then Generate,
              as one right-aligned group: they are the same act (say what you are
              giving it, then go), and a lone "Attach" on the far left read as an
              afterthought rather than as part of the request.
              The left of the row carries whatever the composer needs to say right
              now, which is where a hint belongs — beside the button it is about,
              rather than as a line under the box that reads as a page caption. */}
          <div className="flex flex-wrap items-center gap-1 px-3.5 pb-3 pt-1">
            {/* Rendered only when there IS something to say. An always-present empty
                paragraph is invisible on a wide screen and a blank reserved line on a
                narrow one, where it wraps to a row of its own. `ml-auto` on the group
                below keeps the buttons right whether or not this is here. */}
            {(dragOver || needsSubject) && (
              <p
                className="min-w-0 basis-full truncate px-1 pb-1 text-ui-sm text-muted-foreground sm:flex-1 sm:basis-0 sm:pb-0"
                aria-live="polite"
              >
                {dragOver
                  ? 'Drop to attach — pictures become photos, documents become data references.'
                  : 'Add a line about the magazine, or a data reference to write from.'}
              </p>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {SLOT_ORDER.map((slot, i) => {
                const meta = SLOT_META[slot];
                const Icon = meta.icon;
                const count = files.filter((s) => s.slot === slot).length;
                return (
                  <Fragment key={slot}>
                    {i > 0 && <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />}
                    <button
                      type="button"
                      onClick={() => pickers[slot].current?.click()}
                      disabled={starting}
                      // A slot holding files reads as FILLED — tinted ground and ink,
                      // not just a coloured icon. The count badge alone was a 12px
                      // difference between "has two photos" and "has none", on the one
                      // control that decides where those photos end up.
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-ui font-medium transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      style={
                        count > 0
                          ? { backgroundColor: ACCENT_WASH, color: ACCENT_INK }
                          : { color: 'hsl(var(--muted-foreground))' }
                      }
                      title={meta.hint}
                      aria-label={count > 0 ? `${meta.label} — ${count} attached` : `Add ${meta.label.toLowerCase()}`}
                    >
                      <Icon size={15} />
                      <span className="hidden sm:inline">{meta.label}</span>
                      {count > 0 && (
                        <span
                          className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-ui-sm font-semibold"
                          style={{
                            backgroundColor: ACCENT,
                            color: 'var(--forest-deep)',
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  </Fragment>
                );
              })}

              <button
                onClick={() => void startAI()}
                disabled={!canGenerate}
                className="ml-1.5 inline-flex items-center gap-1.5 rounded-2xl px-5 py-2.5 text-ui-lg font-semibold shadow-lg shadow-[rgba(212,168,67,0.35)] transition-all hover:-translate-y-px hover:shadow-xl hover:shadow-[rgba(212,168,67,0.45)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
                style={{
                  backgroundImage: 'linear-gradient(135deg, var(--gold-light) 0%, var(--gold-bright) 100%)',
                  backgroundColor: 'var(--gold-bright)',
                  color: 'var(--forest-deep)',
                }}
              >
                <Sparkles size={16} />
                {starting ? <ShimmerText>Starting…</ShimmerText> : 'Generate'}
                {!starting && <ArrowUp size={15} className="opacity-80" />}
              </button>
            </div>
          </div>

          {SLOT_ORDER.map((slot) => (
            <input
              key={slot}
              ref={pickers[slot]}
              type="file"
              accept={SLOT_META[slot].accept}
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files, slot)}
            />
          ))}
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
                  <div
                    key={it.id}
                    className="flex flex-col rounded-lg border border-border p-4 transition-colors hover:border-brand-accent"
                  >
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
                        · {it.pageCount} page{it.pageCount === 1 ? '' : 's'}
                        {it.ownerName ? ` · ${it.ownerName}` : ''}
                      </div>
                      {/* When, on its own quieter line — the line above is what the
                          magazine IS, this is when it happened, and running the two
                          together made a five-clause sentence nobody finished reading.
                          Absolute for the start, relative for the edit; see cardDates. */}
                      {(when.started || when.edited) && (
                        <div className="mt-0.5 text-ui-sm text-muted-foreground/80">
                          {when.started && <span title={when.startedFull || undefined}>Started {when.started}</span>}
                          {when.started && when.edited && ' · '}
                          {when.edited && <span title={when.editedFull || undefined}>Edited {when.edited}</span>}
                        </div>
                      )}
                      {!it.myRole && (
                        <span className="mt-1.5 inline-block rounded bg-muted px-1.5 py-0.5 text-ui-sm font-medium text-muted-foreground">
                          View only
                        </span>
                      )}
                    </button>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
                      {/* Open the studio. Without a role this is read-only, so it's
                          labelled honestly rather than promising an edit. */}
                      <button
                        onClick={() => openEditor(it.id)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-ui-sm font-medium hover:border-brand-accent hover:text-brand-accent-ink"
                        title={
                          it.myRole
                            ? 'Open this magazine in the studio'
                            : 'Open read-only (you do not have edit access)'
                        }
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
                        <a
                          href={`/bulletins/${it.publishedIssueId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto text-ui-sm text-brand-accent-ink hover:underline"
                        >
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
