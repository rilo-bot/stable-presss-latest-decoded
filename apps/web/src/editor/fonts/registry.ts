/**
 * Curated font registry for the magazine editor.
 *
 * TextStyle.fontFamily stores a stable FontId; `resolveFontStack(id)` maps it to
 * a CSS font-family value at render time (so we can retune a stack later without
 * rewriting saved documents). The inspector groups these Modern / Classic /
 * Script and previews each option in its own face.
 *
 * Fonts already loaded by the app (Playfair Display, Source Sans 3, IM Fell
 * English) carry `alreadyLoaded: true` and are NOT re-requested.
 */

export type FontCategory = 'modern' | 'classic' | 'script';

export interface FontDef {
  id: string;
  label: string;
  category: FontCategory;
  /** CSS font-family value. */
  stack: string;
  /** Google Fonts `family=` spec, e.g. "Lora:ital,wght@0,400;0,700;1,400". */
  googleSpec?: string;
  alreadyLoaded?: boolean;
}

export const FONT_REGISTRY: FontDef[] = [
  // ── Classic / serif ───────────────────────────────────────────────
  {
    id: 'playfair',
    label: 'Playfair Display',
    category: 'classic',
    stack: "'Playfair Display', Georgia, serif",
    // The app's base stylesheet loads Playfair 400–700 upright only, but the
    // bulletin house style uses weight 800 (display headlines / stat figures) and
    // italic (pull quotes). Request those faces here so the editor AND the public
    // viewer render them for real instead of faux-bold/italic.
    googleSpec: 'Playfair+Display:ital,wght@0,700;0,800;0,900;1,400;1,500;1,600;1,700',
  },
  {
    id: 'im-fell',
    label: 'IM Fell English',
    category: 'classic',
    stack: "'IM Fell English', 'Palatino Linotype', serif",
    alreadyLoaded: true,
  },
  {
    id: 'lora',
    label: 'Lora',
    category: 'classic',
    stack: "'Lora', Georgia, serif",
    googleSpec: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    category: 'classic',
    stack: "'Merriweather', Georgia, serif",
    googleSpec: 'Merriweather:ital,wght@0,400;0,700;0,900;1,400',
  },
  {
    id: 'eb-garamond',
    label: 'EB Garamond',
    category: 'classic',
    stack: "'EB Garamond', Garamond, serif",
    googleSpec: 'EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'cormorant',
    label: 'Cormorant Garamond',
    category: 'classic',
    stack: "'Cormorant Garamond', Garamond, serif",
    googleSpec: 'Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'libre-baskerville',
    label: 'Libre Baskerville',
    category: 'classic',
    stack: "'Libre Baskerville', Baskerville, serif",
    googleSpec: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400',
  },
  {
    id: 'pt-serif',
    label: 'PT Serif',
    category: 'classic',
    stack: "'PT Serif', Georgia, serif",
    googleSpec: 'PT+Serif:ital,wght@0,400;0,700;1,400',
  },

  // ── Modern / sans ─────────────────────────────────────────────────
  {
    id: 'source-sans',
    label: 'Source Sans 3',
    category: 'modern',
    stack: "'Source Sans 3', system-ui, sans-serif",
    alreadyLoaded: true,
  },
  {
    id: 'inter',
    label: 'Inter',
    category: 'modern',
    stack: "'Inter', system-ui, sans-serif",
    googleSpec: 'Inter:wght@400;500;600;700;800',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    category: 'modern',
    stack: "'Montserrat', system-ui, sans-serif",
    googleSpec: 'Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  },
  {
    id: 'poppins',
    label: 'Poppins',
    category: 'modern',
    stack: "'Poppins', system-ui, sans-serif",
    googleSpec: 'Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    category: 'modern',
    stack: "'Work Sans', system-ui, sans-serif",
    googleSpec: 'Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'oswald',
    label: 'Oswald',
    category: 'modern',
    stack: "'Oswald', 'Arial Narrow', sans-serif",
    googleSpec: 'Oswald:wght@400;500;600;700',
  },
  {
    id: 'archivo',
    label: 'Archivo',
    category: 'modern',
    stack: "'Archivo', system-ui, sans-serif",
    googleSpec: 'Archivo:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  },

  // ── Script / display ──────────────────────────────────────────────
  {
    id: 'dancing-script',
    label: 'Dancing Script',
    category: 'script',
    stack: "'Dancing Script', cursive",
    googleSpec: 'Dancing+Script:wght@400;500;600;700',
  },
  {
    id: 'great-vibes',
    label: 'Great Vibes',
    category: 'script',
    stack: "'Great Vibes', cursive",
    googleSpec: 'Great+Vibes',
  },
  {
    id: 'pacifico',
    label: 'Pacifico',
    category: 'script',
    stack: "'Pacifico', cursive",
    googleSpec: 'Pacifico',
  },
  {
    id: 'parisienne',
    label: 'Parisienne',
    category: 'script',
    stack: "'Parisienne', cursive",
    googleSpec: 'Parisienne',
  },
];

const BY_ID = new Map(FONT_REGISTRY.map((f) => [f.id, f]));

/** Map a stored FontId to a CSS font-family value (falls back to body serif). */
export function resolveFontStack(id: string | undefined): string {
  if (!id) return "'Source Sans 3', system-ui, sans-serif";
  return BY_ID.get(id)?.stack ?? id; // allow a raw stack to pass through
}

export function getFontDef(id: string): FontDef | undefined {
  return BY_ID.get(id);
}

export const FONTS_BY_CATEGORY: Record<FontCategory, FontDef[]> = {
  modern: FONT_REGISTRY.filter((f) => f.category === 'modern'),
  classic: FONT_REGISTRY.filter((f) => f.category === 'classic'),
  script: FONT_REGISTRY.filter((f) => f.category === 'script'),
};

/** Combined Google Fonts stylesheet href for every font that needs loading. */
export function buildGoogleFontsHref(): string {
  const families = FONT_REGISTRY.filter((f) => f.googleSpec)
    .map((f) => `family=${f.googleSpec}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
