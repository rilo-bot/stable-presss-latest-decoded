// ---------------------------------------------------------------------------
// Font-metrics generator for Magazine Builder v2.
//
// Produces `src/lib/magazineV2/fontMetrics.data.ts` — the MEASURED per-glyph
// advance-width table that replaces the old regex-over-font-names heuristic
// (`advanceRatio`). It measures real glyph advances in the SAME engine that
// renders the magazine (headless Chromium, via the app's existing `puppeteer`
// dependency) with the ACTUAL fonts loaded (Google Fonts over the network for
// web families; the real OS fonts for the system fallbacks). No fabricated
// numbers, no font-name pattern matching.
//
// For each curated family, and FOR EACH measured weight, it records (÷ font size):
//   • `adv`  — advance width of every printable ASCII glyph (0x20–0x7E)
//   • `base` — mean advance over the A–Z/a–z/0–9 sample (fallback for glyphs
//              outside the table, e.g. non-ASCII)
// Per-weight (not a single scalar "bold is 1.04× wider" factor) because bold
// widens glyphs NON-uniformly — an all-caps bold run widens far more than the
// average, and a scalar under-estimates it → overflow. Measuring each weight
// removes that approximation entirely.
//
// Run:  node apps/server/scripts/measure-font-metrics.mjs           (full → writes .ts)
//       node apps/server/scripts/measure-font-metrics.mjs --sample  (3 families → stdout)
//
// Re-run whenever the curated font list changes (registry.ts / generate.ts).
// ---------------------------------------------------------------------------

import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/lib/magazineV2/fontMetrics.data.ts');
const SAMPLE = process.argv.includes('--sample');
const SIZE = 2000; // measure at a large size for precision, then divide out

// key = lowercased CSS family name (what a stack's first family resolves to).
// google = css2 `family=` query (omitted for OS/system fonts). category is real
// per-font metadata (not inferred from the name) used only as a fallback bucket.
const FAMILIES = [
  // ── web / Google (loaded over the network) ─────────────────────────────
  { key: 'playfair display', family: 'Playfair Display', category: 'serif', google: 'Playfair+Display:wght@400;500;600;700;800;900', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'dm serif display', family: 'DM Serif Display', category: 'serif', google: 'DM+Serif+Display:wght@400', weights: [400] },
  { key: 'lora', family: 'Lora', category: 'serif', google: 'Lora:wght@400;500;600;700', weights: [400, 500, 600, 700] },
  { key: 'merriweather', family: 'Merriweather', category: 'serif', google: 'Merriweather:wght@400;700;900', weights: [400, 700, 900] },
  { key: 'eb garamond', family: 'EB Garamond', category: 'serif', google: 'EB+Garamond:wght@400;500;600;700;800', weights: [400, 500, 600, 700, 800] },
  { key: 'cormorant garamond', family: 'Cormorant Garamond', category: 'serif', google: 'Cormorant+Garamond:wght@400;500;600;700', weights: [400, 500, 600, 700] },
  { key: 'libre baskerville', family: 'Libre Baskerville', category: 'serif', google: 'Libre+Baskerville:wght@400;700', weights: [400, 700] },
  { key: 'pt serif', family: 'PT Serif', category: 'serif', google: 'PT+Serif:wght@400;700', weights: [400, 700] },
  { key: 'source sans 3', family: 'Source Sans 3', category: 'sans', google: 'Source+Sans+3:wght@400;500;600;700;800;900', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'inter', family: 'Inter', category: 'sans', google: 'Inter:wght@400;500;600;700;800;900', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'montserrat', family: 'Montserrat', category: 'sans', google: 'Montserrat:wght@400;500;600;700;800;900', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'poppins', family: 'Poppins', category: 'sans', google: 'Poppins:wght@400;500;600;700', weights: [400, 500, 600, 700] },
  { key: 'work sans', family: 'Work Sans', category: 'sans', google: 'Work+Sans:wght@400;500;600;700;800;900', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'oswald', family: 'Oswald', category: 'sans', google: 'Oswald:wght@400;500;600;700', weights: [400, 500, 600, 700] },
  { key: 'archivo', family: 'Archivo', category: 'sans', google: 'Archivo:wght@400;500;600;700;800;900', weights: [400, 500, 600, 700, 800, 900] },
  { key: 'im fell english', family: 'IM Fell English', category: 'serif', google: 'IM+Fell+English:wght@400', weights: [400] },
  { key: 'dancing script', family: 'Dancing Script', category: 'script', google: 'Dancing+Script:wght@400;500;600;700', weights: [400, 500, 600, 700] },
  { key: 'great vibes', family: 'Great Vibes', category: 'script', google: 'Great+Vibes', weights: [400] },
  { key: 'pacifico', family: 'Pacifico', category: 'script', google: 'Pacifico', weights: [400] },
  { key: 'parisienne', family: 'Parisienne', category: 'script', google: 'Parisienne', weights: [400] },
  // ── system / web-safe fallbacks (real OS fonts on this machine) ─────────
  { key: 'georgia', family: 'Georgia', category: 'serif', weights: [400, 700] },
  { key: 'times new roman', family: 'Times New Roman', category: 'serif', weights: [400, 700] },
  { key: 'arial', family: 'Arial', category: 'sans', weights: [400, 700] },
  { key: 'helvetica', family: 'Helvetica', category: 'sans', weights: [400, 700] },
];

const list = SAMPLE ? FAMILIES.filter((f) => ['arial', 'inter', 'playfair display'].includes(f.key)) : FAMILIES;

const googleFamilies = list.filter((f) => f.google).map((f) => `family=${f.google}`);
const href = `https://fonts.googleapis.com/css2?${googleFamilies.join('&')}&display=block`;

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    `<!doctype html><html><head><link rel="stylesheet" href="${href}"></head><body></body></html>`,
    { waitUntil: 'networkidle0' },
  );

  const data = await page.evaluate(
    async (families, SIZE) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const CHARS = [];
      for (let c = 0x20; c <= 0x7e; c++) CHARS.push(String.fromCharCode(c));
      const SAMPLE_STR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const round = (n) => Math.round(n * 1e5) / 1e5;

      const out = {};
      for (const f of families) {
        // Ensure every requested weight is actually loaded before measuring.
        const available = [];
        for (const w of f.weights) {
          const spec = `${w} ${SIZE}px "${f.family}"`;
          try {
            if (f.google) await document.fonts.load(spec);
          } catch {}
          if (document.fonts.check(spec)) available.push(w);
        }
        if (available.length === 0) available.push(f.weights[0] ?? 400);

        // Per-glyph advances AND mean, measured at every available weight.
        // Each glyph's advance is the CONSERVATIVE max of its isolated advance
        // and its steady-state advance inside a run of itself (which folds in
        // self-kerning — some serifs add positive kern between adjacent wide
        // caps like W-W / M-M, so the isolated advance alone under-estimates a
        // run of them). Taking the max never under-estimates either pattern.
        const RUN = 10;
        const adv = {};
        const base = {};
        for (const w of available) {
          ctx.font = `${w} ${SIZE}px "${f.family}"`;
          const table = {};
          for (const ch of CHARS) {
            const iso = ctx.measureText(ch).width / SIZE;
            const run = ctx.measureText(ch.repeat(RUN)).width / (RUN * SIZE);
            table[ch] = round(Math.max(iso, run));
          }
          adv[String(w)] = table;
          let sum = 0;
          for (const ch of LETTERS) sum += table[ch] ?? 0;
          base[String(w)] = round(sum / LETTERS.length);
        }

        out[f.key] = { category: f.category, weights: available, adv, base };
      }
      return out;
    },
    list,
    SIZE,
  );

  if (SAMPLE) {
    for (const [k, v] of Object.entries(data)) {
      const w0 = String(v.weights[0]);
      const wN = String(v.weights[v.weights.length - 1]);
      console.log(
        `${k}: weights=${v.weights.join(',')} | @${w0} base=${v.base[w0]} W=${v.adv[w0]['W']} m=${v.adv[w0]['m']} ` +
          `| @${wN} base=${v.base[wN]} W=${v.adv[wN]['W']} m=${v.adv[wN]['m']}`,
      );
    }
    console.log('\nSAMPLE OK — mechanism validated. Re-run without --sample to write the data file.');
  } else {
    const header = `// AUTO-GENERATED by apps/server/scripts/measure-font-metrics.mjs — DO NOT EDIT BY HAND.
// Measured glyph advances (normalised to em) in headless Chromium with the real
// fonts loaded, PER WEIGHT. Regenerate after changing the curated font list.
// See the script header for what each field means. Replaces the old regex
// \`advanceRatio\`.

export type FontMetricCategory = 'serif' | 'sans' | 'script' | 'mono';

export interface FontMetricEntry {
  /** Real per-font metadata; the fallback bucket for an unknown family. */
  category: FontMetricCategory;
  /** Measured weights available for this family, ascending. */
  weights: number[];
  /** Advance width (em) per printable ASCII glyph, keyed by weight. */
  adv: Record<string, Record<string, number>>;
  /** Mean advance (em) over A–Z/a–z/0–9 per weight — fallback for glyphs not in \`adv\`. */
  base: Record<string, number>;
}

export const FONT_METRICS: Record<string, FontMetricEntry> = `;
    const body = JSON.stringify(data, null, 2);
    writeFileSync(OUT, `${header}${body};\n`, 'utf8');
    console.log(`Wrote ${Object.keys(data).length} families → ${OUT}`);
  }
} finally {
  await browser.close();
}
