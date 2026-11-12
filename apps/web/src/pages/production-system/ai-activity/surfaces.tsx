/**
 * AI Activity — what each AI surface is called on the page.
 *
 * The ids mirror AI_SURFACES in apps/server/src/lib/agent/aiUsage.ts. A surface
 * the server knows and this list does not still renders (under its id), so the
 * two can drift without the page breaking — but keep them in step.
 */
import type { ReactNode } from 'react';
import {
  Bot, CircleDashed, FileSearch, Layers, MessageCircle, Mic, Newspaper, PenLine,
  SquarePen, Sunrise, UserRound, Wand2, Zap,
} from 'lucide-react';

export type SurfaceId =
  | 'stable-hand'
  | 'magazine-builder'
  | 'story-ai'
  | 'article-ai'
  | 'blog-ai'
  | 'profile-ai'
  | 'concierge'
  | 'compose'
  | 'newsroom'
  | 'instant'
  | 'documents'
  | 'voice'
  | 'other';

export interface SurfaceMeta {
  id: SurfaceId;
  label: string;
  /** One line on the card: what this AI does. */
  blurb: string;
  icon: ReactNode;
  /** Core surfaces always get a card; the rest only once they have been used. */
  core: boolean;
}

/** Page order: the three the newsroom asks about most first, then the studios. */
export const SURFACES: SurfaceMeta[] = [
  { id: 'stable-hand', label: 'The Stable Hand', blurb: 'The in-app assistant that acts for staff', icon: <Bot size={16} />, core: true },
  { id: 'magazine-builder', label: 'Magazine Builder', blurb: 'Issue generation, studio chat, Fill / Adjust and imports', icon: <Layers size={16} />, core: true },
  { id: 'story-ai', label: 'Story AI', blurb: 'Story Studio — drafts and files stories', icon: <Newspaper size={16} />, core: true },
  { id: 'article-ai', label: 'Article AI', blurb: 'Article Studio — edits the open article', icon: <SquarePen size={16} />, core: true },
  { id: 'blog-ai', label: 'Blog AI', blurb: 'Blog Studio — writes and revises posts', icon: <PenLine size={16} />, core: true },
  { id: 'profile-ai', label: 'Profile AI', blurb: 'Horse and profile studio assistant', icon: <UserRound size={16} />, core: true },
  { id: 'concierge', label: 'Site chat', blurb: 'The public site’s chat assistant', icon: <MessageCircle size={16} />, core: true },
  { id: 'compose', label: 'Compose', blurb: 'The AI write-this-field buttons on forms', icon: <Wand2 size={16} />, core: true },
  { id: 'newsroom', label: 'Newsroom brief', blurb: 'The daily brief on Overview', icon: <Sunrise size={16} />, core: true },
  { id: 'instant', label: 'Instant Capture', blurb: 'Photos and voice notes into a draft', icon: <Zap size={16} />, core: true },
  { id: 'documents', label: 'Documents', blurb: 'Reading uploaded PDFs, Word files and images', icon: <FileSearch size={16} />, core: false },
  { id: 'voice', label: 'Voice', blurb: 'Speech to text and read-aloud', icon: <Mic size={16} />, core: false },
  { id: 'other', label: 'Other', blurb: 'AI calls not tied to a surface', icon: <CircleDashed size={16} />, core: false },
];

const BY_ID = new Map(SURFACES.map((s) => [s.id as string, s]));

export function surfaceMeta(id: string): SurfaceMeta {
  return BY_ID.get(id) ?? { id: id as SurfaceId, label: id, blurb: '', icon: <CircleDashed size={16} />, core: false };
}

export const isSurfaceId = (v: string | undefined): v is SurfaceId => !!v && BY_ID.has(v);

/** Friendly names for the step labels the meter records (`feature`). */
const FEATURE_LABELS: Record<string, string> = {
  // Magazine Builder roles (lib/agent/provider.ts → MagazineRole)
  planner: 'Creative Director',
  copy: 'Copywriter',
  layout: 'Art Director',
  critic: 'Visual Critic',
  photo: 'Photo Director',
  editor: 'Editor-in-Chief',
  studio: 'Studio chat',
  format: 'Fill / Adjust',
  reader: 'Layout reader',
  refill: 'Reference fill',
  import: 'PDF/Word import',
  'image-generation': 'Image generation',
  // Worker jobs (apps/worker/src/jobUsage.ts) — only for calls with no role label
  'generate-issue': 'Issue generation',
  'generate-pages': 'Add pages',
  // Documents
  'document-read': 'Document reading',
  'pdf-ocr': 'PDF text recognition (OCR)',
  // Voice
  'speech-to-text': 'Speech to text',
  'read-aloud': 'Read aloud',
  // Newsroom / Instant
  'daily-brief': 'Daily brief',
  'photo-notes': 'Photo notes',
  'story-draft': 'Story draft',
  'blog-draft': 'Blog draft',
  // Compose — the form the field is on
  article: 'Article form',
  horse: 'Horse form',
  'blog-post': 'Blog post form',
  'media-item': 'Media record form',
  record: 'Profile field',
};

/** A feature key as people say it; '' is the surface's own chat or call. */
export function featureLabel(key: string, surface?: string): string {
  if (!key) {
    if (surface === 'stable-hand') return 'Run step';
    if (surface === 'concierge' || surface?.endsWith('-ai')) return 'Chat';
    return 'General';
  }
  const known = FEATURE_LABELS[key];
  if (known) return known;
  const words = key.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Text", "Image", "Speech", "Transcription" — the kind of call. */
export function kindLabel(kind: string): string {
  return kind === 'image' ? 'Image' : kind === 'speech' ? 'Speech' : kind === 'transcription' ? 'Transcription' : 'Text';
}
