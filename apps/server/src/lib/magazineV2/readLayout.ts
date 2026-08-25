// ---------------------------------------------------------------------------
// Magazine Builder v2 — READ a reference layout image (P1 of
// docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).
//
// The client uploads a picture of a layout and says "take this layout". This is
// the one vision call in the feature: image in, a LayoutReading out — normalised
// boxes and roles, no pixels, no page yet. Conversion to a frame-tree (P2) is
// deterministic and lives elsewhere, so the model is asked to do exactly one
// thing: describe what it sees, in the vocabulary the DSL already speaks.
//
// THIS IS THE FIRST PLACE IN THE CODEBASE THAT SENDS AN IMAGE TO A MODEL.
// Attached images have only ever reached the agent as URL *text* ("- https://…
// ('cover.jpg')"), which is why it could place a photo but never look at one. The
// image goes by URL: magazine media is world-readable by design (see
// docs/image-upload-system), so there is nothing to sign and no base64 to inflate
// the request with.
//
// Never throws. A failure is a REPORTED failure — the caller has to tell the user
// we could not read their image, not pretend we read something.
// ---------------------------------------------------------------------------

import { generateText } from 'ai';
import { getAgentModel, isAgentConfigured } from '../agent/provider.js';
import { parseJsonObject } from './parseJson.js';
import { normalizeLayoutReading, MAX_REGIONS, MAX_REGION_TEXT, type LayoutReading } from './layoutReading.js';
import { LEAF_ROLES, SPACE_TOKENS, COLOR_REFS } from './layoutSpec.js';

export interface ReadLayoutResult {
  reading: LayoutReading | null;
  /** Why there is no reading. '' when there is one. Shown to the user verbatim. */
  error: string;
}

const SYSTEM = [
  'You are a magazine art director READING a reference layout. You are given ONE image of a page',
  'design (a magazine spread, a screenshot, or a hand sketch). Describe its COMPOSITION as JSON.',
  'Output ONLY the JSON object — no prose, no markdown fences.',
  '',
  'You are NOT designing. Report where things sit and how big they are, relative to the page, and',
  'never describe the photographs\' subjects — only their boxes.',
  '',
  'The client\'s own copy goes in these slots, so you are not transcribing an article. But a SHORT',
  'line tells us what a slot IS in a way its position cannot: "HORIZON" is a masthead, "P. 26" is a',
  'page reference, "TRAVEL" is a tag. Quote those, and say how LONG the text in each region is.',
  '',
  'JSON shape:',
  '{',
  '  "aspect": <number>,            // width / height of the reference',
  '  "background": "light" | "dark" | "photo",',
  // EVERY enum is shown with QUOTED alternatives, and none as a bare <a|b|c> token
  // list. Three fields here used to be written the bare way, and the model mirrored
  // that style straight into its output as an unquoted KEY — `colorRef: "text"` —
  // which is not JSON. Measured on a real cover, 3 of 4 reads came back broken that
  // way, and the user was told we could not make out a layout in an image the model
  // had in fact read correctly. parseJson.ts repairs it now; this stops it happening.
  `  "margin": ${SPACE_TOKENS.map((t) => `"${t}"`).join(' | ')},   // the outer whitespace ring: "none" for a full-bleed design`,
  '  "columns": <1-6>,              // text columns, if the design has an obvious grid',
  '  "regions": [ {',
  '      "role": "<one of the roles listed below>",',
  '      "box": { "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 },   // FRACTIONS of the page, origin top-left',
  '      "z": <number>,             // only when regions overlap: higher sits on top',
  '      "emphasis": "dominant" | "normal" | "quiet",',
  `      "colorRef": ${COLOR_REFS.map((c) => `"${c}"`).join(' | ')},`,
  '      "align": "left" | "center" | "right" | "justify",',
  '      "sizeFrac": <number>,        // TEXT ONLY: cap height of the type as a FRACTION',
  '                                   // of the page height. 0.08 = a line one twelfth tall.',
  '      "color": "#rrggbb",          // TEXT ONLY: the ink this text is actually set in',
  '      "weight": 400|500|600|700|800|900,   // TEXT ONLY: how heavy the face is drawn',
  '      "face": "serif" | "sans",    // TEXT ONLY',
  `      "text": "<verbatim, ONLY if under ${MAX_REGION_TEXT} chars — a masthead, tag, page ref>",`,
  '      "chars": <number>,           // TEXT ONLY: roughly how many characters this region holds',
  '      "note": "<short — anything the fields above cannot say>"',
  '  } ],',
  '  "palette": { "primary": "#rrggbb", "secondary": "#rrggbb", "accent": "#rrggbb" },',
  '  "confidence": 0-1,',
  '  "notes": "<what you could not express>"',
  '}',
  '',
  `role is one of: ${LEAF_ROLES.join(', ')}.`,
  '  • image = a photograph or illustration · shape = a solid/tinted block, rule or scrim',
  '  • headline = the dominant title · kicker = the small tracked tag above it · subhead/deck = the',
  '    supporting line · body = paragraphs of prose · pullquote = an oversized lifted quote',
  '  • caption = small text tied to a photo · byline = the author line · label + figure = a small',
  '    caption under a big number (a stat) · entry = one line of a contents list · qr / icon as named',
  '',
  'RULES THAT MATTER:',
  '• STRICT JSON. EVERY key and EVERY string value is double-quoted — `"colorRef": "text"`,',
  '  never `colorRef: "text"`. No trailing commas, no comments, no single quotes.',
  '• BOXES ARE FRACTIONS, 0 to 1. Never pixels, never percentages as 0-100.',
  '• Report the boxes you can SEE. A full-bleed photo is { x:0, y:0, w:1, h:1 }, not a guess at a',
  '  margin around it.',
  '• Text over a photo means OVERLAPPING regions with z — the photo z:0, the text above it. Do not',
  '  invent a gap that the design does not have.',
  '• Group, do not enumerate: three paragraphs in one column is ONE body region. A caption under each',
  `  of two photos is two captions. Keep the total under ${MAX_REGIONS} regions — merge the small stuff.`,
  '• emphasis is RELATIVE type weight within this page, not a size.',
  '• `chars` MATTERS AS MUCH AS THE BOXES. A design is airy because its text is SHORT, and a box',
  '  cannot say so: a masthead band is wide and holds one word. Count what is actually printed —',
  '  "HORIZON" is 7, a two-line standfirst is about 90, a column of prose is several hundred.',
  '• `text` is for DISPLAY type only: mastheads, tags, page references, kickers, short titles. Never',
  '  transcribe a paragraph — give its `chars` instead and leave `text` out.',
  '• TYPE: sizeFrac / color / weight / face describe the LETTERS in a text region. Measure',
  '  sizeFrac against the WHOLE PAGE height, never the region\'s own box — a short line in a',
  '  tall box is small type, not large. Report `color` only when the ink is clearly not the',
  '  ordinary body colour (a red masthead, white type on a photo); a near-black on white is',
  '  the default and needs no mention. OMIT ANY OF THESE YOU CANNOT ACTUALLY SEE — omitting',
  '  means "this page keeps its own", which is a good answer. A guess is not.',
  '• palette: only if the design has a clear scheme, and only as three hex values. Omit it otherwise.',
  '• confidence: be honest. A blurry photo of a printed page, or a layout you are guessing at, is low.',
].join('\n');

/**
 * Read one reference image into a LayoutReading.
 *
 * `imageUrl` must already have been proven to belong to the magazine by the caller
 * (an assetId → media lookup). Never take a URL from the client and hand it
 * straight to the model: it would spend our model budget on any image on the
 * internet, and make our server the thing that fetched it.
 */
export async function readLayoutImage(imageUrl: string, hint?: string): Promise<ReadLayoutResult> {
  if (!isAgentConfigured()) {
    return { reading: null, error: 'The AI assistant is not configured on this server.' };
  }
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return { reading: null, error: 'That reference image has no usable URL.' };
  }

  try {
    const { text } = await generateText({
      model: getAgentModel(),
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: url },
            {
              type: 'text',
              text: [
                'Read this layout and return ONLY the JSON.',
                hint ? `The client says: ${hint.slice(0, 400)}` : '',
              ].filter(Boolean).join('\n'),
            },
          ],
        },
      ],
      // Low, on purpose. Every other model call in this pipeline wants invention
      // (artDirectPage runs at 0.95); this one is a measurement, and a creative
      // reading of a picture is just a wrong reading.
      temperature: 0.1,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(90_000),
    });
    const reading = normalizeLayoutReading(parseJsonObject(text));
    if (!reading) {
      return {
        reading: null,
        error: 'I could not make out a layout in that image. A flat, straight-on shot of the whole page works best.',
      };
    }
    return { reading, error: '' };
  } catch (err) {
    // Distinguish the two failures the user can act on. Anything else is ours.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[magazineV2] layout read failed: ${msg}`);
    if (/timeout|abort/i.test(msg)) {
      return { reading: null, error: 'Reading that image took too long. Try a smaller or simpler image.' };
    }
    if (/image|media type|unsupported|too large|payload/i.test(msg)) {
      return { reading: null, error: 'That image could not be read by the model. PNG or JPEG under a few MB works best.' };
    }
    return { reading: null, error: 'Reading the layout failed. Please try again.' };
  }
}
