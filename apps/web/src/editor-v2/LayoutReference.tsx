// ---------------------------------------------------------------------------
// Magazine Builder v2 — "take this layout" (P1–P3 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).
//
// Upload a picture of a layout; the AI reads its COMPOSITION, this shows what it
// understood drawn over the reference itself, it rebuilds the page in that structure,
// and then it reports HOW CLOSE it actually got.
//
// The two honesty mechanisms are the point of the panel. Showing the reading first is
// not a debug view — it is the moment the user can tell whether we understood their
// reference before the page is rearranged. And the verdict afterwards is MEASURED
// (IoU, read box vs solved box), never asserted, so "matched" means something.
//
// The rebuild REPLACES every element on the page and the undo stack does not cover
// that, so it is the one action in this panel that asks first.
// ---------------------------------------------------------------------------

import { useRef, useState } from 'react';
import { PdfPagePicker } from './PdfPagePicker';
import { Upload, AlertTriangle, ScanLine, Wand2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useEditorStore } from './store';
import { ShimmerText } from './BuildProgress';
import * as api from './api';
import type { LayoutReading } from './api';

/** Roles that carry a picture rather than words — outlined differently, because
 *  "where do the photos go" is the first question anyone asks of a layout. */
const PICTORIAL = new Set(['image', 'shape', 'icon', 'qr']);

/** The measured verdict, in the studio's semantic colours: amber = needs attention,
 *  emerald = done. Neutral for "adapted", which is a normal outcome and not a fault. */
const VERDICT_TONE: Record<string, string> = {
  matched: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  adapted: 'border-studio-edge bg-studio-raise text-studio-ink-2',
  loose: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
};
const VERDICT_WORD: Record<string, string> = {
  matched: 'Matched', adapted: 'Adapted', loose: 'Loose interpretation',
};

/** How sure the model was, in words. A number alone invites the user to trust 0.4. */
function confidenceLabel(c: number): { text: string; tone: string } {
  if (c >= 0.75) return { text: 'Read clearly', tone: 'text-emerald-200' };
  if (c >= 0.5) return { text: 'Read with some guesswork', tone: 'text-studio-ink-2' };
  return { text: 'Barely legible — a flatter, straight-on shot would read better', tone: 'text-amber-200' };
}

/**
 * `url` is EMPTY for a PDF reference, and that is not a missing value to guard —
 * there is no picture, because nothing was photographed. The regions are drawn on
 * the page's own aspect instead, which is exactly as informative: they are the
 * measurement, not an annotation of an image.
 */
function Preview({ url, reading }: { url: string; reading: LayoutReading }) {
  return (
    <div className="relative w-full overflow-hidden rounded-sm border border-studio-edge bg-studio-bg">
      {url
        ? <img src={url} alt="The uploaded layout reference" className="block w-full" />
        : <div className="w-full" style={{ aspectRatio: String(reading.aspect || 0.707) }} />}
      {/* The read regions, over the reference. Absolute % boxes — the reading is
          normalised, so this needs no measuring and no resize handling. */}
      <div className="absolute inset-0">
        {reading.regions.map((r, i) => (
          <div
            key={i}
            className="absolute flex items-start justify-start"
            style={{
              left: `${r.box.x * 100}%`,
              top: `${r.box.y * 100}%`,
              width: `${r.box.w * 100}%`,
              height: `${r.box.h * 100}%`,
              outline: `1.5px ${PICTORIAL.has(r.role) ? 'dashed' : 'solid'} var(--studio-select)`,
              outlineOffset: '-1.5px',
              // The wash token, not a color-mix: it exists for exactly this, and it
              // needs no @supports guard to stay visible.
              background: 'var(--studio-select-wash)',
            }}
          >
            <span
              className="m-0.5 rounded-sm px-1 text-ui-sm leading-tight tabular-nums"
              style={{ background: 'var(--studio-select)', color: 'var(--studio-bg)' }}
            >
              {i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LayoutReference() {
  const issueId = useEditorStore((s) => s.issueId);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const layoutBusy = useEditorStore((s) => s.layoutBusy);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<{ url: string; reading: LayoutReading; warning: string } | null>(null);
  const [fidelity, setFidelity] = useState<api.LayoutFidelity | null>(null);
  /**
   * EXACT BY DEFAULT: pointing at a reference and pressing the button means "make this
   * page look like that one", so the default has to be the mode that reproduces it.
   *
   * 'adapt' stays offered rather than removed — it is the right answer for a reference
   * of a different shape, or a page whose copy far outruns what the reference held, and
   * those are real jobs. It is just no longer the silent default it was.
   */
  const [fit, setFit] = useState<api.LayoutFit>('exact');

  /**
   * The confirm lives in `store.applyLayout`, NOT here.
   *
   * It used to be in this component, which meant the CHAT path — the assistant staging
   * `apply-layout` from "make this page look like the image" — rebuilt the page with no
   * confirmation at all, while a comment in the store claimed the confirm was shared
   * between both ways in. One irreversible action, one place that asks.
   */
  const apply = async (reading: LayoutReading) => {
    const measured = await useEditorStore.getState().applyLayout(reading, undefined, fit);
    // The reading STAYS on success, with its measured result beside it. Two reasons:
    // the user can see how close it came while looking at the page it produced, and
    // the same reference can then be applied to the next page — which is the whole of
    // P4's value arriving for free.
    if (measured) setFidelity(measured);
  };

  const onPick = async (file: File | undefined) => {
    if (!file || !issueId || busy) return;
    setBusy(true);
    setShot(null);
    setFidelity(null);
    try {
      // Stored as 'reference', which keeps it out of the photo picker: we read this
      // page's structure, we never place its pixels.
      const asset = await api.uploadMediaImage(issueId, file, `Layout reference — ${file.name}`, 'reference');
      const { reading, warning } = await api.readLayoutReference(issueId, {
        assetId: asset.id,
        pageId: currentPageId ?? undefined,
      });
      setShot({ url: asset.url, reading, warning });
    } catch (e) {
      // The server's 422 sentence is the useful one ("a flat, straight-on shot works
      // best"), so show it rather than a generic failure.
      toast.error(e instanceof Error ? e.message : 'Could not read that layout');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /**
   * Read a layout from an attached PDF page — MEASURED, not estimated.
   *
   * The distinction is worth the extra control. A picture is read by a vision model
   * and every number in it is a guess; a PDF states where its words and pictures
   * are, so the same endpoint returns a reading with nothing inferred but the roles.
   * The panel was images-only, so the better of the two paths was unreachable from
   * here even though the server had supported it all along.
   */
  const readPdf = async (docId: string, pageNo: number) => {
    if (!issueId || busy) return;
    setBusy(true);
    setShot(null);
    setFidelity(null);
    try {
      const { reading, warning } = await api.readLayoutReference(issueId, {
        docId,
        pageNo,
        pageId: currentPageId ?? undefined,
      });
      // No url: there is no picture of a measured page. Preview draws the regions on
      // the reading's own aspect instead.
      setShot({ url: '', reading, warning });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read that page’s layout');
    } finally {
      setBusy(false);
    }
  };

  const conf = shot ? confidenceLabel(shot.reading.confidence) : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ui-sm leading-relaxed text-studio-ink-3">
        Take a page's <b className="text-studio-ink-2">arrangement</b> — where things sit and how big they are.
        Your own words and photos fill it; nothing is copied from the reference.
      </p>

      {/* THE MEASURED PATH FIRST, because it is the better one and was the hidden one.
          A PDF states its own geometry; a picture has to be guessed at. */}
      <PdfPagePicker
        disabled={busy}
        actionLabel={busy ? 'Reading…' : 'Measure it'}
        emptyNote="Attach a PDF to measure a page's layout exactly. A picture works too — see below."
        onRead={(docId, pageNo) => void readPdf(docId, pageNo)}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy || !issueId}
        className="flex items-center justify-center gap-1.5 rounded-sm border border-studio-edge bg-studio-raise px-2 py-1.5 text-ui-sm text-studio-ink-2 hover:bg-studio-raise-2 disabled:opacity-40"
      >
        {busy ? <><ScanLine size={13} /> <ShimmerText>Reading the layout…</ShimmerText></> : <><Upload size={13} /> Or upload a picture</>}
      </button>
      {/* Says which of the two the user is choosing, because the difference is not a
          matter of degree: a PDF is measured, a picture is estimated by a vision
          model. Someone comparing a 97% result with a 29% one deserves to know that
          the gap was decided before either ran. */}
      <p className="text-ui-sm text-studio-ink-4">
        A PDF page is <b className="text-studio-ink-3">measured</b> — the file says where everything is.
        A picture is <b className="text-studio-ink-3">estimated</b> from what the AI can see in it, so it comes out close rather than exact.
      </p>

      {shot && (
        <>
          <Preview url={shot.url} reading={shot.reading} />

          {shot.warning && (
            <p className="flex items-start gap-1.5 rounded-sm border border-amber-400/25 bg-amber-400/10 px-2 py-1.5 text-ui-sm text-amber-200">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{shot.warning}</span>
            </p>
          )}

          <p className={'text-ui-sm ' + conf!.tone}>
            {conf!.text} · {Math.round(shot.reading.confidence * 100)}%
          </p>

          <ol className="flex flex-col gap-0.5">
            {shot.reading.regions.map((r, i) => (
              <li key={i} className="flex items-baseline gap-1.5 text-ui-sm text-studio-ink-2">
                <span className="w-4 flex-shrink-0 text-right tabular-nums text-studio-ink-4">{i + 1}</span>
                <span className="text-studio-ink">{r.role}</span>
                <span className="text-studio-ink-4 tabular-nums">
                  {Math.round(r.box.w * 100)}×{Math.round(r.box.h * 100)}%
                </span>
                {r.emphasis === 'dominant' && <span className="text-studio-ink-3">· dominant</span>}
                {r.note && <span className="truncate text-studio-ink-4" title={r.note}>· {r.note}</span>}
              </li>
            ))}
          </ol>

          <p className="text-ui-sm text-studio-ink-4">
            {shot.reading.columns ? `${shot.reading.columns}-column grid · ` : ''}
            {shot.reading.margin} margin · {shot.reading.background} ground
          </p>

          {shot.reading.palette && (
            <div className="flex items-center gap-1.5 text-ui-sm text-studio-ink-4">
              <span>Its colours</span>
              {[shot.reading.palette.primary, shot.reading.palette.secondary, shot.reading.palette.accent].map((c) => (
                <span key={c} className="h-3 w-3 rounded-sm border border-studio-edge" style={{ background: c }} title={c} />
              ))}
              {/* Says what HAPPENS, not what could. This used to read "kept out of your
                  palette unless you ask" — and there is no way to ask: nothing anywhere
                  applies a reference's palette. Offering a capability that does not
                  exist is worse than not reading the colours at all. */}
              <span>· not used — this page keeps its own colours</span>
            </div>
          )}

          {shot.reading.notes && (
            <p className="border-l-2 border-studio-edge pl-2 text-ui-sm italic text-studio-ink-3">{shot.reading.notes}</p>
          )}

          {/* WHICH JOB THIS IS. The two modes lose different things, and until now the
              user was silently given the adapting one — which re-partitions the page
              around any slot it cannot fill. */}
          <div className="flex flex-col gap-1">
            {([
              { v: 'exact' as const, label: 'Copy the layout exactly', hint: 'Every box where the reference had it. An empty box stays empty.' },
              { v: 'adapt' as const, label: 'Adapt it to my content', hint: 'Re-composes to fit this page. Empty boxes close up and the rest grow.' },
            ]).map((o) => (
              <label
                key={o.v}
                className={
                  'flex cursor-pointer items-start gap-2 rounded-sm border px-2 py-1.5 text-ui-sm ' +
                  (fit === o.v ? 'border-[var(--gold-bright)]/60 bg-studio-raise-2 text-studio-ink' : 'border-studio-edge text-studio-ink-2 hover:bg-studio-raise')
                }
              >
                <input
                  type="radio"
                  name="layout-fit"
                  checked={fit === o.v}
                  disabled={layoutBusy}
                  onChange={() => setFit(o.v)}
                  className="mt-0.5 accent-studio-gold"
                />
                <span>
                  {o.label}
                  <span className="block text-studio-ink-4">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <button
            onClick={() => void apply(shot.reading)}
            disabled={layoutBusy}
            className="flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-ui-sm font-semibold text-studio-bg disabled:opacity-50"
            style={{ background: 'var(--gold-bright)' }}
          >
            {layoutBusy
              ? <ShimmerText>Rebuilding the page…</ShimmerText>
              : <><Wand2 size={13} /> {fidelity ? 'Use this layout on this page too' : 'Put this page in that layout'}</>}
          </button>

          {/* The MEASURED result (P3), not a claim. This is the only place in the
              builder where something checks its own output, so it gets said plainly. */}
          {fidelity && (
            <div className={'rounded-sm border px-2 py-1.5 text-ui-sm ' + VERDICT_TONE[fidelity.verdict]}>
              <div className="flex items-center gap-1.5">
                {fidelity.verdict === 'matched' ? <Check size={12} className="flex-shrink-0" /> : <AlertTriangle size={12} className="flex-shrink-0" />}
                <span className="font-semibold">{VERDICT_WORD[fidelity.verdict]}</span>
                <span className="ml-auto tabular-nums">{Math.round(fidelity.score * 100)}%</span>
              </div>
              <p className="mt-0.5">{fidelity.summary}</p>
            </div>
          )}

          {/* Says what the SELECTED mode does. It used to state flatly that the page was
              matched "rather than cloning the page exactly" — true of adapt, and the only
              mode reachable at the time, but the opposite of what exact does. */}
          <p className="text-ui-sm text-studio-ink-4">
            The page is cleared and rebuilt in the reference's design — fresh words are written for your
            magazine and your own photos are placed where it wants pictures.
            It <b className="text-studio-ink-3">replaces this page's arrangement and cannot be undone</b>.
            {fit === 'exact'
              ? ' Boxes land where the reference had them; one with nothing to fill it is left empty.'
              : ' The composition is matched rather than cloned — boxes shift to suit what this page holds.'}
          </p>
        </>
      )}
    </div>
  );
}
