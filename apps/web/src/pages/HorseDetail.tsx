import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useArticleStore } from '@/stores/articleStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useMediaStore } from '@/stores/mediaStore';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import { isCurrentLink } from '@/types/horsePartyLink';
import { useSaleStore } from '@/stores/saleStore';
import { useReportStore } from '@/stores/reportStore';
import { useAuthStore } from '@/stores/authStore';
import type { Party } from '@/types/party';
import type { Horse } from '@/types/horse';
import type { MediaType } from '@/types/mediaItem';
import type { RaceStatus } from '@/types/racingEntry';
import type { ReportVisibility } from '@/types/horseReport';
import { PedigreeGrid } from '@/components/PedigreeGrid';
import { FollowButton } from '@/components/FollowButton';
import { DossierMeter } from '@/components/DossierMeter';
import { AskAgentButton } from '@/components/AskAgentButton';
import {
  ChevronRight, ChevronDown, Camera, BookOpen, Trophy, Star, Newspaper,
  Heart, Flag, User, Users, Briefcase, Shield, FileText, Wand,
  TrendingUp, ShoppingCart, Binary, X, Image, DollarSign, BookMarked, Hash,
  MapPin, UserCheck, Building2, Dumbbell, Contact, SidebarOpen, Plus, Edit,
  Trash, Link as LinkIcon, ExternalLink, Info, Lock,
} from 'lucide-react';

/* ─── Fallback panel images (used ONLY when a party has no uploaded photo) ─── */
const FALLBACK_IMAGES: Record<string, string> = {
  owner:       'https://images.pexels.com/photos/1059180/pexels-photo-1059180.jpeg?auto=compress&cs=tinysrgb&h=130',
  breeder:     'https://images.pexels.com/photos/28469948/pexels-photo-28469948.jpeg?auto=compress&cs=tinysrgb&h=130',
  trainer:     'https://images.pexels.com/photos/29930438/pexels-photo-29930438.jpeg?auto=compress&cs=tinysrgb&h=130',
  personnel:   'https://images.pexels.com/photos/14132978/pexels-photo-14132978.jpeg?auto=compress&cs=tinysrgb&h=130',
  jockey:      'https://images.pexels.com/photos/1559386/pexels-photo-1559386.jpeg?auto=compress&cs=tinysrgb&h=130',
  syndicate:   'https://images.pexels.com/photos/20157010/pexels-photo-20157010.jpeg?auto=compress&cs=tinysrgb&h=130',
};

const DATA_CARD_IMAGES: Record<string, string> = {
  media:    'https://images.pexels.com/photos/28825866/pexels-photo-28825866.jpeg?auto=compress&cs=tinysrgb&h=350',
  racing:   'https://images.pexels.com/photos/34942801/pexels-photo-34942801.jpeg?auto=compress&cs=tinysrgb&h=350',
  breeding: 'https://images.pexels.com/photos/5454159/pexels-photo-5454159.jpeg?auto=compress&cs=tinysrgb&h=350',
  sales:    'https://images.pexels.com/photos/6640385/pexels-photo-6640385.jpeg?auto=compress&cs=tinysrgb&h=350',
  pedigree: 'https://images.pexels.com/photos/34042427/pexels-photo-34042427.jpeg?auto=compress&cs=tinysrgb&h=350',
  studbook: 'https://images.pexels.com/photos/35098073/pexels-photo-35098073.jpeg?auto=compress&cs=tinysrgb&h=350',
};

const HERO_IMAGE = 'https://images.pexels.com/photos/11341116/pexels-photo-11341116.jpeg?auto=compress&cs=tinysrgb&h=1300&w=940';

const serifStyle: React.CSSProperties = { fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif" };
const goldStyle: React.CSSProperties = { color: 'var(--gold-bright)', textShadow: '0 1px 3px rgba(0,0,0,0.7)' };

interface DataRow { label: string; value: string; }

type HorseData = Horse & {
  jockeyDisplay: string; trainerDisplay: string; ownerDisplay: string;
  breederDisplay: string; syndicateManagerDisplay: string;
  bloodstockAgentDisplay: string; horseBreakersDisplay: string; personnelDisplay: string;
};

/* Resolved party for a panel slot */
interface PanelParty {
  party: Party;
  startDate?: string;
  endDate?: string | null;
  context?: string;
  isCurrent: boolean;
}

type ActivePanelKey =
  | 'left_owner' | 'left_breeder' | 'left_trainer' | 'left_personnel'
  | 'left_jockey' | 'left_syndicate'
  | 'media' | 'racing' | 'breeding' | 'sales' | 'pedigree' | 'studbook';

/** Which party IDs are "active" given the current left-panel selection */
interface PartyContext {
  primaryParty: PanelParty | null;
  allParties: PanelParty[];
  partyIds: string[];
  roleLabel: string;
  isPartyContext: boolean;
}

function partyPhoto(party: Party | undefined, roleKey: string): string {
  if (party?.photo) return party.photo;
  return FALLBACK_IMAGES[roleKey] ?? FALLBACK_IMAGES['owner'];
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtYear(iso?: string | null): string {
  if (!iso) return '—';
  try { return String(new Date(iso).getFullYear()); } catch { return iso; }
}

function mergePanelParties(linked: PanelParty[], direct: PanelParty[]): PanelParty[] {
  const seen = new Set(linked.map((pp) => pp.party.id));
  const extra = direct.filter((pp) => !seen.has(pp.party.id));
  return [...linked, ...extra].sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
}

/* ── Party Context Banner — shown at the top of right-side sections ── */
function PartyContextBanner({ partyContext, onClear }: { partyContext: PartyContext; onClear: () => void }) {
  if (!partyContext.isPartyContext || !partyContext.primaryParty) return null;
  const party = partyContext.primaryParty.party;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
      background: 'linear-gradient(90deg, rgba(180,140,30,0.18) 0%, rgba(26,51,34,0.5) 100%)',
      border: '1px solid var(--gold-mid)', borderRadius: 3, marginBottom: 10, flexWrap: 'wrap',
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0 }}>
        <img src={partyPhoto(party, partyContext.roleLabel.toLowerCase())} alt={party.name} crossOrigin="anonymous"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', ...serifStyle }}>
          Showing {partyContext.roleLabel} data for
        </div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--parchment)', ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {party.name}
        </div>
      </div>
      <button onClick={onClear} aria-label="Clear party filter — show horse data"
        style={{ width: 20, height: 20, borderRadius: 2, border: '1px solid var(--gold-dark)', background: 'rgba(26,51,34,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <X size={10} style={{ color: 'var(--gold-bright)' }} />
      </button>
    </div>
  );
}

interface DataPanelProps {
  title: string; icon: React.ReactNode; rows: DataRow[]; badge?: string;
  defaultOpen?: boolean;
  imgSrc: string;
  primaryName: string; secondaryLine: string; panelKey: string;
  activePanel: string | null; onPanelClick: (key: string) => void;
}

function DataPanel({ title, icon, rows, badge, defaultOpen = false, imgSrc, primaryName, secondaryLine, panelKey, activePanel, onPanelClick }: DataPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isHighlighted = activePanel === panelKey;
  return (
    <div style={{ border: `2px solid ${isHighlighted ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', boxShadow: isHighlighted ? '0 0 0 1px var(--gold-bright), 0 4px 16px rgba(180,140,30,0.35)' : '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.45)', ...serifStyle, transition: 'border-color 0.18s, box-shadow 0.18s' }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: open ? 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-mid) 100%)' : 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', boxShadow: '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', padding: '7px 10px', gap: 7, transition: 'background 0.15s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--gold-bright)', display: 'flex', alignItems: 'center' }}>{icon}</span>
          <span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)', textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {badge && <span style={{ background: 'var(--gold-mid)', color: 'var(--forest-deep)', fontSize: '0.5rem', fontWeight: 700, padding: '1px 5px', borderRadius: 2 }}>{badge}</span>}
          <ChevronDown size={13} style={{ color: 'var(--gold-mid)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease', flexShrink: 0 }} />
        </div>
      </button>
      {!open && (
        <button onClick={() => onPanelClick(panelKey)} aria-pressed={isHighlighted} aria-label={`${isHighlighted ? 'Close' : 'View'} ${title} in detail`} style={{ width: '100%', background: isHighlighted ? 'linear-gradient(90deg, var(--forest-light) 0%, var(--forest-mid) 100%)' : 'var(--parchment)', backgroundImage: isHighlighted ? undefined : 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(0,0,0,0.022) 20px, rgba(0,0,0,0.022) 21px)', boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.15)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, border: 'none', cursor: 'pointer', transition: 'background 0.18s' }}>
          <div style={{ width: 44, height: 44, borderRadius: 3, border: `2px solid ${isHighlighted ? 'var(--gold-bright)' : 'var(--gold-mid)'}`, boxShadow: '0 2px 6px rgba(0,0,0,0.35)', overflow: 'hidden', flexShrink: 0, background: 'var(--forest-deep)', transition: 'border-color 0.18s' }}>
            <img src={imgSrc} alt={primaryName} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isHighlighted ? 'var(--parchment)' : 'var(--forest-deep)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...serifStyle, transition: 'color 0.18s' }}>{primaryName}</div>
            <div style={{ fontSize: '0.6rem', color: isHighlighted ? 'var(--gold-bright)' : 'var(--forest-mid)', fontStyle: 'italic', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...serifStyle, transition: 'color 0.18s' }}>{secondaryLine}</div>
            <div style={{ fontSize: '0.56rem', color: isHighlighted ? 'var(--gold-mid)' : 'var(--parchment-shadow)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.1em', transition: 'color 0.18s' }}>{isHighlighted ? 'Shown in centre ·' : ''} {rows.length} record{rows.length !== 1 ? 's' : ''} on file</div>
          </div>
          <div style={{ width: 22, height: 22, borderRadius: 2, flexShrink: 0, background: isHighlighted ? 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold-mid) 100%)' : 'linear-gradient(135deg, var(--gold-mid) 0%, var(--gold-dark) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', transition: 'background 0.18s' }}>
            {isHighlighted ? <X size={10} strokeWidth={2.5} style={{ color: 'var(--forest-deep)' }} /> : <ChevronRight size={12} strokeWidth={2.5} style={{ color: 'var(--forest-deep)' }} />}
          </div>
        </button>
      )}
      {open && (
        <div style={{ background: 'var(--parchment)', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 18px, rgba(0,0,0,0.022) 18px, rgba(0,0,0,0.022) 19px)', boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.15)' }}>
          <button onClick={() => onPanelClick(panelKey)} aria-pressed={isHighlighted} aria-label={`${isHighlighted ? 'Close' : 'Show'} ${title} in detail view`} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px 10px', background: isHighlighted ? 'linear-gradient(90deg, var(--forest-light) 0%, var(--forest-mid) 100%)' : 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.18s', borderBottom: '1px solid var(--parchment-dark)' }}>
            <div style={{ width: 56, height: 56, borderRadius: 3, border: `2px solid ${isHighlighted ? 'var(--gold-bright)' : 'var(--gold-mid)'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,224,154,0.15)', overflow: 'hidden', flexShrink: 0, background: 'var(--forest-deep)', position: 'relative', transition: 'border-color 0.18s' }}>
              <img src={imgSrc} alt={primaryName} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 8px rgba(0,0,0,0.35)', pointerEvents: 'none', borderRadius: 2 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: isHighlighted ? 'var(--parchment)' : 'var(--forest-deep)', lineHeight: 1.2, ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.18s' }}>{primaryName}</div>
              <div style={{ fontSize: '0.62rem', color: isHighlighted ? 'var(--gold-bright)' : 'var(--forest-mid)', fontStyle: 'italic', marginTop: 2, ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.18s' }}>{secondaryLine}</div>
              <div style={{ marginTop: 5, height: 2, width: 28, borderRadius: 1, background: 'var(--gold-mid)' }} />
            </div>
            <div style={{ width: 22, height: 22, borderRadius: 2, flexShrink: 0, background: isHighlighted ? 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold-mid) 100%)' : 'linear-gradient(135deg, var(--gold-mid) 0%, var(--gold-dark) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', transition: 'background 0.18s' }}>
              {isHighlighted ? <X size={10} strokeWidth={2.5} style={{ color: 'var(--forest-deep)' }} /> : <ChevronRight size={12} strokeWidth={2.5} style={{ color: 'var(--forest-deep)' }} />}
            </div>
          </button>
          <div style={{ padding: '10px 11px 11px' }}>
            {rows.length === 0 ? (
              <p style={{ fontSize: '0.68rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', textAlign: 'center', padding: '4px 0' }}>No records on file.</p>
            ) : (
              <dl style={{ margin: 0, padding: 0 }}>
                {rows.map(({ label, value }, i) => (
                  <div key={label + i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: i < rows.length - 1 ? '1px solid var(--parchment-shadow)' : undefined, paddingBottom: 5, marginBottom: 5, gap: 8 }}>
                    <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, flexShrink: 0 }}>{label}</dt>
                    <dd style={{ fontSize: '0.68rem', color: 'var(--forest-deep)', fontWeight: 600, textAlign: 'right', margin: 0 }}>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrnateCrest({ name, subtitle, partyName }: { name: string; subtitle: string; partyName?: string }) {
  return (
    <div className="sku-crest" style={{ padding: '18px 20px 14px', textAlign: 'center', position: 'relative' }}>
      <span style={{ position: 'absolute', top: 8, left: 12, color: 'var(--gold-mid)', fontSize: '0.7rem', ...serifStyle }}>✦</span>
      <span style={{ position: 'absolute', top: 8, right: 12, color: 'var(--gold-mid)', fontSize: '0.7rem', ...serifStyle }}>✦</span>
      <div className="sku-divider" style={{ marginBottom: 10 }} />
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--gold-mid)', boxShadow: '0 0 0 1px var(--gold-dark), inset 0 1px 0 rgba(255,224,154,0.2), 0 3px 10px rgba(0,0,0,0.5)', background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)', marginBottom: 8 }}>
        <Star size={22} style={{ color: 'var(--gold-bright)' }} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: '0.55rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-mid)', textShadow: '0 1px 3px rgba(0,0,0,0.8)', marginBottom: 4, ...serifStyle }}>Stable Press · Thoroughbred Profile</div>
      <h1 style={{ fontSize: 'clamp(1.2rem, 3vw, 1.7rem)', fontWeight: 700, lineHeight: 1.15, color: 'var(--parchment)', textShadow: '0 2px 6px rgba(0,0,0,0.8)', margin: '4px 0', ...serifStyle }}>{name}</h1>
      {partyName && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '6px 0 2px' }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, var(--gold-dark))' }} />
            <span style={{ fontSize: '0.48rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-dark)', ...serifStyle }}>·</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--gold-dark), transparent)' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(1.05rem, 2.5vw, 1.45rem)', fontWeight: 700, lineHeight: 1.2, color: 'var(--gold-bright)', textShadow: '0 2px 8px rgba(0,0,0,0.85)', margin: '2px 0 4px', ...serifStyle }}>{partyName}</h2>
        </>
      )}
      <div style={{ fontSize: '0.65rem', fontStyle: 'italic', color: partyName ? 'var(--gold-mid)' : 'var(--gold-bright)', textShadow: '0 1px 3px rgba(0,0,0,0.7)', ...serifStyle, marginBottom: 10 }}>{subtitle}</div>
      <div className="sku-divider" />
      <span style={{ position: 'absolute', bottom: 8, left: 12, color: 'var(--gold-mid)', fontSize: '0.7rem', ...serifStyle }}>✦</span>
      <span style={{ position: 'absolute', bottom: 8, right: 12, color: 'var(--gold-mid)', fontSize: '0.7rem', ...serifStyle }}>✦</span>
    </div>
  );
}

function PedCell({ name, label, strong }: { name?: string; label: string; strong?: boolean }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '3px 8px', border: '1px solid var(--gold-dark)', borderRadius: 2, background: name ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.015)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}>
      <span style={{ fontSize: '0.46rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, ...serifStyle }}>{label}</span>
      <span style={{ fontSize: strong ? '0.72rem' : '0.6rem', fontWeight: strong ? 700 : 600, color: name ? 'var(--forest-deep)' : 'var(--parchment-shadow)', fontStyle: name ? 'normal' : 'italic', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...serifStyle }}>{name || '—'}</span>
    </div>
  );
}

function ConnectionsPanel({ horse }: { horse: HorseData }) {
  const pairs = [
    { label: 'Owner', value: horse.ownerDisplay },
    { label: 'Trainer', value: horse.trainerDisplay },
    { label: 'Jockey', value: horse.jockeyDisplay },
    { label: 'Breeder', value: horse.breederDisplay },
    { label: 'Syndicate Mgr', value: horse.syndicateManagerDisplay },
    { label: 'Bloodstock Agent', value: horse.bloodstockAgentDisplay },
    { label: 'Horse Breaker', value: horse.horseBreakersDisplay },
    { label: 'Personnel', value: horse.personnelDisplay },
    { label: 'Colour', value: horse.colour },
    { label: 'Country', value: horse.country },
  ].filter((p) => p.value);
  return (
    <div className="sku-gold-card" style={{ ...serifStyle }}>
      <div className="sku-green-header" style={{ padding: '7px 12px' }}>
        <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Connections &amp; Details</span>
      </div>
      <div className="sku-parchment" style={{ padding: '10px 12px 12px' }}>
        {pairs.length === 0 ? (
          <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', textAlign: 'center' }}>No connections recorded.</p>
        ) : pairs.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--parchment-shadow)', paddingBottom: 5, marginBottom: 5 }}>
            <dt style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700 }}>{label}</dt>
            <dd style={{ fontSize: '0.72rem', color: 'var(--forest-deep)', fontWeight: 600, textAlign: 'right', maxWidth: '62%', margin: 0 }}>{value}</dd>
          </div>
        ))}
      </div>
    </div>
  );
}

function PedigreePanel({ horse }: { horse: { pedigreeNotes?: string; pullQuote?: string; sire?: string; sireSire?: string; sireDam?: string; dam?: string; damYob?: number; damSire?: string; damDam?: string } }) {
  const hasFamilyTree = horse.sire || horse.dam || horse.sireSire || horse.sireDam || horse.damSire || horse.damDam;
  return (
    <div className="sku-gold-card" style={{ ...serifStyle }}>
      <div className="sku-green-header" style={{ padding: '7px 12px' }}>
        <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Pedigree &amp; Bloodlines</span>
      </div>
      <div className="sku-parchment" style={{ padding: '12px' }}>
        {horse.pullQuote && <blockquote style={{ borderLeft: '3px solid var(--gold-mid)', paddingLeft: 10, marginBottom: 12, fontStyle: 'italic', fontSize: '0.78rem', color: 'var(--forest-deep)', lineHeight: 1.5 }}>"{horse.pullQuote}"</blockquote>}
        {hasFamilyTree && (
          <div style={{ marginBottom: horse.pedigreeNotes ? 12 : 0 }}>
            <p style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--parchment-shadow)', fontWeight: 700, marginBottom: 8 }}>Family Tree</p>
            {(horse.sire || horse.sireSire || horse.sireDam) && (
              <div style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, padding: '8px 10px', marginBottom: 6 }}>
                <p style={{ fontSize: '0.56rem', color: 'var(--parchment-shadow)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 5 }}>Sire (Father)</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)' }}>Sire</span><span style={{ fontSize: '0.72rem', color: 'var(--forest-deep)', fontWeight: 700 }}>{horse.sire || '—'}</span></div>
                {(horse.sireSire || horse.sireDam) && (
                  <div style={{ paddingLeft: 10, borderLeft: '2px solid var(--gold-dark)', marginTop: 4 }}>
                    {horse.sireSire && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: '0.54rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Sire's Sire</span><span style={{ fontSize: '0.64rem', color: 'var(--forest-mid)', fontWeight: 600 }}>{horse.sireSire}</span></div>}
                    {horse.sireDam && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.54rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Sire's Dam</span><span style={{ fontSize: '0.64rem', color: 'var(--forest-mid)', fontWeight: 600 }}>{horse.sireDam}</span></div>}
                  </div>
                )}
              </div>
            )}
            {(horse.dam || horse.damSire || horse.damDam || horse.damYob) && (
              <div style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, padding: '8px 10px' }}>
                <p style={{ fontSize: '0.56rem', color: 'var(--parchment-shadow)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 5 }}>Dam (Mother)</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: horse.damYob ? 3 : 0 }}><span style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)' }}>Dam</span><span style={{ fontSize: '0.72rem', color: 'var(--forest-deep)', fontWeight: 700 }}>{horse.dam || '—'}</span></div>
                {horse.damYob && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)' }}>Dam YOB</span><span style={{ fontSize: '0.64rem', color: 'var(--forest-mid)', fontWeight: 600 }}>{horse.damYob}</span></div>}
                {(horse.damSire || horse.damDam) && (
                  <div style={{ paddingLeft: 10, borderLeft: '2px solid var(--gold-dark)', marginTop: 4 }}>
                    {horse.damSire && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: '0.54rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Dam's Sire</span><span style={{ fontSize: '0.64rem', color: 'var(--forest-mid)', fontWeight: 600 }}>{horse.damSire}</span></div>}
                    {horse.damDam && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.54rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Dam's Dam</span><span style={{ fontSize: '0.64rem', color: 'var(--forest-mid)', fontWeight: 600 }}>{horse.damDam}</span></div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {horse.pedigreeNotes && <p style={{ fontSize: '0.72rem', color: 'var(--forest-mid)', lineHeight: 1.6, marginTop: hasFamilyTree ? 8 : 0 }}>{horse.pedigreeNotes}</p>}
        {!horse.pedigreeNotes && !horse.pullQuote && !hasFamilyTree && <p style={{ fontSize: '0.72rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>No pedigree notes recorded.</p>}
      </div>
    </div>
  );
}

function ArticlesPanel({ articles, horseName }: { articles: Array<{ id: string; title: string; author?: string }>; horseName: string }) {
  return (
    <div className="sku-gold-card" style={{ ...serifStyle }}>
      <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Stories Filed</span>
        {articles.length > 0 && <span style={{ background: 'var(--gold-mid)', color: 'var(--forest-deep)', fontSize: '0.55rem', fontWeight: 700, padding: '1px 6px', borderRadius: 2 }}>{articles.length}</span>}
      </div>
      <div className="sku-parchment" style={{ padding: 0 }}>
        {articles.length === 0 ? (
          <div style={{ padding: '18px 12px', textAlign: 'center' }}><p style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No stories have been filed for {horseName} yet.</p></div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {articles.map((a, i) => (
              <li key={a.id} style={{ borderBottom: i < articles.length - 1 ? '1px solid var(--parchment-dark)' : undefined }}>
                <Link to={`/articles/${a.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', textDecoration: 'none', transition: 'background 0.12s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--parchment-dark)'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <Newspaper size={12} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--forest-deep)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    {a.author && <div style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)', marginTop: 1 }}>{a.author}</div>}
                  </div>
                  <ChevronRight size={11} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface PartyHeroImageProps {
  imgSrc: string;
  partyName: string;
  roleLabel: string;
  secondaryLine: string;
  onClose: () => void;
}

function PartyHeroImage({ imgSrc, partyName, roleLabel, secondaryLine, onClose }: PartyHeroImageProps) {
  return (
    <div style={{ border: '3px solid var(--gold-mid)', borderRadius: 4, overflow: 'hidden', boxShadow: '0 0 0 1px var(--gold-dark), 0 8px 32px rgba(0,0,0,0.75)', position: 'relative', background: 'var(--forest-deep)' }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-bright) 50%, var(--gold-dark) 100%)' }} />
      <div style={{ position: 'relative', width: '100%', height: 520 }}>
        <img src={imgSrc} alt={partyName} crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center top, transparent 40%, rgba(0,0,0,0.35) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(14,36,22,0.97) 0%, rgba(14,36,22,0.55) 50%, transparent 100%)', padding: '48px 20px 20px', ...serifStyle }}>
          <div style={{ fontSize: '0.5rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-mid)', marginBottom: 4 }}>Stable Press · {roleLabel}</div>
          <div style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.55rem)', fontWeight: 700, color: 'var(--parchment)', textShadow: '0 2px 8px rgba(0,0,0,0.9)', lineHeight: 1.15, ...serifStyle }}>{partyName}</div>
          {secondaryLine && <div style={{ fontSize: '0.65rem', fontStyle: 'italic', color: 'var(--gold-bright)', marginTop: 4, textShadow: '0 1px 4px rgba(0,0,0,0.8)', ...serifStyle }}>{secondaryLine}</div>}
        </div>
        <button onClick={onClose} aria-label="Close party profile" style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'rgba(14,36,22,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
          <X size={14} style={{ color: 'var(--gold-bright)' }} />
        </button>
      </div>
      <div style={{ height: 3, background: 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-bright) 50%, var(--gold-dark) 100%)' }} />
    </div>
  );
}

function ProfileDetailPanel({ title, icon, imgSrc, onClose, children }: { title: string; icon: React.ReactNode; imgSrc: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sku-gold-card" style={{ ...serifStyle, overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 110, overflow: 'hidden', background: 'var(--forest-deep)' }}>
        <img src={imgSrc} alt={title} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block', opacity: 0.72 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(14,36,22,0.9) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 14px 10px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 3, background: 'rgba(26,51,34,0.85)', border: '1px solid var(--gold-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontSize: '0.52rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-mid)', marginBottom: 1 }}>Stable Press · Profile Hub</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--parchment)', textShadow: '0 1px 4px rgba(0,0,0,0.9)', lineHeight: 1, ...serifStyle }}>{title}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close panel" style={{ width: 26, height: 26, borderRadius: 2, border: '1px solid var(--gold-dark)', background: 'rgba(26,51,34,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={13} style={{ color: 'var(--gold-bright)' }} />
          </button>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-bright) 50%, var(--gold-dark) 100%)' }} />
      </div>
      <div className="sku-parchment" style={{ padding: '14px 14px 16px' }}>{children}</div>
    </div>
  );
}

function PSRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--parchment-shadow)', paddingBottom: 6, marginBottom: 6, gap: 8 }}>
      <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, flexShrink: 0 }}>{label}</dt>
      <dd style={{ fontSize: '0.72rem', color: highlight ? 'var(--gold-bright)' : 'var(--forest-deep)', fontWeight: 600, textAlign: 'right', margin: 0 }}>{value}</dd>
    </div>
  );
}

function PSHeading({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--parchment-shadow)', fontWeight: 700, marginBottom: 8, marginTop: 14, borderTop: '1px solid var(--parchment-dark)', paddingTop: 10 }}>{children}</p>;
}

function PartyAvatarStrip({ parties, fallbackKey }: { parties: PanelParty[]; fallbackKey: string }) {
  if (parties.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
      {parties.map(({ party, isCurrent }) => (
        <div key={party.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 40, height: 40, borderRadius: 3, border: `2px solid ${isCurrent ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, overflow: 'hidden', background: 'var(--forest-deep)', boxShadow: '0 2px 6px rgba(0,0,0,0.4)', flexShrink: 0 }}>
            <img src={partyPhoto(party, fallbackKey)} alt={party.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }} />
          </div>
          <div style={{ fontSize: '0.5rem', color: isCurrent ? 'var(--gold-bright)' : 'var(--parchment-shadow)', textAlign: 'center', maxWidth: 48, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{party.name.split(' ')[0]}</div>
          {isCurrent && <div style={{ background: 'var(--gold-mid)', color: 'var(--forest-deep)', fontSize: '0.42rem', fontWeight: 700, padding: '1px 4px', borderRadius: 2 }}>CUR</div>}
        </div>
      ))}
    </div>
  );
}

function ContextNote({ context }: { context?: string }) {
  if (!context) return null;
  return (
    <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>
      {context}
    </div>
  );
}

function OwnerDetailPanel({ parties, horse, onClose }: { parties: PanelParty[]; horse: HorseData; onClose: () => void }) {
  const primary = parties[0];
  const imgSrc = primary ? partyPhoto(primary.party, 'owner') : FALLBACK_IMAGES.owner;
  return (
    <ProfileDetailPanel title="Owners Data" icon={<User size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgSrc={imgSrc} onClose={onClose}>
      <PartyAvatarStrip parties={parties} fallbackKey="owner" />
      {parties.length === 0 ? (
        <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No owners linked to this horse.</p>
      ) : parties.map(({ party, startDate, endDate, context, isCurrent }, idx) => (
        <div key={party.id} style={{ marginBottom: 14 }}>
          {parties.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--parchment-dark)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0 }}>
                <img src={partyPhoto(party, 'owner')} alt={party.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }} />
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{party.name}</span>
            </div>
          )}
          <dl style={{ margin: 0, padding: 0 }}>
            <PSRow label="Owner" value={party.name} />
            {party.profession && <PSRow label="Profession" value={party.profession} />}
            {party.date_of_birth && <PSRow label="Date of Birth" value={fmtDate(party.date_of_birth)} />}
            {party.country_of_birth && <PSRow label="Country" value={party.country_of_birth} />}
            {party.base_location && <PSRow label="Location" value={party.base_location} />}
            {party.started_year && <PSRow label="Started Owning" value={String(party.started_year)} />}
            {startDate && <PSRow label="Owner Since" value={fmtDate(startDate)} />}
            {endDate && <PSRow label="Owner Until" value={fmtDate(endDate)} />}
            <PSRow label="Status" value={isCurrent ? 'Current Owner' : 'Past Owner'} highlight={isCurrent} />
          </dl>
          <ContextNote context={context} />
          {idx < parties.length - 1 && <div style={{ height: 1, background: 'var(--parchment-dark)', margin: '10px 0' }} />}
        </div>
      ))}
      <PSHeading>Syndicate</PSHeading>
      <dl style={{ margin: 0, padding: 0 }}>
        <PSRow label="Bloodstock Agent" value={horse.bloodstockAgentDisplay || '—'} />
        <PSRow label="Syndicate Mgr" value={horse.syndicateManagerDisplay || '—'} />
      </dl>
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <UserCheck size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Ownership data sourced from linked party records.</span>
      </div>
    </ProfileDetailPanel>
  );
}

function BreederDetailPanel({ parties, horse, onClose }: { parties: PanelParty[]; horse: HorseData; onClose: () => void }) {
  const primary = parties[0];
  const imgSrc = primary ? partyPhoto(primary.party, 'breeder') : FALLBACK_IMAGES.breeder;
  return (
    <ProfileDetailPanel title="Breeders Data" icon={<BookOpen size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgSrc={imgSrc} onClose={onClose}>
      <PartyAvatarStrip parties={parties} fallbackKey="breeder" />
      {parties.length === 0 ? (
        <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No breeders linked to this horse.</p>
      ) : parties.map(({ party, startDate, endDate, context, isCurrent }, idx) => (
        <div key={party.id} style={{ marginBottom: 14 }}>
          {parties.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--parchment-dark)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0 }}>
                <img src={partyPhoto(party, 'breeder')} alt={party.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }} />
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{party.name}</span>
            </div>
          )}
          <dl style={{ margin: 0, padding: 0 }}>
            <PSRow label="Breeder" value={party.name} />
            {party.profession && <PSRow label="Profession" value={party.profession} />}
            {party.base_location && <PSRow label="Stud / Location" value={party.base_location} />}
            {party.country_of_birth && <PSRow label="Country" value={party.country_of_birth} />}
            {party.started_year && <PSRow label="Started Breeding" value={String(party.started_year)} />}
            {startDate && <PSRow label="Bred Since" value={fmtDate(startDate)} />}
            {endDate && <PSRow label="Until" value={fmtDate(endDate)} />}
            <PSRow label="Status" value={isCurrent ? 'Current' : 'Past'} highlight={isCurrent} />
          </dl>
          <ContextNote context={context} />
          {idx < parties.length - 1 && <div style={{ height: 1, background: 'var(--parchment-dark)', margin: '10px 0' }} />}
        </div>
      ))}
      <PSHeading>Pedigree</PSHeading>
      <dl style={{ margin: 0, padding: 0 }}>
        <PSRow label="Sire" value={horse.sire || '—'} />
        <PSRow label="Sire's Sire" value={horse.sireSire || '—'} />
        <PSRow label="Sire's Dam" value={horse.sireDam || '—'} />
        <PSRow label="Dam" value={horse.dam || '—'} />
        <PSRow label="Dam YOB" value={horse.damYob ? String(horse.damYob) : '—'} />
        <PSRow label="Dam's Sire" value={horse.damSire || '—'} />
        <PSRow label="Dam's Dam" value={horse.damDam || '—'} />
      </dl>
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Building2 size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Breeding data sourced from linked party records.</span>
      </div>
    </ProfileDetailPanel>
  );
}

function TrainerDetailPanel({ parties, horse, onClose }: { parties: PanelParty[]; horse: HorseData; onClose: () => void }) {
  const primary = parties[0];
  const imgSrc = primary ? partyPhoto(primary.party, 'trainer') : FALLBACK_IMAGES.trainer;
  return (
    <ProfileDetailPanel title="Trainers Data" icon={<Briefcase size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgSrc={imgSrc} onClose={onClose}>
      <PartyAvatarStrip parties={parties} fallbackKey="trainer" />
      {parties.length === 0 ? (
        <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No trainers linked to this horse.</p>
      ) : parties.map(({ party, startDate, endDate, context, isCurrent }, idx) => (
        <div key={party.id} style={{ marginBottom: 14 }}>
          {parties.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--parchment-dark)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0 }}>
                <img src={partyPhoto(party, 'trainer')} alt={party.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }} />
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{party.name}</span>
            </div>
          )}
          <dl style={{ margin: 0, padding: 0 }}>
            <PSRow label="Trainer" value={party.name} />
            {party.profession && <PSRow label="Profession" value={party.profession} />}
            {party.base_location && <PSRow label="Stable / Location" value={party.base_location} />}
            {party.country_of_birth && <PSRow label="Country" value={party.country_of_birth} />}
            {party.date_of_birth && <PSRow label="Date of Birth" value={fmtDate(party.date_of_birth)} />}
            {party.started_year && <PSRow label="Started Training" value={String(party.started_year)} />}
            {startDate && <PSRow label="Training Since" value={fmtDate(startDate)} />}
            {endDate && <PSRow label="Until" value={fmtDate(endDate)} />}
            <PSRow label="Status" value={isCurrent ? 'Current Trainer' : 'Past Trainer'} highlight={isCurrent} />
          </dl>
          <ContextNote context={context} />
          {idx < parties.length - 1 && <div style={{ height: 1, background: 'var(--parchment-dark)', margin: '10px 0' }} />}
        </div>
      ))}
      <PSHeading>Training Record</PSHeading>
      <dl style={{ margin: 0, padding: 0 }}>
        <PSRow label="Current Horse" value={horse.name} />
        <PSRow label="Career" value={horse.careerRecord || '—'} />
        <PSRow label="Winnings" value={horse.careerWinnings ? '$' + horse.careerWinnings.toLocaleString('en-AU') : '—'} highlight />
        <PSRow label="Rating" value={horse.currentRating ? String(horse.currentRating) : '—'} highlight />
      </dl>
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Dumbbell size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Trainer data sourced from linked party records.</span>
      </div>
    </ProfileDetailPanel>
  );
}

function PersonnelDetailPanel({ parties, agentParties, syndicateParties, horse, onClose }: { parties: PanelParty[]; agentParties: PanelParty[]; syndicateParties: PanelParty[]; horse: HorseData; onClose: () => void }) {
  const allP = [...agentParties, ...syndicateParties, ...parties];
  const primary = allP[0];
  const imgSrc = primary ? partyPhoto(primary.party, 'personnel') : FALLBACK_IMAGES.personnel;
  return (
    <ProfileDetailPanel title="Personnel Data" icon={<Users size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgSrc={imgSrc} onClose={onClose}>
      {agentParties.length > 0 && (
        <>
          <p style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--parchment-shadow)', fontWeight: 700, marginBottom: 8 }}>Bloodstock Agents</p>
          <PartyAvatarStrip parties={agentParties} fallbackKey="personnel" />
          {agentParties.map(({ party, startDate, context, isCurrent }, idx) => (
            <div key={party.id} style={{ marginBottom: 10 }}>
              {agentParties.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--parchment-dark)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0 }}>
                    <img src={partyPhoto(party, 'personnel')} alt={party.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }} />
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{party.name}</span>
                </div>
              )}
              <dl style={{ margin: 0, padding: 0 }}>
                <PSRow label="Agent" value={party.name} />
                {party.base_location && <PSRow label="Location" value={party.base_location} />}
                {startDate && <PSRow label="Since" value={fmtDate(startDate)} />}
                <PSRow label="Status" value={isCurrent ? 'Current' : 'Past'} highlight={isCurrent} />
              </dl>
              <ContextNote context={context} />
              {idx < agentParties.length - 1 && <div style={{ height: 1, background: 'var(--parchment-dark)', margin: '8px 0' }} />}
            </div>
          ))}
        </>
      )}
      {syndicateParties.length > 0 && (
        <>
          <PSHeading>Syndicate Managers</PSHeading>
          <PartyAvatarStrip parties={syndicateParties} fallbackKey="syndicate" />
          {syndicateParties.map(({ party, startDate, context, isCurrent }, idx) => (
            <div key={party.id} style={{ marginBottom: 10 }}>
              {syndicateParties.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--parchment-dark)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0 }}>
                    <img src={partyPhoto(party, 'syndicate')} alt={party.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }} />
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{party.name}</span>
                </div>
              )}
              <dl style={{ margin: 0, padding: 0 }}>
                <PSRow label="Manager" value={party.name} />
                {party.base_location && <PSRow label="Location" value={party.base_location} />}
                {startDate && <PSRow label="Since" value={fmtDate(startDate)} />}
                <PSRow label="Status" value={isCurrent ? 'Current' : 'Past'} highlight={isCurrent} />
              </dl>
              <ContextNote context={context} />
              {idx < syndicateParties.length - 1 && <div style={{ height: 1, background: 'var(--parchment-dark)', margin: '8px 0' }} />}
            </div>
          ))}
        </>
      )}
      {parties.length > 0 && (
        <>
          <PSHeading>Associated Personnel</PSHeading>
          <PartyAvatarStrip parties={parties} fallbackKey="personnel" />
          {parties.map(({ party, startDate, context, isCurrent }, idx) => (
            <div key={party.id} style={{ marginBottom: 10 }}>
              {parties.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--parchment-dark)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0 }}>
                    <img src={partyPhoto(party, 'personnel')} alt={party.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }} />
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{party.name}</span>
                </div>
              )}
              <dl style={{ margin: 0, padding: 0 }}>
                <PSRow label="Name" value={party.name} />
                {party.profession && <PSRow label="Role" value={party.profession} />}
                {party.personnel_subtype && party.personnel_subtype.length > 0 && <PSRow label="Subtype" value={party.personnel_subtype.join(', ')} />}
                {party.base_location && <PSRow label="Location" value={party.base_location} />}
                {startDate && <PSRow label="Since" value={fmtDate(startDate)} />}
                <PSRow label="Status" value={isCurrent ? 'Current' : 'Past'} highlight={isCurrent} />
              </dl>
              <ContextNote context={context} />
              {idx < parties.length - 1 && <div style={{ height: 1, background: 'var(--parchment-dark)', margin: '8px 0' }} />}
            </div>
          ))}
        </>
      )}
      {allP.length === 0 && (
        <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No personnel linked to this horse.</p>
      )}
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Contact size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Personnel data sourced from linked party records.</span>
      </div>
    </ProfileDetailPanel>
  );
}

function JockeyDetailPanel({ parties, horse, onClose }: { parties: PanelParty[]; horse: HorseData; onClose: () => void }) {
  const primary = parties[0];
  const imgSrc = primary ? partyPhoto(primary.party, 'jockey') : FALLBACK_IMAGES.jockey;
  return (
    <ProfileDetailPanel title="Jockey(s) Data" icon={<Flag size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgSrc={imgSrc} onClose={onClose}>
      <PartyAvatarStrip parties={parties} fallbackKey="jockey" />
      {parties.length === 0 ? (
        <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No jockeys linked to this horse.</p>
      ) : parties.map(({ party, startDate, endDate, context, isCurrent }, idx) => (
        <div key={party.id} style={{ marginBottom: 14 }}>
          {parties.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--parchment-dark)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0 }}>
                <img src={partyPhoto(party, 'jockey')} alt={party.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }} />
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{party.name}</span>
            </div>
          )}
          <dl style={{ margin: 0, padding: 0 }}>
            <PSRow label="Jockey" value={party.name} />
            {party.profession && <PSRow label="Profession" value={party.profession} />}
            {party.date_of_birth && <PSRow label="Date of Birth" value={fmtDate(party.date_of_birth)} />}
            {party.country_of_birth && <PSRow label="Country" value={party.country_of_birth} />}
            {party.base_location && <PSRow label="Base" value={party.base_location} />}
            {party.started_year && <PSRow label="Started Riding" value={String(party.started_year)} />}
            {startDate && <PSRow label="Riding Since" value={fmtDate(startDate)} />}
            {endDate && <PSRow label="Until" value={fmtDate(endDate)} />}
            <PSRow label="Status" value={isCurrent ? 'Current Rider' : 'Past Rider'} highlight={isCurrent} />
          </dl>
          <ContextNote context={context} />
          {idx < parties.length - 1 && <div style={{ height: 1, background: 'var(--parchment-dark)', margin: '10px 0' }} />}
        </div>
      ))}
      <PSHeading>Current Form on this Horse</PSHeading>
      <dl style={{ margin: 0, padding: 0 }}>
        <PSRow label="Career Record" value={horse.careerRecord || '—'} highlight />
        <PSRow label="Winnings" value={horse.careerWinnings ? '$' + horse.careerWinnings.toLocaleString('en-AU') : '—'} highlight />
        <PSRow label="Last 10 Form" value={horse.lastTenForm || '—'} />
        <PSRow label="Current Rating" value={horse.currentRating ? String(horse.currentRating) : '—'} highlight />
      </dl>
    </ProfileDetailPanel>
  );
}

function SyndicateManagerDetailPanel({ parties, horse, onClose }: { parties: PanelParty[]; horse: HorseData; onClose: () => void }) {
  const primary = parties[0];
  const imgSrc = primary ? partyPhoto(primary.party, 'syndicate') : FALLBACK_IMAGES.syndicate;
  return (
    <ProfileDetailPanel title="Syndicate Manager" icon={<Shield size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgSrc={imgSrc} onClose={onClose}>
      <PartyAvatarStrip parties={parties} fallbackKey="syndicate" />
      {parties.length === 0 ? (
        <p style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No syndicate managers linked to this horse.</p>
      ) : parties.map(({ party, startDate, endDate, context, isCurrent }, idx) => (
        <div key={party.id} style={{ marginBottom: 14 }}>
          {parties.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--parchment-dark)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 2, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0 }}>
                <img src={partyPhoto(party, 'syndicate')} alt={party.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }} />
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{party.name}</span>
            </div>
          )}
          <dl style={{ margin: 0, padding: 0 }}>
            <PSRow label="Manager" value={party.name} />
            {party.profession && <PSRow label="Profession" value={party.profession} />}
            {party.base_location && <PSRow label="Location" value={party.base_location} />}
            {party.started_year && <PSRow label="Started Managing" value={String(party.started_year)} />}
            {startDate && <PSRow label="Managing Since" value={fmtDate(startDate)} />}
            {endDate && <PSRow label="Until" value={fmtDate(endDate)} />}
            <PSRow label="Status" value={isCurrent ? 'Current Manager' : 'Past Manager'} highlight={isCurrent} />
          </dl>
          <ContextNote context={context} />
          {idx < parties.length - 1 && <div style={{ height: 1, background: 'var(--parchment-dark)', margin: '10px 0' }} />}
        </div>
      ))}
      <PSHeading>Members</PSHeading>
      <p style={{ fontSize: '0.68rem', color: 'var(--forest-mid)', lineHeight: 1.6, fontStyle: 'italic' }}>{horse.personnelDisplay || 'No members on file.'}</p>
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <SidebarOpen size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Syndicate data sourced from linked party records.</span>
      </div>
    </ProfileDetailPanel>
  );
}

/* ── Shared section panel shell ── */
function SectionPanel({ title, icon, imgKey, onClose, children }: { title: string; icon: React.ReactNode; imgKey: keyof typeof DATA_CARD_IMAGES; onClose: () => void; children: React.ReactNode }) {
  const imgSrc = DATA_CARD_IMAGES[imgKey];
  return (
    <div className="sku-gold-card" style={{ ...serifStyle, overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 110, overflow: 'hidden', background: 'var(--forest-deep)' }}>
        <img src={imgSrc} alt={title} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block', opacity: 0.75 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(14,36,22,0.88) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 14px 10px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 3, background: 'rgba(26,51,34,0.85)', border: '1px solid var(--gold-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
            <div><div style={{ fontSize: '0.52rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-mid)', marginBottom: 1 }}>Stable Press · Data Hub</div><div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--parchment)', textShadow: '0 1px 4px rgba(0,0,0,0.9)', lineHeight: 1, ...serifStyle }}>{title}</div></div>
          </div>
          <button onClick={onClose} aria-label="Close section" style={{ width: 26, height: 26, borderRadius: 2, border: '1px solid var(--gold-dark)', background: 'rgba(26,51,34,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={13} style={{ color: 'var(--gold-bright)' }} /></button>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-bright) 50%, var(--gold-dark) 100%)' }} />
      </div>
      <div className="sku-parchment" style={{ padding: '14px 14px 16px' }}>{children}</div>
    </div>
  );
}

function SRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--parchment-shadow)', paddingBottom: 6, marginBottom: 6, gap: 8 }}>
      <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, flexShrink: 0 }}>{label}</dt>
      <dd style={{ fontSize: '0.72rem', color: highlight ? 'var(--gold-bright)' : 'var(--forest-deep)', fontWeight: 600, textAlign: 'right', margin: 0 }}>{value}</dd>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--parchment-shadow)', fontWeight: 700, marginBottom: 8, marginTop: 14, borderTop: '1px solid var(--parchment-dark)', paddingTop: 10 }}>{children}</p>;
}

/* ─── MEDIA TYPE BADGE ─── */
const MEDIA_TYPE_BADGE_COLORS: Record<MediaType, React.CSSProperties> = {
  Article:       { background: 'linear-gradient(90deg,#2d5a3d,#3a7050)', color: 'var(--gold-bright)' },
  Photo:         { background: 'linear-gradient(90deg,#3b4a20,#516430)', color: 'var(--gold-bright)' },
  Video:         { background: 'linear-gradient(90deg,#3d2d42,#5a3a68)', color: 'var(--gold-bright)' },
  'Press Release': { background: 'linear-gradient(90deg,#3d2d20,#5a4030)', color: 'var(--gold-bright)' },
  Publication:   { background: 'linear-gradient(90deg,#1e3d48,#2a5568)', color: 'var(--gold-bright)' },
};

const MEDIA_TYPE_ICONS: Record<MediaType, string> = {
  Article: '📰', Photo: '📷', Video: '🎬', 'Press Release': '📢', Publication: '📖',
};

function MediaTypeBadge({ type }: { type: MediaType }) {
  const style = MEDIA_TYPE_BADGE_COLORS[type] ?? {};
  return (
    <span style={{ ...style, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 2, display: 'inline-flex', alignItems: 'center', gap: 3, border: '1px solid rgba(255,224,154,0.2)', flexShrink: 0 }}>
      <span>{MEDIA_TYPE_ICONS[type]}</span>
      <span>{type}</span>
    </span>
  );
}

/* ─── RACE STATUS BADGE ─── */
function RaceStatusBadge({ status }: { status: RaceStatus }) {
  const colors: Record<RaceStatus, { bg: string; text: string }> = {
    Entered:   { bg: 'rgba(26,51,34,0.85)',  text: 'var(--gold-mid)' },
    Accepted:  { bg: 'rgba(20,55,20,0.9)',   text: 'var(--gold-bright)' },
    Scratched: { bg: 'rgba(80,20,20,0.6)',   text: '#e09090' },
    Declared:  { bg: 'rgba(20,40,80,0.8)',   text: '#90b0e0' },
    Finished:  { bg: 'rgba(40,30,10,0.85)',  text: 'var(--gold-bright)' },
  };
  const c = colors[status] ?? colors.Entered;
  return (
    <span style={{ background: c.bg, color: c.text, fontSize: '0.5rem', fontWeight: 700, padding: '2px 7px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.12em', border: '1px solid rgba(255,224,154,0.15)', flexShrink: 0 }}>
      {status}
    </span>
  );
}

/* ─── MEDIA SECTION ─── */
function MediaSection({ horseId, horseName, onClose, partyContext }: {
  horseId: string;
  horseName: string;
  onClose: () => void;
  partyContext: PartyContext;
}) {
  const allItems = useMediaStore((s) => s.items);
  const fetchItems = useMediaStore((s) => s.fetchItems);
  const allParties = usePartyStore((s) => s.parties);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const horseItems = useMemo(
    () => allItems.filter((m) => m.horse_id === horseId).sort((a, b) => {
      const da = a.published_date ?? String(a.createdAt);
      const db = b.published_date ?? String(b.createdAt);
      return db.localeCompare(da);
    }),
    [allItems, horseId],
  );

  const items = useMemo(() => {
    if (!partyContext.isPartyContext || partyContext.partyIds.length === 0) return horseItems;
    return horseItems.filter((m) =>
      (m.featured_party_ids ?? []).some((pid) => partyContext.partyIds.includes(pid))
    );
  }, [horseItems, partyContext]);

  const contextName = partyContext.primaryParty?.party.name;
  const showingAll = !partyContext.isPartyContext;
  const displayName = showingAll ? horseName : contextName ?? horseName;

  return (
    <SectionPanel title="Media Data" icon={<Camera size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="media" onClose={onClose}>
      <PartyContextBanner partyContext={partyContext} onClear={onClose} />

      <SRow label={showingAll ? 'Horse' : 'Party'} value={displayName} />
      <SRow label="Media Records" value={String(items.length)} />
      {partyContext.isPartyContext && (
        <SRow label="Horse Total" value={String(horseItems.length)} />
      )}

      {items.length === 0 ? (
        <div style={{ marginTop: 12, padding: '20px 14px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--parchment-dark)', borderRadius: 3, textAlign: 'center' }}>
          <Camera size={28} style={{ color: 'var(--parchment-dark)', display: 'block', margin: '0 auto 8px' }} />
          {partyContext.isPartyContext ? (
            <>
              <p style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', marginBottom: 4 }}>
                No media featuring {contextName} has been filed yet.
              </p>
              <p style={{ fontSize: '0.62rem', color: 'var(--parchment-shadow)' }}>
                Media records are managed through the Stable Press CRM.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', marginBottom: 4 }}>No media coverage on file for {horseName} yet.</p>
              <p style={{ fontSize: '0.62rem', color: 'var(--parchment-shadow)' }}>Media records are managed through the Stable Press CRM.</p>
            </>
          )}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {items.map((item, idx) => {
            const featuredNames = (item.featured_party_ids ?? [])
              .map((pid) => allParties.find((p) => p.id === pid)?.name)
              .filter(Boolean) as string[];
            const hasLink = item.url || item.file_name;
            return (
              <li key={item.id} style={{ borderBottom: idx < items.length - 1 ? '1px solid var(--parchment-dark)' : undefined, padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                  <div style={{ flexShrink: 0, marginTop: 1 }}><MediaTypeBadge type={item.media_type} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--forest-deep)', lineHeight: 1.3, ...serifStyle }}>{item.title}</div>
                    {item.subject && <div style={{ fontSize: '0.62rem', color: 'var(--forest-mid)', fontStyle: 'italic', marginTop: 2, lineHeight: 1.4 }}>{item.subject}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-shadow)' }}>
                  {item.source_publication && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Newspaper size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{item.source_publication}</span>}
                  {item.published_date && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--gold-dark)' }}>·</span>{fmtDate(item.published_date)}</span>}
                  {featuredNames.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Users size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{featuredNames.join(', ')}</span>}
                </div>
                {hasLink && (
                  <div style={{ marginTop: 5 }}>
                    {item.url ? (
                      <a href={item.url} target={item.url.startsWith('/') ? '_self' : '_blank'} rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--forest-mid)', textDecoration: 'none', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 2, padding: '2px 7px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <ExternalLink size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />
                        {item.url.length > 52 ? item.url.substring(0, 52) + '…' : item.url}
                      </a>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--forest-mid)', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 2, padding: '2px 7px' }}>
                        <LinkIcon size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />
                        {item.file_name}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <>
          <SectionHeading>Coverage by Type</SectionHeading>
          <dl style={{ margin: 0, padding: 0 }}>
            {(['Article', 'Photo', 'Video', 'Press Release', 'Publication'] as MediaType[]).map((t) => {
              const count = items.filter((m) => m.media_type === t).length;
              if (count === 0) return null;
              return <SRow key={t} label={t} value={String(count)} />;
            })}
          </dl>
        </>
      )}

      <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Image size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.62rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>
          {partyContext.isPartyContext
            ? `Showing media featuring ${contextName}. Full records are managed through the Stable Press CRM.`
            : 'Media records are managed through the Stable Press CRM and linked to this horse automatically.'
          }
        </span>
      </div>
    </SectionPanel>
  );
}

/* ─── RACING SECTION ─── */
function RacingSection({ horseId, horseName, horse, onClose, partyContext }: {
  horseId: string;
  horseName: string;
  horse: HorseData;
  onClose: () => void;
  partyContext: PartyContext;
}) {
  const allEntries = useRacingEntryStore((s) => s.entries);
  const fetchEntries = useRacingEntryStore((s) => s.fetchEntries);
  const allParties = usePartyStore((s) => s.parties);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const horseEntries = useMemo(
    () => allEntries
      .filter((e) => e.horse_id === horseId)
      .sort((a, b) => b.race_date.localeCompare(a.race_date)),
    [allEntries, horseId],
  );

  const isJockeyContext = partyContext.isPartyContext && partyContext.roleLabel === 'Jockey';
  const isTrainerContext = partyContext.isPartyContext && partyContext.roleLabel === 'Trainer';

  const entries = useMemo(() => {
    if (!partyContext.isPartyContext || partyContext.partyIds.length === 0) return horseEntries;
    if (isJockeyContext) {
      return horseEntries.filter((e) => e.jockey_id && partyContext.partyIds.includes(e.jockey_id));
    }
    if (isTrainerContext) {
      return horseEntries.filter((e) => e.trainer_id && partyContext.partyIds.includes(e.trainer_id));
    }
    return horseEntries;
  }, [horseEntries, partyContext, isJockeyContext, isTrainerContext]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<RaceStatus, number>> = {};
    entries.forEach((e) => { counts[e.status] = (counts[e.status] ?? 0) + 1; });
    return counts;
  }, [entries]);

  const contextName = partyContext.primaryParty?.party.name;
  const showingAll = !partyContext.isPartyContext;
  const isFilteredByParty = partyContext.isPartyContext && (isJockeyContext || isTrainerContext);
  const isContextualAll = partyContext.isPartyContext && !isJockeyContext && !isTrainerContext;

  return (
    <SectionPanel title="Racing Data" icon={<TrendingUp size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="racing" onClose={onClose}>
      <PartyContextBanner partyContext={partyContext} onClear={onClose} />

      <SRow label="Horse" value={horseName} />
      <SRow label="Race Records" value={String(entries.length)} />
      {isFilteredByParty && <SRow label="Horse Total" value={String(horseEntries.length)} />}
      <SRow label="Career" value={horse.careerRecord || '—'} />
      <SRow label="Winnings" value={horse.careerWinnings ? '$' + horse.careerWinnings.toLocaleString('en-AU') : '—'} highlight />

      {isContextualAll && (
        <div style={{ marginTop: 8, marginBottom: 4, padding: '7px 10px', background: 'rgba(180,140,30,0.08)', border: '1px solid var(--gold-dark)', borderRadius: 3, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <Info size={12} style={{ color: 'var(--gold-mid)', flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: '0.62rem', color: 'var(--parchment-shadow)', fontStyle: 'italic', lineHeight: 1.5 }}>
            Showing all races for this horse while viewing {contextName}. Racing records for this party are linked via jockey or trainer roles.
          </span>
        </div>
      )}

      {entries.length === 0 ? (
        <div style={{ marginTop: 12, padding: '20px 14px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--parchment-dark)', borderRadius: 3, textAlign: 'center' }}>
          <Flag size={28} style={{ color: 'var(--parchment-dark)', display: 'block', margin: '0 auto 8px' }} />
          {isFilteredByParty ? (
            <>
              <p style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', marginBottom: 4 }}>
                No races on file with {contextName} as {partyContext.roleLabel.toLowerCase()}.
              </p>
              <p style={{ fontSize: '0.62rem', color: 'var(--parchment-shadow)' }}>Racing records are managed through the Stable Press CRM.</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', marginBottom: 4 }}>No racing records on file for {horseName} yet.</p>
              <p style={{ fontSize: '0.62rem', color: 'var(--parchment-shadow)' }}>Racing records are managed through the Stable Press CRM.</p>
            </>
          )}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {entries.map((entry, idx) => {
            const jockeyName = entry.jockey_id ? allParties.find((p) => p.id === entry.jockey_id)?.name : undefined;
            const trainerName = entry.trainer_id ? allParties.find((p) => p.id === entry.trainer_id)?.name : undefined;
            return (
              <li key={entry.id} style={{ borderBottom: idx < entries.length - 1 ? '1px solid var(--parchment-dark)' : undefined, padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                  <div style={{ flexShrink: 0, marginTop: 1 }}><RaceStatusBadge status={entry.status} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--forest-deep)', lineHeight: 1.3, ...serifStyle }}>{entry.race_name}</div>
                    {entry.subject && <div style={{ fontSize: '0.62rem', color: 'var(--forest-mid)', fontStyle: 'italic', marginTop: 2, lineHeight: 1.4 }}>{entry.subject}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-shadow)', marginBottom: 4 }}>
                  {entry.race_date && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Flag size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />
                      {fmtDate(entry.race_date)}
                    </span>
                  )}
                  {entry.venue && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ color: 'var(--gold-dark)' }}>·</span>
                      {entry.venue}{entry.country ? `, ${entry.country}` : ''}
                    </span>
                  )}
                  {entry.class_grade && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ color: 'var(--gold-dark)' }}>·</span>
                      {entry.class_grade}
                    </span>
                  )}
                  {entry.distance && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ color: 'var(--gold-dark)' }}>·</span>
                      {entry.distance}
                    </span>
                  )}
                </div>
                {entry.status === 'Finished' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-shadow)' }}>
                    {entry.finish_position !== undefined && (
                      <span style={{ color: entry.finish_position === 1 ? 'var(--gold-bright)' : 'var(--forest-mid)', fontWeight: entry.finish_position === 1 ? 700 : 500 }}>
                        {entry.finish_position === 1 ? '🏆' : ''} {entry.finish_position}{entry.finish_position === 1 ? 'st' : entry.finish_position === 2 ? 'nd' : entry.finish_position === 3 ? 'rd' : 'th'}
                      </span>
                    )}
                    {entry.margin && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--gold-dark)' }}>·</span>{entry.margin}</span>}
                    {entry.time && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--gold-dark)' }}>·</span>{entry.time}</span>}
                    {entry.prize_money && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--gold-bright)' }}><span style={{ color: 'var(--gold-dark)' }}>·</span>${entry.prize_money.toLocaleString('en-AU')}</span>}
                  </div>
                )}
                {(entry.barrier !== undefined || entry.weight_carried || jockeyName || trainerName) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.57rem', color: 'var(--parchment-shadow)', marginTop: 4 }}>
                    {entry.barrier !== undefined && <span>Barrier {entry.barrier}</span>}
                    {entry.weight_carried && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--gold-dark)' }}>·</span>{entry.weight_carried}</span>}
                    {jockeyName && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: isJockeyContext ? 'var(--gold-bright)' : 'var(--parchment-shadow)', fontWeight: isJockeyContext ? 700 : 400 }}><Users size={8} style={{ color: 'var(--gold-dark)' }} />J: {jockeyName}</span>}
                    {trainerName && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: isTrainerContext ? 'var(--gold-bright)' : 'var(--parchment-shadow)', fontWeight: isTrainerContext ? 700 : 400 }}><Briefcase size={8} style={{ color: 'var(--gold-dark)' }} />T: {trainerName}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {entries.length > 0 && (
        <>
          <SectionHeading>Records by Status</SectionHeading>
          <dl style={{ margin: 0, padding: 0 }}>
            {(['Entered', 'Accepted', 'Declared', 'Scratched', 'Finished'] as RaceStatus[]).map((s) => {
              const count = statusCounts[s] ?? 0;
              if (count === 0) return null;
              return <SRow key={s} label={s} value={String(count)} />;
            })}
          </dl>
          <SectionHeading>Connections</SectionHeading>
          <dl style={{ margin: 0, padding: 0 }}>
            <SRow label="Jockey" value={horse.jockeyDisplay || '—'} />
            <SRow label="Trainer" value={horse.trainerDisplay || '—'} />
            <SRow label="Rating" value={horse.currentRating ? String(horse.currentRating) : '—'} highlight />
          </dl>
        </>
      )}

      <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <TrendingUp size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.62rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>
          Racing records are managed through the Stable Press CRM and surface automatically on this profile.
        </span>
      </div>
    </SectionPanel>
  );
}

function BreedingSection({ horse, onClose, partyContext }: { horse: HorseData; onClose: () => void; partyContext: PartyContext }) {
  const contextName = partyContext.primaryParty?.party.name;
  const primary = partyContext.primaryParty;
  return (
    <SectionPanel title="Breeding Data" icon={<Heart size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="breeding" onClose={onClose}>
      <PartyContextBanner partyContext={partyContext} onClear={onClose} />
      <dl style={{ margin: 0, padding: 0 }}>
        <SRow label="Horse Name" value={horse.isUnnamed ? 'Un-Named' : horse.name} />
        {partyContext.isPartyContext && <SRow label="Party" value={contextName ?? '—'} />}
        <SRow label="Sex" value={horse.sex || '—'} />
        <SRow label="Colour" value={horse.colour || '—'} />
        <SRow label="Date of Birth" value={horse.dob ? new Date(horse.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
        <SRow label="Breeder" value={horse.breederDisplay || '—'} />
        <SRow label="Country of Birth" value={horse.country || '—'} />
        <SRow label="Sire" value={horse.sire || '—'} />
        <SRow label="Dam" value={horse.dam || '—'} />
        <SRow label="Dam YOB" value={horse.damYob ? String(horse.damYob) : '—'} />
      </dl>
      {partyContext.isPartyContext && primary && (
        <>
          <SectionHeading>Breeder Details</SectionHeading>
          <dl style={{ margin: 0, padding: 0 }}>
            <SRow label="Name" value={primary.party.name} />
            {primary.party.base_location && <SRow label="Location" value={primary.party.base_location} />}
            {primary.party.started_year && <SRow label="Est." value={String(primary.party.started_year)} />}
            {primary.startDate && <SRow label="Bred Since" value={fmtDate(primary.startDate)} />}
            <SRow label="Status" value={primary.isCurrent ? 'Current' : 'Past'} />
          </dl>
        </>
      )}
      <SectionHeading>Breeding Record</SectionHeading>
      <dl style={{ margin: 0, padding: 0 }}>
        <SRow label="Breeding Status" value="Not recorded" />
        <SRow label="Foals on Record" value="0" />
        <SRow label="Paddock History" value="Not on file" />
      </dl>
      <p style={{ fontSize: '0.72rem', color: 'var(--forest-mid)', lineHeight: 1.6, fontStyle: 'italic', marginTop: 10 }}>Full paddock history, foaling records, and breeding partnerships will be displayed here once registered.</p>
    </SectionPanel>
  );
}

function fmtMoney(amount?: number, currency = 'AUD'): string {
  if (amount === undefined || amount === null) return '—';
  return `${currency === 'NZD' ? 'NZ$' : '$'}${amount.toLocaleString('en-AU')}`;
}

function SalesSection({ horse, onClose, partyContext }: { horse: HorseData; onClose: () => void; partyContext: PartyContext }) {
  const allSales = useSaleStore((s) => s.sales);
  const fetchSales = useSaleStore((s) => s.fetchSales);
  const allParties = usePartyStore((s) => s.parties);
  useEffect(() => { fetchSales(); }, [fetchSales]);

  const horseSales = useMemo(
    () => allSales.filter((s) => s.horse_id === horse.id).sort((a, b) => b.sale_date.localeCompare(a.sale_date)),
    [allSales, horse.id],
  );

  const isOwnerContext = partyContext.isPartyContext && partyContext.roleLabel === 'Owner';
  const sales = useMemo(() => {
    if (!isOwnerContext) return horseSales;
    return horseSales.filter((s) => s.buyer_party_id && partyContext.partyIds.includes(s.buyer_party_id));
  }, [horseSales, isOwnerContext, partyContext]);

  const contextName = partyContext.primaryParty?.party.name;
  const topPrice = horseSales.reduce((m, s) => (s.price && s.price > m ? s.price : m), 0);

  return (
    <SectionPanel title="Sales Data" icon={<ShoppingCart size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="sales" onClose={onClose}>
      <PartyContextBanner partyContext={partyContext} onClear={onClose} />
      <SRow label="Horse" value={horse.isUnnamed ? 'Un-Named' : horse.name} />
      <SRow label="Sale Records" value={String(sales.length)} />
      {isOwnerContext && <SRow label="Horse Total" value={String(horseSales.length)} />}
      {topPrice > 0 && <SRow label="Top Price" value={fmtMoney(topPrice)} highlight />}

      {sales.length === 0 ? (
        <div style={{ marginTop: 12, padding: '20px 14px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--parchment-dark)', borderRadius: 3, textAlign: 'center' }}>
          <ShoppingCart size={28} style={{ color: 'var(--parchment-dark)', display: 'block', margin: '0 auto 8px' }} />
          <p style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', marginBottom: 4 }}>
            {isOwnerContext ? `No purchases by ${contextName} on file.` : `No sales history on file for ${horse.name} yet.`}
          </p>
          <p style={{ fontSize: '0.62rem', color: 'var(--parchment-shadow)' }}>Sales records are managed through the Stable Press CRM.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {sales.map((sale, idx) => {
            const buyerName = sale.buyer_party_id ? allParties.find((p) => p.id === sale.buyer_party_id)?.name : undefined;
            return (
              <li key={sale.id} style={{ borderBottom: idx < sales.length - 1 ? '1px solid var(--parchment-dark)' : undefined, padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                  <span style={{ background: 'linear-gradient(90deg,#3d2d20,#5a4030)', color: 'var(--gold-bright)', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 2, border: '1px solid rgba(255,224,154,0.2)', flexShrink: 0, marginTop: 1 }}>{sale.sale_type}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--forest-deep)', lineHeight: 1.3, ...serifStyle }}>{sale.venue}{sale.lot ? ` · ${sale.lot}` : ''}</div>
                    {sale.price !== undefined && <div style={{ fontSize: '0.74rem', color: 'var(--gold-dark)', fontWeight: 700, marginTop: 1 }}>{fmtMoney(sale.price, sale.currency)}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-shadow)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><DollarSign size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{fmtDate(sale.sale_date)}</span>
                  {sale.vendor && <span><span style={{ color: 'var(--gold-dark)' }}>· </span>Vendor: {sale.vendor}</span>}
                  {buyerName && <span><span style={{ color: 'var(--gold-dark)' }}>· </span>Buyer: {buyerName}</span>}
                </div>
                {sale.notes && <div style={{ fontSize: '0.62rem', color: 'var(--forest-mid)', fontStyle: 'italic', marginTop: 3, lineHeight: 1.4 }}>{sale.notes}</div>}
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <DollarSign size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Sales &amp; auction records are managed through the Stable Press CRM.</span>
      </div>
    </SectionPanel>
  );
}

function PedigreeSection({ horse, onClose, partyContext }: { horse: HorseData; onClose: () => void; partyContext: PartyContext }) {
  const hasFamilyTree = horse.sire || horse.dam || horse.sireSire || horse.sireDam || horse.damSire || horse.damDam;
  const contextName = partyContext.primaryParty?.party.name;
  return (
    <SectionPanel title="Pedigree Data" icon={<Wand size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="pedigree" onClose={onClose}>
      <PartyContextBanner partyContext={partyContext} onClear={onClose} />
      {partyContext.isPartyContext && (
        <div style={{ marginBottom: 10, padding: '6px 10px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--parchment-dark)', borderRadius: 3 }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>
            Pedigree data for this horse — context: {contextName}
          </span>
        </div>
      )}
      {horse.pullQuote && <blockquote style={{ borderLeft: '3px solid var(--gold-mid)', paddingLeft: 10, marginBottom: 12, fontStyle: 'italic', fontSize: '0.78rem', color: 'var(--forest-deep)', lineHeight: 1.5 }}>"{horse.pullQuote}"</blockquote>}
      {hasFamilyTree && (
        <div style={{ marginBottom: 12 }}>
          <PedigreeGrid horse={horse} />
        </div>
      )}
      <dl style={{ margin: 0, padding: 0 }}>
        <SRow label="Dam YOB" value={horse.damYob ? String(horse.damYob) : '—'} />
      </dl>
      {horse.pedigreeNotes && <><SectionHeading>Pedigree Notes</SectionHeading><p style={{ fontSize: '0.72rem', color: 'var(--forest-mid)', lineHeight: 1.6 }}>{horse.pedigreeNotes}</p></>}
      {!hasFamilyTree && !horse.pedigreeNotes && <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}><BookMarked size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} /><span style={{ fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>No pedigree data on file.</span></div>}
    </SectionPanel>
  );
}

function StudBookSection({ horse, onClose, partyContext }: { horse: HorseData; onClose: () => void; partyContext: PartyContext }) {
  const contextName = partyContext.primaryParty?.party.name;
  return (
    <SectionPanel title="Stud Book Data" icon={<Binary size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="studbook" onClose={onClose}>
      <PartyContextBanner partyContext={partyContext} onClear={onClose} />
      <dl style={{ margin: 0, padding: 0 }}>
        <SRow label="Horse Name" value={horse.isUnnamed ? 'Un-Named' : horse.name} />
        {partyContext.isPartyContext && <SRow label="Party" value={contextName ?? '—'} />}
        <SRow label="Sex" value={horse.sex || '—'} />
        <SRow label="Date of Birth" value={horse.dob ? new Date(horse.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
        <SRow label="Colour" value={horse.colour || '—'} />
        <SRow label="Country" value={horse.country || '—'} />
        <SRow label="Sire" value={horse.sire || '—'} />
        <SRow label="Dam" value={horse.dam || '—'} />
        <SRow label="Dam YOB" value={horse.damYob ? String(horse.damYob) : '—'} />
        <SRow label="Breeder" value={horse.breederDisplay || '—'} />
      </dl>
      <SectionHeading>Registry Details</SectionHeading>
      <dl style={{ margin: 0, padding: 0 }}>
        <SRow label="Stud Book" value={horse.studBook || 'Australian Stud Book'} />
        <SRow label="Registration No." value={horse.registrationNumber || 'Not on file'} highlight={!!horse.registrationNumber} />
        <SRow label="Microchip" value={horse.microchip || 'Not on file'} />
        <SRow label="Brand / Freeze" value={horse.brandFreeze || 'Not on file'} />
        <SRow label="Passport No." value={horse.passportNumber || 'Not on file'} />
      </dl>
      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapPin size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>Official stud book registration details as held by Racing Australia.</span>
      </div>
    </SectionPanel>
  );
}

/* ─── REPORTS / FORMS SECTION ─── */
function ReportsSection({ horse, onClose }: { horse: HorseData; onClose: () => void }) {
  const allReports = useReportStore((s) => s.reports);
  const fetchReports = useReportStore((s) => s.fetchReports);
  const currentUser = useAuthStore((s) => s.currentUser);
  useEffect(() => { fetchReports(); }, [fetchReports]);

  const horseReports = useMemo(
    () => allReports.filter((r) => r.horse_id === horse.id),
    [allReports, horse.id],
  );

  // Restricted documents only show to authenticated users.
  const visible = useMemo(
    () => horseReports.filter((r) => (r.visibility as ReportVisibility) === 'public' || !!currentUser),
    [horseReports, currentUser],
  );
  const hiddenCount = horseReports.length - visible.length;

  return (
    <ProfileDetailPanel title="Reports / Forms" icon={<FileText size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgSrc={DATA_CARD_IMAGES.studbook} onClose={onClose}>
      <SRow label="Horse" value={horse.isUnnamed ? 'Un-Named' : horse.name} />
      <SRow label="Documents" value={String(visible.length)} />

      {visible.length === 0 ? (
        <div style={{ marginTop: 12, padding: '20px 14px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--parchment-dark)', borderRadius: 3, textAlign: 'center' }}>
          <FileText size={28} style={{ color: 'var(--parchment-dark)', display: 'block', margin: '0 auto 8px' }} />
          <p style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No documents on file for {horse.name}.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {visible.map((r, idx) => {
            const restricted = (r.visibility as ReportVisibility) === 'restricted';
            const hasLink = r.url || r.file_name;
            return (
              <li key={r.id} style={{ borderBottom: idx < visible.length - 1 ? '1px solid var(--parchment-dark)' : undefined, padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <span style={{ background: 'linear-gradient(90deg,#2d5a3d,#3a7050)', color: 'var(--gold-bright)', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 2, border: '1px solid rgba(255,224,154,0.2)', flexShrink: 0, marginTop: 1 }}>{r.doc_type}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--forest-deep)', lineHeight: 1.3, ...serifStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {restricted && <Lock size={10} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />}
                      {r.title}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-shadow)', marginTop: 2 }}>
                      {r.issuing_body && <span>{r.issuing_body}</span>}
                      {r.issued_date && <span><span style={{ color: 'var(--gold-dark)' }}>· </span>{fmtDate(r.issued_date)}</span>}
                      {restricted && <span style={{ color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>· Restricted</span>}
                    </div>
                  </div>
                </div>
                {hasLink && (
                  <div style={{ marginTop: 4 }}>
                    {r.url ? (
                      <a href={r.url} target={r.url.startsWith('/') ? '_self' : '_blank'} rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--forest-mid)', textDecoration: 'none', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 2, padding: '2px 7px' }}>
                        <ExternalLink size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />Open document
                      </a>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--forest-mid)', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 2, padding: '2px 7px' }}>
                        <LinkIcon size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{r.file_name}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 && !currentUser && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(180,140,30,0.08)', border: '1px solid var(--gold-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.64rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>
            {hiddenCount} restricted document{hiddenCount !== 1 ? 's' : ''} hidden — sign in as an authorised member to view.
          </span>
        </div>
      )}
    </ProfileDetailPanel>
  );
}

/* ── Data Category Card (right column) ── */
interface DataCategoryDef { key: string; label: string; sublabel: string; icon: React.ReactNode; imgKey: keyof typeof DATA_CARD_IMAGES; }

function DataCategoryCard({ label, sublabel, icon, imgKey, active, onClick }: Omit<DataCategoryDef, 'key'> & { active: boolean; onClick: () => void }) {
  const imgSrc = DATA_CARD_IMAGES[imgKey];
  const [hovered, setHovered] = useState(false);
  const lit = hovered || active;
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} aria-label={`${active ? 'Close' : 'View'} ${label} data`} aria-pressed={active} style={{ width: '100%', border: `2px solid ${lit ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', background: 'none', padding: 0, display: 'flex', flexDirection: 'column', boxShadow: lit ? '0 0 0 1px var(--gold-bright), 0 6px 20px rgba(0,0,0,0.6)' : '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.45)', transition: 'border-color 0.18s, box-shadow 0.18s', outline: active ? '2px solid var(--gold-bright)' : 'none', outlineOffset: 2, ...serifStyle }}>
      <div style={{ position: 'relative', width: '100%', height: 68, overflow: 'hidden', background: 'var(--forest-deep)' }}>
        <img src={imgSrc} alt={label} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block', opacity: lit ? 0.88 : 0.68, transform: lit ? 'scale(1.04)' : 'scale(1)', transition: 'opacity 0.22s, transform 0.28s ease' }} />
        <div style={{ position: 'absolute', inset: 0, background: active ? 'linear-gradient(180deg, rgba(180,140,30,0.18) 0%, rgba(14,36,22,0.55) 100%)' : 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(14,36,22,0.72) 100%)', pointerEvents: 'none', transition: 'background 0.2s' }} />
        {active && <div style={{ position: 'absolute', top: 5, right: 6, width: 16, height: 16, borderRadius: 2, background: 'var(--gold-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}><X size={9} strokeWidth={3} style={{ color: 'var(--forest-deep)' }} /></div>}
        <div style={{ position: 'absolute', top: 6, left: 7, width: 20, height: 20, borderRadius: 2, background: 'rgba(26,51,34,0.82)', border: `1px solid ${active ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.18s' }}>{icon}</div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 7px 4px', background: 'linear-gradient(0deg, rgba(14,36,22,0.88) 0%, transparent 100%)' }}><span style={{ fontSize: '0.56rem', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)', textShadow: '0 1px 3px rgba(0,0,0,0.9)', display: 'block' }}>{label}</span></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px 5px', background: lit ? 'linear-gradient(90deg, var(--forest-mid) 0%, var(--forest-light) 100%)' : 'linear-gradient(90deg, var(--forest-deep) 0%, var(--forest-mid) 100%)', borderTop: `1px solid ${active ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, transition: 'background 0.18s', minHeight: 30 }}>
        <span style={{ fontSize: '0.52rem', color: lit ? 'var(--parchment)' : 'var(--parchment-shadow)', fontStyle: 'italic', letterSpacing: '0.06em', ...serifStyle, transition: 'color 0.18s', flex: 1, textAlign: 'left', paddingRight: 4 }}>{active ? 'Tap to hide' : sublabel}</span>
        <div style={{ width: 22, height: 22, borderRadius: 2, background: active ? 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold-mid) 100%)' : lit ? 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold-mid) 100%)' : 'linear-gradient(135deg, var(--gold-mid) 0%, var(--gold-dark) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: lit ? '0 1px 6px rgba(0,0,0,0.5)' : '0 1px 3px rgba(0,0,0,0.4)', transition: 'background 0.18s, box-shadow 0.18s' }}>
          {active ? <X size={10} strokeWidth={2.5} style={{ color: 'var(--forest-deep)' }} /> : <ChevronRight size={12} strokeWidth={2.5} style={{ color: 'var(--forest-deep)', transform: lit ? 'translateX(1px)' : 'translateX(0)', transition: 'transform 0.18s ease' }} />}
        </div>
      </div>
      <div style={{ height: 2, width: '100%', background: active ? 'linear-gradient(90deg, var(--gold-mid) 0%, var(--gold-bright) 50%, var(--gold-mid) 100%)' : lit ? 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-bright) 50%, var(--gold-dark) 100%)' : 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-mid) 50%, var(--gold-dark) 100%)', transition: 'background 0.18s' }} />
    </button>
  );
}

/* ══════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════ */
export default function HorseDetail() {
  const fetchParties = usePartyStore((s) => s.fetchParties);
  useEffect(() => { fetchParties(); }, [fetchParties]);

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [leftPanel, setLeftPanel] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<string | null>(null);

  if (!id) return <Navigate to="/horses" replace />;

  const horses = useHorseStore((s) => s.horses);
  const allParties = usePartyStore((s) => s.parties);
  const articles = useArticleStore((s) => s.articles);
  const allLinks = useHorsePartyLinkStore((s) => s.links);

  // Pulled for the dossier-completeness meter (stores guard against double-fetch)
  const fetchMedia = useMediaStore((s) => s.fetchItems);
  const mediaItems = useMediaStore((s) => s.items);
  const fetchRacing = useRacingEntryStore((s) => s.fetchEntries);
  const racingEntries = useRacingEntryStore((s) => s.entries);
  const fetchSales = useSaleStore((s) => s.fetchSales);
  const sales = useSaleStore((s) => s.sales);
  const fetchReports = useReportStore((s) => s.fetchReports);
  const reports = useReportStore((s) => s.reports);
  useEffect(() => { fetchMedia(); fetchRacing(); fetchSales(); fetchReports(); }, [fetchMedia, fetchRacing, fetchSales, fetchReports]);

  const rawHorse = useMemo(() => horses.find((h) => h.id === id), [horses, id]);
  const linkedArticles = useMemo(() => articles.filter((a) => a.linkedHorseIds?.includes(id) && a.status === 'published'), [articles, id]);

  const horseLinks = useMemo(() => allLinks.filter((l) => l.horse_id === id), [allLinks, id]);

  const resolveFromLinks = useMemo(() => {
    const resolve = (relType: string): PanelParty[] => {
      return horseLinks
        .filter((l) => l.relationship_type === relType)
        .map((l) => {
          const party = allParties.find((p) => p.id === l.party_id);
          if (!party) return null;
          return { party, startDate: l.start_date, endDate: l.end_date, context: l.context, isCurrent: isCurrentLink(l) } as PanelParty;
        })
        .filter(Boolean as unknown as <T>(v: T | null) => v is T)
        .sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
    };
    return resolve;
  }, [horseLinks, allParties]);

  const resolveFromIds = useMemo(() => {
    const resolve = (ids: string[] | undefined): PanelParty[] => {
      if (!ids || ids.length === 0) return [];
      return ids
        .map((pid) => {
          const party = allParties.find((p) => p.id === pid);
          if (!party) return null;
          return { party, isCurrent: true } as PanelParty;
        })
        .filter(Boolean as unknown as <T>(v: T | null) => v is T);
    };
    return resolve;
  }, [allParties]);

  const ownerParties = useMemo(() => mergePanelParties(resolveFromLinks('ownership'), resolveFromIds(rawHorse?.ownerIds)), [resolveFromLinks, resolveFromIds, rawHorse?.ownerIds]);
  const trainerParties = useMemo(() => mergePanelParties(resolveFromLinks('training'), resolveFromIds(rawHorse?.trainerIds)), [resolveFromLinks, resolveFromIds, rawHorse?.trainerIds]);
  const jockeyParties = useMemo(() => mergePanelParties(resolveFromLinks('riding'), resolveFromIds(rawHorse?.jockeyIds)), [resolveFromLinks, resolveFromIds, rawHorse?.jockeyIds]);
  const breederParties = useMemo(() => mergePanelParties(resolveFromLinks('bred-by'), resolveFromIds(rawHorse?.breederIds)), [resolveFromLinks, resolveFromIds, rawHorse?.breederIds]);
  const agentParties = useMemo(() => mergePanelParties(resolveFromLinks('agent'), resolveFromIds(rawHorse?.bloodstockAgentIds)), [resolveFromLinks, resolveFromIds, rawHorse?.bloodstockAgentIds]);
  const personnelParties = useMemo(() => mergePanelParties(resolveFromLinks('personnel'), resolveFromIds(rawHorse?.personnelIds)), [resolveFromLinks, resolveFromIds, rawHorse?.personnelIds]);

  const syndicateFromLinks = useMemo(() => {
    return horseLinks
      .map((l) => {
        const party = allParties.find((p) => p.id === l.party_id);
        if (!party) return null;
        if (!party.roles.includes('syndicate manager')) return null;
        return { party, startDate: l.start_date, endDate: l.end_date, context: l.context, isCurrent: isCurrentLink(l) } as PanelParty;
      })
      .filter(Boolean as unknown as <T>(v: T | null) => v is T)
      .sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
  }, [horseLinks, allParties]);

  const syndicateParties = useMemo(() => mergePanelParties(syndicateFromLinks, resolveFromIds(rawHorse?.syndicateManagerIds)), [syndicateFromLinks, resolveFromIds, rawHorse?.syndicateManagerIds]);

  const horse = useMemo((): HorseData | null => {
    if (!rawHorse) return null;
    const resolveNames = (linked: PanelParty[], ids: string[] | undefined): string => {
      if (linked.length > 0) return linked.map((p) => p.party.name).join(', ');
      if (ids && ids.length > 0) {
        const names = ids.map((pid) => allParties.find((p) => p.id === pid)?.name).filter(Boolean) as string[];
        if (names.length > 0) return names.join(', ');
      }
      return '';
    };
    return {
      ...rawHorse,
      ownerDisplay: resolveNames(ownerParties, rawHorse.ownerIds),
      trainerDisplay: resolveNames(trainerParties, rawHorse.trainerIds),
      jockeyDisplay: resolveNames(jockeyParties, rawHorse.jockeyIds),
      breederDisplay: resolveNames(breederParties, rawHorse.breederIds),
      syndicateManagerDisplay: resolveNames(syndicateParties, rawHorse.syndicateManagerIds),
      bloodstockAgentDisplay: resolveNames(agentParties, rawHorse.bloodstockAgentIds),
      horseBreakersDisplay: resolveNames(personnelParties.slice(0, 1), rawHorse.personnelIds?.slice(0, 1)),
      personnelDisplay: resolveNames(personnelParties, rawHorse.personnelIds),
    };
  }, [rawHorse, allParties, ownerParties, trainerParties, jockeyParties, breederParties, syndicateParties, agentParties, personnelParties]);

  if (!horse) return <Navigate to="/horses" replace />;

  const partyContext = useMemo((): PartyContext => {
    const none: PartyContext = { primaryParty: null, allParties: [], partyIds: [], roleLabel: '', isPartyContext: false };
    if (!leftPanel) return none;
    const mapRole: Record<string, { parties: PanelParty[]; roleLabel: string }> = {
      left_owner:      { parties: ownerParties,     roleLabel: 'Owner' },
      left_breeder:    { parties: breederParties,   roleLabel: 'Breeder' },
      left_trainer:    { parties: trainerParties,   roleLabel: 'Trainer' },
      left_jockey:     { parties: jockeyParties,    roleLabel: 'Jockey' },
      left_syndicate:  { parties: syndicateParties, roleLabel: 'Syndicate Manager' },
      left_personnel:  { parties: [...agentParties, ...syndicateParties, ...personnelParties], roleLabel: 'Personnel' },
    };
    const info = mapRole[leftPanel];
    if (!info) return none;
    return {
      primaryParty: info.parties[0] ?? null,
      allParties: info.parties,
      partyIds: info.parties.map((pp) => pp.party.id),
      roleLabel: info.roleLabel,
      isPartyContext: info.parties.length > 0,
    };
  }, [leftPanel, ownerParties, breederParties, trainerParties, jockeyParties, syndicateParties, agentParties, personnelParties]);

  const activePanel = leftPanel ?? rightPanel;

  const handleLeftPanelClick = (key: string) => {
    // Re-point the whole screen to the connected party's own profile when we
    // have a structured party; fall back to the in-page panel for free-text.
    const partyForKey: Record<string, PanelParty | undefined> = {
      left_owner: ownerParties[0],
      left_breeder: breederParties[0],
      left_trainer: trainerParties[0],
      left_jockey: jockeyParties[0],
      left_syndicate: syndicateParties[0],
      left_personnel: agentParties[0] ?? syndicateParties[0] ?? personnelParties[0],
    };
    const target = partyForKey[key];
    if (target) { navigate(`/parties/${target.party.id}`); return; }
    setLeftPanel((prev) => (prev === key ? null : key));
  };

  const handleRightPanelClick = (key: string) => {
    setRightPanel((prev) => (prev === key ? null : key));
  };

  const handleCloseAll = () => {
    setLeftPanel(null);
    setRightPanel(null);
  };

  const ownerImg       = ownerParties[0]     ? partyPhoto(ownerParties[0].party, 'owner')         : FALLBACK_IMAGES.owner;
  const breederImg     = breederParties[0]   ? partyPhoto(breederParties[0].party, 'breeder')      : FALLBACK_IMAGES.breeder;
  const trainerImg     = trainerParties[0]   ? partyPhoto(trainerParties[0].party, 'trainer')      : FALLBACK_IMAGES.trainer;
  const personnelImg   = agentParties[0]     ? partyPhoto(agentParties[0].party, 'personnel')
                       : syndicateParties[0] ? partyPhoto(syndicateParties[0].party, 'personnel')
                       : personnelParties[0] ? partyPhoto(personnelParties[0].party, 'personnel')  : FALLBACK_IMAGES.personnel;
  const jockeyImg      = jockeyParties[0]    ? partyPhoto(jockeyParties[0].party, 'jockey')        : FALLBACK_IMAGES.jockey;
  const syndicateImg   = syndicateParties[0] ? partyPhoto(syndicateParties[0].party, 'syndicate')  : FALLBACK_IMAGES.syndicate;

  const ownerSecondary   = ownerParties[0]     ? [ownerParties[0].party.base_location, ownerParties[0].party.country_of_birth].filter(Boolean).join(' · ') || 'Registered owner'     : 'Not Recorded';
  const breederSecondary = breederParties[0]   ? [breederParties[0].party.base_location, breederParties[0].party.country_of_birth].filter(Boolean).join(' · ') || 'Registered breeder' : 'Not Recorded';
  const trainerSecondary = trainerParties[0]   ? [trainerParties[0].party.base_location, trainerParties[0].party.country_of_birth].filter(Boolean).join(' · ') || 'Licensed trainer'   : 'Not Recorded';
  const jockeySecondary  = jockeyParties[0]    ? [jockeyParties[0].party.base_location, horse.careerRecord ? `Record: ${horse.careerRecord}` : undefined].filter(Boolean).join(' · ') || 'Race Ride History' : 'Not Recorded';
  const syndicateSecondary = syndicateParties[0] ? [syndicateParties[0].party.base_location, syndicateParties[0].party.profession].filter(Boolean).join(' · ') || 'Syndicate Manager'  : 'Not Recorded';

  const allPersonnelCount = agentParties.length + syndicateParties.length + personnelParties.length;
  const personnelPrimaryName = agentParties[0]?.party.name ?? syndicateParties[0]?.party.name ?? personnelParties[0]?.party.name ?? 'Stable Personnel';
  const personnelSecondary = allPersonnelCount > 1
    ? `${allPersonnelCount} parties on file`
    : (agentParties[0] ?? syndicateParties[0] ?? personnelParties[0])?.party.base_location ?? 'Agents · Breaker · Associates';

  const ownerRows: DataRow[] = ownerParties.length > 0
    ? ownerParties.flatMap(({ party, startDate, isCurrent }) => [
        { label: 'Owner', value: party.name },
        ...(party.base_location ? [{ label: 'Location', value: party.base_location }] : []),
        ...(startDate ? [{ label: 'Since', value: fmtYear(startDate) }] : []),
        { label: 'Status', value: isCurrent ? 'Current' : 'Past' },
      ])
    : [{ label: 'Owner', value: horse.ownerDisplay || 'Not recorded' }];

  const breederRows: DataRow[] = breederParties.length > 0
    ? breederParties.flatMap(({ party }) => [
        { label: 'Breeder', value: party.name },
        ...(party.base_location ? [{ label: 'Stud / Location', value: party.base_location }] : []),
        ...(party.started_year ? [{ label: 'Est.', value: String(party.started_year) }] : []),
        ...(horse.sire ? [{ label: 'Sire', value: horse.sire }] : []),
        ...(horse.dam ? [{ label: 'Dam', value: horse.dam }] : []),
      ])
    : [{ label: 'Breeder', value: horse.breederDisplay || 'Not recorded' }, ...(horse.sire ? [{ label: 'Sire', value: horse.sire }] : []), ...(horse.dam ? [{ label: 'Dam', value: horse.dam }] : [])];

  const trainerRows: DataRow[] = trainerParties.length > 0
    ? trainerParties.flatMap(({ party, startDate, isCurrent }) => [
        { label: 'Trainer', value: party.name },
        ...(party.base_location ? [{ label: 'Stable', value: party.base_location }] : []),
        ...(startDate ? [{ label: 'Since', value: fmtYear(startDate) }] : []),
        { label: 'Status', value: isCurrent ? 'Current' : 'Past' },
      ])
    : [{ label: 'Trainer', value: horse.trainerDisplay || 'Not recorded' }];

  const personnelRows: DataRow[] = [
    ...(agentParties.length > 0 ? [{ label: 'Bloodstock Agent', value: agentParties.map((p) => p.party.name).join(', ') }] : [{ label: 'Bloodstock Agent', value: horse.bloodstockAgentDisplay || '—' }]),
    ...(syndicateParties.length > 0 ? [{ label: 'Syndicate Mgr', value: syndicateParties.map((p) => p.party.name).join(', ') }] : [{ label: 'Syndicate Mgr', value: horse.syndicateManagerDisplay || '—' }]),
    ...(personnelParties.length > 0 ? [{ label: 'Personnel', value: personnelParties.map((p) => p.party.name).join(', ') }] : [{ label: 'Horse Breaker', value: horse.horseBreakersDisplay || '—' }]),
  ];

  const jockeyRows: DataRow[] = jockeyParties.length > 0
    ? jockeyParties.flatMap(({ party, isCurrent }) => [
        { label: 'Jockey', value: party.name },
        ...(party.base_location ? [{ label: 'Base', value: party.base_location }] : []),
        { label: 'Status', value: isCurrent ? 'Current' : 'Past' },
        ...(horse.careerRecord ? [{ label: 'Career', value: horse.careerRecord }] : []),
      ])
    : [{ label: 'Jockey', value: horse.jockeyDisplay || 'Not recorded' }, ...(horse.careerRecord ? [{ label: 'Career', value: horse.careerRecord }] : [])];

  const syndicateMgrRows: DataRow[] = syndicateParties.length > 0
    ? syndicateParties.flatMap(({ party, startDate, isCurrent }) => [
        { label: 'Manager', value: party.name },
        ...(party.base_location ? [{ label: 'Location', value: party.base_location }] : []),
        ...(startDate ? [{ label: 'Since', value: fmtYear(startDate) }] : []),
        { label: 'Status', value: isCurrent ? 'Current' : 'Past' },
      ])
    : [{ label: 'Manager', value: horse.syndicateManagerDisplay || 'Not recorded' }];

  // Data categories — Token Data removed
  const dataCategories: DataCategoryDef[] = [
    { key: 'media',    label: 'Media Data',     sublabel: 'Photos, video & press',      icon: <Camera       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'media' },
    { key: 'racing',   label: 'Racing Data',    sublabel: 'Entries, results & form',    icon: <TrendingUp   size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'racing' },
    { key: 'breeding', label: 'Breeding Data',  sublabel: 'Foaling & paddock history',  icon: <Heart        size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'breeding' },
    { key: 'sales',    label: 'Sales Data',     sublabel: 'Auction & transfer history', icon: <ShoppingCart size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'sales' },
    { key: 'pedigree', label: 'Pedigree Data',  sublabel: 'Bloodlines & family tree',   icon: <Wand         size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'pedigree' },
    { key: 'studbook', label: 'Stud Book Data', sublabel: 'Official registry entries',  icon: <Binary       size={11} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />, imgKey: 'studbook' },
  ];

  type PartyHeroMeta = { imgSrc: string; partyName: string; roleLabel: string; secondaryLine: string } | null;

  const getPartyHeroMeta = (): PartyHeroMeta => {
    if (!leftPanel) return null;
    switch (leftPanel) {
      case 'left_owner': { const p = ownerParties[0]; if (!p) return null; return { imgSrc: partyPhoto(p.party, 'owner'), partyName: p.party.name, roleLabel: 'Owner', secondaryLine: ownerSecondary }; }
      case 'left_breeder': { const p = breederParties[0]; if (!p) return null; return { imgSrc: partyPhoto(p.party, 'breeder'), partyName: p.party.name, roleLabel: 'Breeder', secondaryLine: breederSecondary }; }
      case 'left_trainer': { const p = trainerParties[0]; if (!p) return null; return { imgSrc: partyPhoto(p.party, 'trainer'), partyName: p.party.name, roleLabel: 'Trainer', secondaryLine: trainerSecondary }; }
      case 'left_personnel': { const p = agentParties[0] ?? syndicateParties[0] ?? personnelParties[0]; if (!p) return null; return { imgSrc: partyPhoto(p.party, 'personnel'), partyName: p.party.name, roleLabel: p.party.roles[0] ?? 'Personnel', secondaryLine: personnelSecondary }; }
      case 'left_jockey': { const p = jockeyParties[0]; if (!p) return null; return { imgSrc: partyPhoto(p.party, 'jockey'), partyName: p.party.name, roleLabel: 'Jockey', secondaryLine: jockeySecondary }; }
      case 'left_syndicate': { const p = syndicateParties[0]; if (!p) return null; return { imgSrc: partyPhoto(p.party, 'syndicate'), partyName: p.party.name, roleLabel: 'Syndicate Manager', secondaryLine: syndicateSecondary }; }
      default: return null;
    }
  };

  const partyHeroMeta = getPartyHeroMeta();
  const isLeftPanelActive = leftPanel !== null;
  const crestPartyName = isLeftPanelActive ? (partyHeroMeta?.partyName ?? undefined) : undefined;

  const horseName = horse.isUnnamed ? 'Un-Named' : horse.name;

  // ── Dossier completeness (gamification) ──
  const hasStudBook = !!(rawHorse?.registrationNumber || rawHorse?.microchip || rawHorse?.passportNumber || rawHorse?.brandFreeze);
  const hasFamilyTreeMain = !!(rawHorse?.sire || rawHorse?.dam || rawHorse?.sireSire || rawHorse?.damSire);
  const dossierFlags = [
    ownerParties.length > 0,
    breederParties.length > 0,
    trainerParties.length > 0,
    jockeyParties.length > 0,
    (agentParties.length + syndicateParties.length + personnelParties.length) > 0,
    hasFamilyTreeMain,
    mediaItems.filter((m) => m.horse_id === id).length > 0,
    racingEntries.filter((e) => e.horse_id === id).length > 0,
    sales.filter((s) => s.horse_id === id).length > 0,
    hasStudBook,
    reports.filter((r) => r.horse_id === id).length > 0,
    linkedArticles.length > 0,
  ];
  const dossierFilled = dossierFlags.filter(Boolean).length;
  const dossierTotal = dossierFlags.length;

  // Size string (hands + metric) for the crest subtitle
  const sizeStr = rawHorse?.handsSize
    ? `${rawHorse.handsSize}hh${rawHorse.metricSize ? ` · ${rawHorse.metricSize}m` : ''}`
    : undefined;

  const closeLeft = () => setLeftPanel(null);
  const closeRight = () => setRightPanel(null);

  const renderCentreContent = () => {
    if (leftPanel) {
      switch (leftPanel) {
        case 'left_owner':     return <OwnerDetailPanel parties={ownerParties} horse={horse} onClose={closeLeft} />;
        case 'left_breeder':   return <BreederDetailPanel parties={breederParties} horse={horse} onClose={closeLeft} />;
        case 'left_trainer':   return <TrainerDetailPanel parties={trainerParties} horse={horse} onClose={closeLeft} />;
        case 'left_personnel': return <PersonnelDetailPanel parties={personnelParties} agentParties={agentParties} syndicateParties={syndicateParties} horse={horse} onClose={closeLeft} />;
        case 'left_jockey':    return <JockeyDetailPanel parties={jockeyParties} horse={horse} onClose={closeLeft} />;
        case 'left_syndicate': return <SyndicateManagerDetailPanel parties={syndicateParties} horse={horse} onClose={closeLeft} />;
      }
    }
    if (rightPanel) {
      switch (rightPanel) {
        case 'media':    return <MediaSection horseId={id} horseName={horseName} onClose={closeRight} partyContext={partyContext} />;
        case 'racing':   return <RacingSection horseId={id} horseName={horseName} horse={horse} onClose={closeRight} partyContext={partyContext} />;
        case 'breeding': return <BreedingSection horse={horse} onClose={closeRight} partyContext={partyContext} />;
        case 'sales':    return <SalesSection horse={horse} onClose={closeRight} partyContext={partyContext} />;
        case 'pedigree': return <PedigreeSection horse={horse} onClose={closeRight} partyContext={partyContext} />;
        case 'studbook': return <StudBookSection horse={horse} onClose={closeRight} partyContext={partyContext} />;
        case 'reports':  return <ReportsSection horse={horse} onClose={closeRight} />;
      }
    }
    return null;
  };

  const centreContent = renderCentreContent();
  const anythingOpen = leftPanel !== null || rightPanel !== null;

  const renderRightPanelSectionWhenLeftActive = () => {
    if (!leftPanel || !rightPanel) return null;
    switch (rightPanel) {
      case 'media':    return <MediaSection horseId={id} horseName={horseName} onClose={closeRight} partyContext={partyContext} />;
      case 'racing':   return <RacingSection horseId={id} horseName={horseName} horse={horse} onClose={closeRight} partyContext={partyContext} />;
      case 'breeding': return <BreedingSection horse={horse} onClose={closeRight} partyContext={partyContext} />;
      case 'sales':    return <SalesSection horse={horse} onClose={closeRight} partyContext={partyContext} />;
      case 'pedigree': return <PedigreeSection horse={horse} onClose={closeRight} partyContext={partyContext} />;
      case 'studbook': return <StudBookSection horse={horse} onClose={closeRight} partyContext={partyContext} />;
      case 'reports':  return <ReportsSection horse={horse} onClose={closeRight} />;
      default: return null;
    }
  };

  const rightSectionContent = renderRightPanelSectionWhenLeftActive();

  const activePanelLabel = (() => {
    if (leftPanel) {
      const map: Record<string, string> = {
        left_owner: 'Owners Data', left_breeder: 'Breeders Data', left_trainer: 'Trainers Data',
        left_personnel: 'Personnel Data', left_jockey: "Jockey(s) Data",
        left_syndicate: 'Syndicate Manager',
      };
      return map[leftPanel] ?? leftPanel;
    }
    if (rightPanel) {
      if (rightPanel === 'reports') return 'Reports / Forms';
      return dataCategories.find((c) => c.key === rightPanel)?.label ?? rightPanel;
    }
    return null;
  })();

  return (
    <div className="horse-page">
      {/* Breadcrumb */}
      <div style={{ background: 'linear-gradient(90deg, var(--forest-deep) 0%, var(--forest-mid) 100%)', borderBottom: '2px solid var(--gold-dark)', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, ...serifStyle }}>
        <button onClick={() => navigate('/horses')} style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', background: 'none', border: 'none', cursor: 'pointer', ...serifStyle }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--gold-bright)'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--gold-mid)'; }}>Thoroughbreds</button>
        <ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} />
        <button onClick={handleCloseAll} style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: anythingOpen ? 'var(--gold-mid)' : 'var(--parchment)', background: 'none', border: 'none', cursor: anythingOpen ? 'pointer' : 'default', ...serifStyle }} onMouseEnter={(e) => { if (anythingOpen) (e.currentTarget as HTMLElement).style.color = 'var(--gold-bright)'; }} onMouseLeave={(e) => { if (anythingOpen) (e.currentTarget as HTMLElement).style.color = 'var(--gold-mid)'; }}>{horseName}</button>
        {activePanelLabel && (<><ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} /><span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-bright)', ...serifStyle }}>{activePanelLabel}</span></>)}
        {partyContext.isPartyContext && rightPanel && (
          <>
            <ChevronRight size={10} style={{ color: 'var(--gold-dark)' }} />
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--gold-mid)', ...serifStyle, fontStyle: 'italic' }}>
              {partyContext.primaryParty?.party.name}
            </span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-dark)', ...serifStyle }}>Stable Press · Racing Almanac</span>
      </div>

      {/* 3-column grid */}
      <div className="horse-grid">

        {/* LEFT — Profile Data */}
        <div className="horse-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Profile Data</span>
            <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
          </div>

          <DataPanel title="Owners Data" icon={<User size={12} strokeWidth={1.8} />} rows={ownerRows} badge={ownerParties.length > 0 ? `${ownerParties.length} linked` : 'Cur + Past'} imgSrc={ownerImg} primaryName={horse.ownerDisplay || 'Not Recorded'} secondaryLine={ownerSecondary} panelKey="left_owner" activePanel={leftPanel} onPanelClick={handleLeftPanelClick} />
          <DataPanel title="Breeders Data" icon={<BookOpen size={12} strokeWidth={1.8} />} rows={breederRows} imgSrc={breederImg} primaryName={horse.breederDisplay || 'Not Recorded'} secondaryLine={breederSecondary} panelKey="left_breeder" activePanel={leftPanel} onPanelClick={handleLeftPanelClick} />
          <DataPanel title="Trainers Data" icon={<Briefcase size={12} strokeWidth={1.8} />} rows={trainerRows} badge={trainerParties.length > 0 ? `${trainerParties.length} linked` : 'Cur + Past'} imgSrc={trainerImg} primaryName={horse.trainerDisplay || 'Not Recorded'} secondaryLine={trainerSecondary} panelKey="left_trainer" activePanel={leftPanel} onPanelClick={handleLeftPanelClick} />
          <DataPanel title="Personnel Data" icon={<Users size={12} strokeWidth={1.8} />} rows={personnelRows} imgSrc={personnelImg} primaryName={personnelPrimaryName} secondaryLine={personnelSecondary} panelKey="left_personnel" activePanel={leftPanel} onPanelClick={handleLeftPanelClick} />
          <DataPanel title="Jockey(s) Data" icon={<Flag size={12} strokeWidth={1.8} />} rows={jockeyRows} badge={jockeyParties.length > 0 ? `${jockeyParties.length} rides` : 'All Rides'} imgSrc={jockeyImg} primaryName={horse.jockeyDisplay || 'Not Recorded'} secondaryLine={jockeySecondary} panelKey="left_jockey" activePanel={leftPanel} onPanelClick={handleLeftPanelClick} />
          <DataPanel title="Syndicate Manager" icon={<Shield size={12} strokeWidth={1.8} />} rows={syndicateMgrRows} imgSrc={syndicateImg} primaryName={horse.syndicateManagerDisplay || 'Not Recorded'} secondaryLine={syndicateSecondary} panelKey="left_syndicate" activePanel={leftPanel} onPanelClick={handleLeftPanelClick} />

          <button onClick={() => handleRightPanelClick('reports')} aria-label="Reports and Forms" aria-pressed={rightPanel === 'reports'} style={{ marginTop: 2, width: '100%', border: `2px solid ${rightPanel === 'reports' ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', boxShadow: rightPanel === 'reports' ? '0 0 0 1px var(--gold-bright), 0 4px 16px rgba(180,140,30,0.35)' : '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', background: 'none', padding: 0, ...serifStyle }}>
            <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', boxShadow: '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} /><span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)', textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>Reports / Forms</span></div>
            <div style={{ background: 'var(--parchment)', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '0.64rem', color: 'var(--forest-deep)', fontWeight: 600, fontStyle: 'italic', ...serifStyle }}>Official documents &amp; reports</span>{rightPanel === 'reports' ? <X size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />}</div>
          </button>
          <button onClick={() => navigate('/horses')} className="sku-gold-btn" style={{ marginTop: 4, padding: '7px 0', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...serifStyle }}>
            <ChevronRight size={12} style={{ color: 'var(--forest-deep)', transform: 'rotate(180deg)' }} />
            <span style={{ fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--forest-deep)', fontWeight: 700 }}>View All Horses</span>
          </button>
        </div>

        {/* CENTER */}
        <div className="horse-col" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sku-gold-card">
            <OrnateCrest
              name={horseName}
              subtitle={[horse.sex, horse.colour, sizeStr, horse.country, horse.dob ? new Date(horse.dob).getFullYear() + ' foal' : undefined].filter(Boolean).join(' · ')}
              partyName={crestPartyName}
            />
            {/* Gamification bar: Follow + dossier completeness */}
            <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <FollowButton horseId={horse.id} />
              <DossierMeter filled={dossierFilled} total={dossierTotal} />
            </div>
            <div style={{ padding: '10px 14px 12px', display: 'flex', justifyContent: 'center', background: 'var(--forest-deep)' }}>
              <AskAgentButton
                variant="ornate"
                prompt="Tell me about this horse — its connections, recent form, and anything notable."
                label="Ask about this horse"
              />
            </div>
          </div>

          {anythingOpen ? (
            <>
              {partyHeroMeta && leftPanel && (
                <PartyHeroImage imgSrc={partyHeroMeta.imgSrc} partyName={partyHeroMeta.partyName} roleLabel={partyHeroMeta.roleLabel} secondaryLine={partyHeroMeta.secondaryLine} onClose={closeLeft} />
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={activePanel ?? 'none'}
                  initial={{ opacity: 0, y: 8, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {centreContent}
                </motion.div>
              </AnimatePresence>

              {leftPanel && rightSectionContent && (
                <div style={{ marginTop: 4 }}>
                  {rightSectionContent}
                </div>
              )}

              <ConnectionsPanel horse={horse} />
              <ArticlesPanel articles={linkedArticles} horseName={horseName} />
            </>
          ) : (
            <>
              {/* Identity card + Pedigree preview row (matches FR reference) */}
              <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 14, alignItems: 'stretch' }}>
                {/* Identity card */}
                <div className="sku-gold-card" style={{ ...serifStyle, display: 'flex', flexDirection: 'column' }}>
                  <div className="sku-green-header" style={{ padding: '7px 12px', textAlign: 'center' }}>
                    <span style={{ ...goldStyle, fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.04em', ...serifStyle }}>{horseName}</span>
                  </div>
                  <div className="sku-parchment" style={{ padding: '10px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {[
                      { label: 'DOB', value: horse.dob ? fmtDate(horse.dob) : '—' },
                      { label: 'Sex', value: horse.sex || '—' },
                      { label: 'Colour', value: horse.colour || '—' },
                      ...(sizeStr ? [{ label: 'Size', value: sizeStr }] : []),
                      { label: 'Country', value: horse.country || '—' },
                    ].map(({ label, value }, i, arr) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: i < arr.length - 1 ? '1px solid var(--parchment-shadow)' : undefined, paddingBottom: 5, marginBottom: 5, gap: 8 }}>
                        <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, flexShrink: 0 }}>{label}</dt>
                        <dd style={{ fontSize: '0.72rem', color: 'var(--forest-deep)', fontWeight: 700, textAlign: 'right', margin: 0 }}>{value}</dd>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pedigree preview */}
                <div className="sku-gold-card" style={{ ...serifStyle, display: 'flex', flexDirection: 'column' }}>
                  <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BookMarked size={12} style={{ color: 'var(--gold-bright)' }} />
                    <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>Pedigree of {horseName}</span>
                  </div>
                  <div className="sku-parchment" style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {hasFamilyTreeMain ? (
                      <div style={{ display: 'flex', height: '100%', minHeight: 96 }}>
                        {/* Sire branch */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <PedCell name={horse.sire} label="Sire" strong />
                          <PedCell name={horse.sireSire} label="Sire's Sire" />
                          <PedCell name={horse.sireDam} label="Sire's Dam" />
                        </div>
                        {/* Dam branch */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 6 }}>
                          <PedCell name={horse.dam} label="Dam" strong />
                          <PedCell name={horse.damSire} label="Dam's Sire" />
                          <PedCell name={horse.damDam} label="Dam's Dam" />
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.68rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', textAlign: 'center', margin: 'auto' }}>Pedigree not on file.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Horse photo — fixed, prominent height; page scrolls if needed */}
              <div style={{ height: 'clamp(300px, 44vh, 500px)', minHeight: 300, position: 'relative', border: '3px solid var(--gold-mid)', boxShadow: '0 0 0 1px var(--gold-dark), 0 6px 24px rgba(0,0,0,0.7)', borderRadius: 4, overflow: 'hidden', background: 'var(--forest-deep)' }}>
                <img src={horse.imageUrl || HERO_IMAGE} alt={horseName} crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.5) 100%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(26,51,34,0.92) 0%, rgba(26,51,34,0.55) 65%, transparent 100%)', padding: '24px 16px 10px', ...serifStyle }}>
                  <div style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-bright)', marginBottom: 2 }}>Featured Thoroughbred</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--parchment)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{horseName}</div>
                </div>
              </div>

              {/* Racing Summary */}
              <div className="sku-gold-card" style={{ ...serifStyle }}>
                <div className="sku-green-header" style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trophy size={12} style={{ color: 'var(--gold-bright)' }} />
                  <span style={{ ...goldStyle, fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700 }}>Racing Summary</span>
                </div>
                <div className="sku-parchment" style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {[
                    { label: 'Career', value: horse.careerRecord || '—' },
                    { label: 'Winnings', value: horse.careerWinnings ? '$' + horse.careerWinnings.toLocaleString('en-AU') : '—' },
                    { label: 'Last 10', value: horse.lastTenForm || '—' },
                    { label: 'Season', value: horse.seasonRecord || '—' },
                    { label: 'Rating', value: horse.currentRating ? String(horse.currentRating) : '—' },
                  ].map((s) => (
                    <div key={s.label} style={{ textAlign: 'center', padding: '4px 2px', borderRight: s.label !== 'Rating' ? '1px solid var(--parchment-dark)' : undefined }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle, lineHeight: 1.1, wordBreak: 'break-word' }}>{s.value}</div>
                      <div style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT — Data Sections */}
        <div className="horse-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderBottom: '2px solid var(--gold-dark)', paddingBottom: 6, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-bright)', fontWeight: 700, ...serifStyle }}>Data Sections</span>
            <span style={{ fontSize: '0.5rem', color: 'var(--gold-dark)', ...serifStyle }}>✦</span>
          </div>

          {partyContext.isPartyContext && (
            <div style={{ padding: '5px 8px', background: 'linear-gradient(90deg, rgba(180,140,30,0.2) 0%, rgba(26,51,34,0.6) 100%)', border: '1px solid var(--gold-mid)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold-bright)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.52rem', color: 'var(--gold-bright)', ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {partyContext.primaryParty?.party.name}
              </span>
            </div>
          )}

          {dataCategories.map((cat) => (
            <DataCategoryCard key={cat.key} label={cat.label} sublabel={cat.sublabel} icon={cat.icon} imgKey={cat.imgKey} active={rightPanel === cat.key} onClick={() => handleRightPanelClick(cat.key)} />
          ))}

          {partyContext.isPartyContext && (
            <button onClick={() => setLeftPanel(null)} style={{ marginTop: 2, padding: '6px 8px', background: 'rgba(180,140,30,0.12)', border: '1px solid var(--gold-dark)', borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, ...serifStyle }}>
              <X size={10} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.5rem', color: 'var(--gold-mid)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Clear Party Filter</span>
            </button>
          )}

          <div style={{ marginTop: 6, padding: '8px 10px', border: '1px solid var(--gold-dark)', borderRadius: 3, background: 'rgba(26,51,34,0.5)', textAlign: 'center', ...serifStyle }}>
            <span style={{ fontSize: '0.5rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-dark)', display: 'block' }}>✦ Stable Press ✦</span>
            <span style={{ fontSize: '0.52rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', display: 'block', marginTop: 3 }}>Racing Almanac</span>
          </div>
        </div>
      </div>

      <style>{`
        .horse-page {
          background: linear-gradient(180deg, var(--forest-deep) 0%, #111e17 100%);
          min-height: calc(100vh - var(--navbar-h, 112px));
          display: flex;
          flex-direction: column;
        }
        .horse-grid {
          display: grid;
          grid-template-columns: minmax(200px, 260px) 1fr minmax(130px, 170px);
          gap: 16px;
          padding: 14px 20px 32px;
          max-width: 1320px;
          margin: 0 auto;
          width: 100%;
          flex: 1;
          align-items: start;
        }
        .horse-col {
          min-width: 0;
        }
        @media (max-width: 900px) {
          .horse-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
