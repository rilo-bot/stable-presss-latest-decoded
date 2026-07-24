// ---------------------------------------------------------------------------
// Magazine Builder v2 — the pixel-accurate, read-only page renderer.
//
// A v2 page's layout is free-form (absolute-positioned elements in the page's
// OWN canonical width/height), so this is NOT the v1 region/template renderer.
// The SAME component renders the editor host (Phase 3), the public bulletin, and
// the PDF (Phase 8) — one geometry, three consumers, so they can never drift.
//
// Responsive scaling uses CSS container queries (no JS resize math): the wrapper
// is `container-type: inline-size`, element positions are % of the page dims,
// and font-size is `cqw` (a % of the container's inline size). Resize the
// container and every element scales together with zero re-measure.
// ---------------------------------------------------------------------------

import type { CSSProperties } from 'react';
import { sanitizeRichText } from '@/editor/lib/sanitize';
import { resolveIcon } from '@/editor/templates/iconRegistry';
import type { IssuePageData, MagazineElement } from './model';
import { pctRect, fontSizeCqw } from './geometry';
import { QrBlock } from './QrBlock';

function elementBoxStyle(el: MagazineElement, page: IssuePageData): CSSProperties {
  return {
    position: 'absolute',
    ...pctRect(el, page),
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    zIndex: el.zIndex,
    overflow: 'hidden',
  };
}

function TextElement({ el, page }: { el: MagazineElement; page: IssuePageData }) {
  if (!el.text) return null;
  // EXTRACTED text keeps the source PDF's exact per-line breaks (the extractor
  // measured each box to fit), so it must NOT re-wrap — "pre" + visible overflow
  // lets a web-font substitute spill a few px rather than re-break a masthead.
  // GENERATED/MANUAL copy is authored to flow into its box, so it wraps + clips.
  const extracted = el.source === 'extracted';
  const vAlign = el.text.vAlign ?? 'top';
  const box: CSSProperties = {
    ...elementBoxStyle(el, page),
    overflow: extracted ? 'visible' : 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: vAlign === 'center' ? 'center' : vAlign === 'bottom' ? 'flex-end' : 'flex-start',
  };
  const textStyle: CSSProperties = {
    width: '100%',
    fontFamily: el.text.fontFamily,
    fontWeight: el.text.fontWeight,
    color: el.text.color,
    textAlign: el.text.align,
    lineHeight: el.text.lineHeight,
    fontSize: fontSizeCqw(el.text.fontSize, page.width),
    whiteSpace: extracted ? 'pre' : 'pre-wrap',
    overflowWrap: extracted ? undefined : 'break-word',
  };
  // Content is sanitised server-side on every write; we re-sanitise on render as
  // defense-in-depth (same trust model as the v1 read-only views).
  return (
    <div style={box} data-role={el.text.role}>
      <div style={textStyle} dangerouslySetInnerHTML={{ __html: sanitizeRichText(el.text.content) }} />
    </div>
  );
}

function ShapeElement({ el, page }: { el: MagazineElement; page: IssuePageData }) {
  if (!el.shape) return null;
  // opacity < 1 → a translucent scrim: the photo beneath shows through while the
  // overlaid text stays legible (instead of a solid block hiding the picture).
  return <div style={{ ...elementBoxStyle(el, page), background: el.shape.fill, opacity: el.shape.opacity ?? 1 }} />;
}

function QrElement({ el, page }: { el: MagazineElement; page: IssuePageData }) {
  if (!el.qr) return null;
  return (
    <div style={elementBoxStyle(el, page)}>
      <QrBlock qr={el.qr} linkInNewTab />
    </div>
  );
}

function IconElement({ el, page }: { el: MagazineElement; page: IssuePageData }) {
  if (!el.icon) return null;
  const wrap: CSSProperties = {
    ...elementBoxStyle(el, page),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: el.icon.color || '#111111',
  };
  // An uploaded custom glyph renders as an image; otherwise resolve the curated
  // registry name to its Lucide component (same registry the v1 editor uses), so
  // AI-authored icon leaves (feature rows, contact/CTA badges) actually draw.
  if (el.icon.src) {
    return (
      <div style={wrap}>
        <img src={el.icon.src} alt="" className="h-full w-full" style={{ objectFit: 'contain' }} />
      </div>
    );
  }
  const Glyph = resolveIcon(el.icon.name);
  return (
    <div style={wrap}>
      <Glyph style={{ width: '100%', height: '100%' }} strokeWidth={1.6} absoluteStrokeWidth />
    </div>
  );
}

function ImageElement({ el, page }: { el: MagazineElement; page: IssuePageData }) {
  if (!el.image?.url) return null;
  return (
    <div style={elementBoxStyle(el, page)}>
      <img
        src={el.image.url}
        alt={el.image.alt}
        className="h-full w-full"
        style={{
          objectFit: el.image.fit,
          objectPosition: el.image.focalPoint
            ? `${el.image.focalPoint.x * 100}% ${el.image.focalPoint.y * 100}%`
            : undefined,
        }}
      />
    </div>
  );
}

/** Render one page read-only, faithfully scaled to whatever width it's given.
 *  `hideElementId` omits a single element — used by the editor while that element
 *  is being edited in place (an overlay draws it instead), so the two never
 *  double up. Public viewer / PDF never pass it, so their output is unchanged. */
export function IssuePageCanvas({ page, hideElementId }: { page: IssuePageData; hideElementId?: string }) {
  const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
  // Aspect box via padding-bottom (a % of WIDTH), NOT `aspect-ratio`: a ratio box
  // nested under a `container-type: inline-size` flex item collapses to 0 height
  // in several browsers (main-size resolved before the ratio-derived height),
  // which blanks the whole page. padding-bottom resolves against the container
  // width directly, so height is always correct. This element is BOTH the query
  // container (for cqw text) and the positioning context for the elements. pageW
  // guards a not-yet-extracted page (width 0) against divide-by-zero.
  const pageW = page.width > 0 ? page.width : 1;
  const pageH = page.height > 0 ? page.height : Math.round(pageW * 1.414);
  return (
    <div
      data-magazine-page={page.index}
      className="relative w-full overflow-hidden bg-white shadow-sm"
      style={{ containerType: 'inline-size', paddingBottom: `${(pageH / pageW) * 100}%` }}
    >
      {page.background.type === 'image' && page.background.value ? (
        <img src={page.background.value} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: page.background.value || '#ffffff' }} />
      )}
      {sorted.map((el) =>
        el.id === hideElementId ? null :
        el.type === 'image' ? (
          <ImageElement key={el.id} el={el} page={page} />
        ) : el.type === 'text' ? (
          <TextElement key={el.id} el={el} page={page} />
        ) : el.type === 'shape' ? (
          <ShapeElement key={el.id} el={el} page={page} />
        ) : el.type === 'qr' ? (
          <QrElement key={el.id} el={el} page={page} />
        ) : el.type === 'icon' ? (
          <IconElement key={el.id} el={el} page={page} />
        ) : null,
      )}
    </div>
  );
}

/** A vertical stack of pages (public viewer / preview). */
export function IssueCanvas({ pages }: { pages: IssuePageData[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      {pages.map((page) => (
        <IssuePageCanvas key={page.index} page={page} />
      ))}
    </div>
  );
}
