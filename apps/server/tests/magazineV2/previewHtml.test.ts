// ---------------------------------------------------------------------------
// previewHtml — the Visual Critic's proof is the page as the reader sees it.
//
// The serialiser must follow the web canvas (IssuePageCanvas.tsx + geometry.ts) rule
// for rule, or the critic judges a different page from the one that ships. Pure: no
// browser, no network. The real render (Chromium) was checked by hand against the
// NZ fixture; these pin the rules.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  pageToPreviewHtml,
  previewSize,
  previewSrc,
  safeCssBackground,
  stripActiveHtml,
  googleFontLinks,
  PREVIEW_ASSET_ORIGIN,
  type PreviewPage,
} from '../../src/lib/magazineV2/previewHtml.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function el(partial: Partial<MagazineElement> & Pick<MagazineElement, 'type'>): MagazineElement {
  return { id: Math.random().toString(36).slice(2), x: 0, y: 0, w: 100, h: 100, rotation: 0, zIndex: 0, locked: false, source: 'ai-agent', ...partial };
}

const SAMPLE: PreviewPage = {
  width: 1240,
  height: 1754,
  background: { type: 'color', value: '#f4f1ea' },
  elements: [
    el({
      type: 'text',
      x: 124,
      y: 175.4,
      w: 620,
      h: 200,
      zIndex: 3,
      text: {
        content: 'Racing, <strong>Recast</strong>',
        role: 'headline',
        fontFamily: 'Playfair Display, Georgia, serif',
        fontSize: 124,
        fontWeight: 800,
        color: '#12161f',
        align: 'left',
        lineHeight: 1.05,
        autoFit: 'shrink',
        vAlign: 'bottom',
        letterSpacing: 12.4,
        textTransform: 'uppercase',
      },
    }),
    el({
      type: 'image',
      x: 0,
      y: 0,
      w: 1240,
      h: 877,
      zIndex: 0,
      image: { assetId: 'a1', url: 'https://bucket.example/public/x.jpg', alt: 'horse', fit: 'cover', focalPoint: { x: 0.25, y: 0.75 } },
    }),
    el({ type: 'shape', x: 0, y: 600, w: 1240, h: 277, zIndex: 1, shape: { fill: '#0b1f3a', opacity: 0.5 } }),
  ],
};

test('previewSize keeps the page aspect at the proof width', () => {
  assert.deepEqual(previewSize(1240, 1754), { width: 620, height: 877 });
  assert.deepEqual(previewSize(1275, 1650, 510), { width: 510, height: 660 });
  // A page with no dims yet still gets a sane box (the canvas guards the same way).
  assert.equal(previewSize(0, 0).width, 620);
});

test('the page box is a cqw container of exactly the proof size', () => {
  const html = pageToPreviewHtml(SAMPLE, { webFonts: false });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /id="page" style="position:relative;overflow:hidden;width:620px;height:877px;container-type:inline-size/);
});

test('element boxes are % of the canonical page and type lengths are cqw — as geometry.ts does', () => {
  const html = pageToPreviewHtml(SAMPLE, { webFonts: false });
  // x 124/1240 = 10%, y 175.4/1754 = 10%, w 620/1240 = 50%
  assert.match(html, /left:10%;top:10%;width:50%/);
  // fontSize 124px on a 1240 page = 10cqw; letterSpacing 12.4 = 1cqw
  assert.match(html, /font-size:10cqw/);
  assert.match(html, /letter-spacing:1cqw/);
  assert.match(html, /text-transform:uppercase/);
  // vAlign bottom → flex-end, generated copy wraps and clips
  assert.match(html, /justify-content:flex-end/);
  assert.match(html, /white-space:pre-wrap/);
  // Font stacks keep their quotes safely inside the double-quoted attribute.
  assert.match(html, /font-family:Playfair Display, Georgia, serif/);
});

test('elements paint in zIndex order (image, then scrim, then text)', () => {
  const html = pageToPreviewHtml(SAMPLE, { webFonts: false });
  const img = html.indexOf('<img src="https://bucket.example/public/x.jpg"');
  const scrim = html.indexOf('background:#0b1f3a');
  const text = html.indexOf('Racing, <strong>Recast</strong>');
  assert.ok(img > 0 && scrim > img && text > scrim, `order was img ${img}, scrim ${scrim}, text ${text}`);
});

test('images keep their fit and focal point; shapes keep their scrim opacity', () => {
  const html = pageToPreviewHtml(SAMPLE, { webFonts: false });
  assert.match(html, /object-fit:cover;object-position:25% 75%/);
  assert.match(html, /background:#0b1f3a;opacity:0.5/);
});

test('extracted text keeps its own line breaks and may spill, like the canvas', () => {
  const page: PreviewPage = {
    ...SAMPLE,
    elements: [
      el({
        type: 'text',
        source: 'extracted',
        text: { content: 'A\nB', role: 'body', fontFamily: 'Arial', fontSize: 20, fontWeight: 400, color: '#000000', align: 'left', lineHeight: 1.2, autoFit: 'clip' },
      }),
    ],
  };
  const html = pageToPreviewHtml(page, { webFonts: false });
  assert.match(html, /overflow:visible/);
  assert.match(html, /white-space:pre(;|")/);
});

test('a gradient page background is painted, an unsafe one is not', () => {
  assert.equal(safeCssBackground('linear-gradient(135deg, #283a52 0%, #0B1F3A 45%, #09182d 100%)'), 'linear-gradient(135deg, #283a52 0%, #0B1F3A 45%, #09182d 100%)');
  assert.equal(safeCssBackground('#ABCDEF'), '#ABCDEF');
  assert.equal(safeCssBackground('url(https://evil.example/x.png)'), '#ffffff');
  assert.equal(safeCssBackground('red;position:fixed'), '#ffffff');
  assert.equal(safeCssBackground(undefined), '#ffffff');
});

test('image sources: absolute and data pass, relative proxy URLs are anchored, scripts are dropped', () => {
  assert.equal(previewSrc('https://x.example/a.jpg'), 'https://x.example/a.jpg');
  assert.equal(previewSrc('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(previewSrc('/api/uploads/file/public/m/1.jpg'), `${PREVIEW_ASSET_ORIGIN}/api/uploads/file/public/m/1.jpg`);
  assert.equal(previewSrc('javascript:alert(1)'), '');
  assert.equal(previewSrc('//evil.example/x.jpg'), '');
  assert.equal(previewSrc(''), '');
});

test('active HTML in copy is stripped (defence in depth; the write path already sanitises)', () => {
  const out = stripActiveHtml('Hi <script>alert(1)</script><b onclick="x()">there</b><iframe src="x"></iframe><a href="javascript:void(0)">l</a>');
  assert.doesNotMatch(out, /script|alert|onclick|iframe|javascript:/i);
  assert.match(out, /<b>there<\/b>/);
});

test('web fonts: one link per non-system family, known weights only', () => {
  const links = googleFontLinks([
    ...SAMPLE.elements,
    el({ type: 'text', text: { content: 'x', role: 'body', fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 20, fontWeight: 400, color: '#000000', align: 'left', lineHeight: 1.3, autoFit: 'shrink' } }),
    el({ type: 'text', text: { content: 'y', role: 'body', fontFamily: 'Oswald, Arial, sans-serif', fontSize: 20, fontWeight: 700, color: '#000000', align: 'left', lineHeight: 1.3, autoFit: 'shrink' } }),
    el({ type: 'text', text: { content: 'z', role: 'body', fontFamily: "'Libre Caslon Text', serif", fontSize: 20, fontWeight: 400, color: '#000000', align: 'left', lineHeight: 1.3, autoFit: 'shrink' } }),
  ]);
  assert.deepEqual(links, [
    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&display=swap',
    'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap',
    // Unknown to us: requested at its default weight, so Google cannot reject the link.
    'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text&display=swap',
  ]);
  assert.match(pageToPreviewHtml(SAMPLE), /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Playfair\+Display/);
});

test('every NZ fixture page serialises, with one block per renderable element', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'nz-racing-scene.json'), 'utf8')) as { pages: PreviewPage[] };
  for (const page of fixture.pages) {
    const html = pageToPreviewHtml(page, { webFonts: false });
    const renderable = page.elements.filter((e) => e.type !== 'image' || e.image?.url).length;
    // Each element opens with an absolutely positioned box.
    const boxes = html.match(/style="position:absolute;left:/g)?.length ?? 0;
    assert.equal(boxes, renderable, `page ${page.width}x${page.height}`);
  }
});
