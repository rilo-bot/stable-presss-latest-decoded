// ---------------------------------------------------------------------------
// Magazine Builder v2 — server-safe icon NAME registry.
//
// The element model allows an `icon` element to carry a curated Lucide glyph
// name. The server only needs the ALLOW-LIST of names to validate input; the
// actual glyph components live on the client renderer. This list is the
// server-side mirror of the web editor's curated registry
// (apps/web/src/editor/templates/iconRegistry.ts) and MUST stay in sync with it
// — the client resolves these names to real Lucide/custom components and falls
// back to the FALLBACK glyph for anything unknown.
//
// No lucide-react import here (that pulls thousands of components) — names only,
// so this file is safe to import in the server + worker.
// ---------------------------------------------------------------------------

/** Curated pickable icon names (kept in sync with the web iconRegistry). */
export const ICON_NAMES = [
  // currently used by the premium template
  'Gavel', 'Trophy', 'Star', 'Globe', 'PlayCircle', 'BarChart3', 'Users', 'Sprout', 'Award', 'Mail',
  // social / brand
  'Facebook', 'Instagram', 'Youtube', 'PenTool', 'Feather',
  // people / contact
  'User', 'Phone', 'MapPin', 'MessageCircle', 'AtSign', 'Link', 'ExternalLink', 'Send',
  // achievement / engagement
  'Crown', 'Medal', 'Flag', 'Target', 'Sparkles', 'Zap', 'Heart', 'ThumbsUp', 'Gift', 'Bell', 'Check', 'CheckCircle',
  // media
  'Camera', 'Image', 'Video', 'Music', 'Newspaper', 'BookOpen', 'GraduationCap', 'QrCode', 'Share2',
  // data / business
  'TrendingUp', 'PieChart', 'DollarSign', 'ShoppingBag', 'Briefcase', 'Building2', 'Handshake', 'Scale', 'Calendar', 'Clock', 'Database', 'RefreshCw',
  // nature / racing-adjacent
  'Leaf', 'TreePine', 'Sun', 'Droplet', 'Shield',
  // racing / sport / betting
  'Binoculars', 'Ticket', 'Timer', 'Coins', 'Banknote', 'Carrot', 'Wheat', 'FlagTriangleRight',
  // custom horse-racing glyphs (createLucideIcon on the client)
  'Horse', 'UsersGroup', 'Horseshoe', 'Helmet',
  // universal fallback glyph
  'Shapes',
] as const;

/** Rendered when an icon element has no/unknown name (so render never crashes). */
export const FALLBACK_ICON_NAME = 'Shapes';

const ICON_NAME_SET = new Set<string>(ICON_NAMES);

/** True when `name` is a known registry icon (validates AI/agent/import input). */
export function isKnownIcon(name?: unknown): boolean {
  return typeof name === 'string' && ICON_NAME_SET.has(name);
}
