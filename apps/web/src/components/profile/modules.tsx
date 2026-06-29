/**
 * Shared profile constants + the data-module switch used by every profile
 * surface (party/horse · view/edit). Previously this switch + the role/category
 * config were copy-pasted into PartyDetail, PartyStudio and HorseDetail; this is
 * the single source of truth.
 */
import {
  User, Briefcase, Flag, BookOpen, Shield, Users, Contact,
  Camera, TrendingUp, ShoppingCart, Heart, Wand, Binary,
} from 'lucide-react';
import type { PartyRole } from '@/types/party';
import type { ProfileScope } from '@/hooks/useProfileScope';
import type { DataCategoryDef, DataCardImgKey } from '@/components/profile/kit';
import {
  MediaSection, RacingSection, SalesSection, ReportsSection,
  PedigreeSection, StudBookSection, BreedingSection,
} from '@/components/profile/sections';

/* Role → fallback-image key (vestigial — partyPhoto ignores it, kept for call shape). */
export const ROLE_IMG_KEY: Record<PartyRole, string> = {
  owner: 'owner', trainer: 'trainer', jockey: 'jockey', breeder: 'breeder',
  'bloodstock agent': 'personnel', 'syndicate manager': 'syndicate', personnel: 'personnel',
};

/* Icon per role for the left-rail connection tiles. */
export const ROLE_ICON: Record<PartyRole, React.ReactNode> = {
  owner: <User size={12} strokeWidth={1.8} />,
  trainer: <Briefcase size={12} strokeWidth={1.8} />,
  jockey: <Flag size={12} strokeWidth={1.8} />,
  breeder: <BookOpen size={12} strokeWidth={1.8} />,
  'bloodstock agent': <Contact size={12} strokeWidth={1.8} />,
  'syndicate manager': <Shield size={12} strokeWidth={1.8} />,
  personnel: <Users size={12} strokeWidth={1.8} />,
};

/* Order related-role tiles appear in the left rail. */
export const REL_ORDER: PartyRole[] = [
  'owner', 'trainer', 'jockey', 'breeder', 'syndicate manager', 'bloodstock agent', 'personnel',
];

/* Right-rail data categories. */
/* Order mirrors the reference right rail: Media → Racing → Breeding → Sales →
   Pedigree → Stud Book (Token Data is intentionally omitted). */
export const DATA_CATEGORIES: DataCategoryDef[] = [
  { key: 'media',    label: 'Media Data',     sublabel: 'Photos, video & press',      icon: <Camera       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'media' },
  { key: 'racing',   label: 'Racing Data',    sublabel: 'Entries, results & form',    icon: <TrendingUp   size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'racing' },
  { key: 'breeding', label: 'Breeding Data',  sublabel: 'Foaling & paddock history',  icon: <Heart        size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'breeding' },
  { key: 'sales',    label: 'Sales Data',     sublabel: 'Auction & transfer history', icon: <ShoppingCart size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'sales' },
  { key: 'pedigree', label: 'Pedigree Data',  sublabel: 'Bloodlines & family tree',   icon: <Wand         size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'pedigree' },
  { key: 'studbook', label: 'Stud Book Data', sublabel: 'Official registry entries',  icon: <Binary       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'studbook' },
];

export type { DataCardImgKey };

/** Human label for the open module (used in breadcrumbs). */
export function activeModuleLabel(key: string | null): string | null {
  if (!key) return null;
  if (key === 'reports') return 'Reports / Forms';
  return DATA_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

interface RenderModuleOpts {
  scope: ProfileScope;
  subjectName: string;
  /** Appended to subjectName for pedigree/studbook/breeding (e.g. "· Trainer"). */
  roleLabel?: string;
  onClose: () => void;
  onOpenHorse: (id: string) => void;
}

/** Render the active data-module section. Shared by all profile surfaces. */
export function renderProfileModule(key: string | null, opts: RenderModuleOpts): React.ReactNode {
  if (!key) return null;
  const { scope, subjectName, roleLabel, onClose, onOpenHorse } = opts;
  const name = roleLabel ? `${subjectName} · ${roleLabel}` : subjectName;
  switch (key) {
    case 'media':    return <MediaSection horseIds={scope.horseIds} subjectName={subjectName} onClose={onClose} onOpenHorse={onOpenHorse} />;
    case 'racing':   return <RacingSection horseIds={scope.horseIds} horses={scope.horses} subjectName={subjectName} onClose={onClose} onOpenHorse={onOpenHorse} />;
    case 'sales':    return <SalesSection horseIds={scope.horseIds} subjectName={subjectName} onClose={onClose} onOpenHorse={onOpenHorse} />;
    case 'reports':  return <ReportsSection horseIds={scope.horseIds} subjectName={subjectName} onClose={onClose} onOpenHorse={onOpenHorse} />;
    case 'pedigree': return <PedigreeSection horses={scope.horses} subjectName={name} onClose={onClose} onOpenHorse={onOpenHorse} />;
    case 'studbook': return <StudBookSection horses={scope.horses} subjectName={name} onClose={onClose} onOpenHorse={onOpenHorse} />;
    case 'breeding': return <BreedingSection horses={scope.horses} subjectName={name} onClose={onClose} onOpenHorse={onOpenHorse} />;
    default: return null;
  }
}
