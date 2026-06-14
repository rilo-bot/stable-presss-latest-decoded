import { useState } from 'react';
import { ChevronRight, X, User } from 'lucide-react';
import type { Party } from '@/types/party';
import type { MediaType } from '@/types/mediaItem';
import type { RaceStatus } from '@/types/racingEntry';
import type { PanelParty } from '@/lib/profile/types';

/* ─── Shared style tokens ─── */
export const serifStyle: React.CSSProperties = { fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif" };
export const goldStyle: React.CSSProperties = { color: 'var(--gold-bright)', textShadow: '0 1px 3px rgba(0,0,0,0.7)' };

/* ─── Data-card image keys (kept as a TYPE only — no stock imagery is rendered) ─── */
export type DataCardImgKey = 'media' | 'racing' | 'breeding' | 'sales' | 'pedigree' | 'studbook' | 'horses';

export interface DataRow { label: string; value: string; }

/* ─── Helpers ─── */
/** A party's real uploaded photo, or undefined — callers render an icon placeholder (no stock images). */
export function partyPhoto(party: Party | undefined, _roleKey?: string): string | undefined {
  return party?.photo || undefined;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

export function fmtYear(iso?: string | null): string {
  if (!iso) return '—';
  try { return String(new Date(iso).getFullYear()); } catch { return iso; }
}

export function fmtMoney(amount?: number, currency = 'AUD'): string {
  if (amount === undefined || amount === null) return '—';
  return `${currency === 'NZD' ? 'NZ$' : '$'}${amount.toLocaleString('en-AU')}`;
}

/* ─── Avatar — real photo, else a clean icon placeholder (never a stock image) ─── */
export function Avatar({ src, alt, size, icon, radius = 3 }: { src?: string; alt: string; size: number; icon?: React.ReactNode; radius?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', border: '1px solid var(--gold-mid)', background: 'linear-gradient(135deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {src
        ? <img src={src} alt={alt} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }} />
        : <span style={{ color: 'var(--gold-mid)', display: 'flex' }}>{icon ?? <User size={Math.round(size * 0.5)} strokeWidth={1.6} />}</span>}
    </div>
  );
}

/* ─── Decorative card header band (gradient + icon — replaces stock photo headers) ─── */
function HeaderBand({ icon, title, eyebrow, onClose, height = 110 }: { icon: React.ReactNode; title: string; eyebrow: string; onClose: () => void; height?: number }) {
  return (
    <div style={{ position: 'relative', height, overflow: 'hidden', background: 'linear-gradient(135deg, var(--forest-mid) 0%, var(--forest-deep) 100%)' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,224,154,0.12) 1px, transparent 0)', backgroundSize: '14px 14px' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 14px 10px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 3, background: 'rgba(26,51,34,0.85)', border: '1px solid var(--gold-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
          <div><div style={{ fontSize: '0.52rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-mid)', marginBottom: 1 }}>{eyebrow}</div><div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--parchment)', textShadow: '0 1px 4px rgba(0,0,0,0.9)', lineHeight: 1, ...serifStyle }}>{title}</div></div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ width: 26, height: 26, borderRadius: 2, border: '1px solid var(--gold-dark)', background: 'rgba(26,51,34,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={13} style={{ color: 'var(--gold-bright)' }} /></button>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-bright) 50%, var(--gold-dark) 100%)' }} />
    </div>
  );
}

/* ─── Ornate crest header ─── */
export function OrnateCrest({ name, subtitle, partyName, compact }: { name: string; subtitle: string; partyName?: string; compact?: boolean }) {
  const corner = compact ? 5 : 8;
  const dividerMb = compact ? 5 : 10;
  return (
    <div className="sku-crest" style={{ padding: compact ? '9px 18px 7px' : '18px 20px 14px', textAlign: 'center', position: 'relative' }}>
      <span style={{ position: 'absolute', top: corner, left: 12, color: 'var(--gold-mid)', fontSize: '0.7rem', ...serifStyle }}>✦</span>
      <span style={{ position: 'absolute', top: corner, right: 12, color: 'var(--gold-mid)', fontSize: '0.7rem', ...serifStyle }}>✦</span>
      <div className="sku-divider" style={{ marginBottom: dividerMb }} />
      <div style={{ fontSize: compact ? '0.5rem' : '0.55rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-mid)', textShadow: '0 1px 3px rgba(0,0,0,0.8)', marginBottom: compact ? 2 : 4, ...serifStyle }}>{subtitle ? 'Stable Press' : 'Stable Press · Profile'}</div>
      <h1 style={{ fontSize: compact ? 'clamp(1.05rem, 2.2vw, 1.35rem)' : 'clamp(1.2rem, 3vw, 1.7rem)', fontWeight: 700, lineHeight: 1.15, color: 'var(--parchment)', textShadow: '0 2px 6px rgba(0,0,0,0.8)', margin: compact ? '1px 0' : '4px 0', ...serifStyle }}>{name}</h1>
      {partyName && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '6px 0 2px' }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, var(--gold-dark))' }} />
            <span style={{ fontSize: '0.48rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold-dark)', ...serifStyle }}>·</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--gold-dark), transparent)' }} />
          </div>
          <h2 style={{ fontSize: compact ? 'clamp(0.95rem, 2vw, 1.2rem)' : 'clamp(1.05rem, 2.5vw, 1.45rem)', fontWeight: 700, lineHeight: 1.2, color: 'var(--gold-bright)', textShadow: '0 2px 8px rgba(0,0,0,0.85)', margin: '2px 0 4px', ...serifStyle }}>{partyName}</h2>
        </>
      )}
      {(subtitle || !compact) && <div style={{ fontSize: compact ? '0.58rem' : '0.65rem', fontStyle: 'italic', color: partyName ? 'var(--gold-mid)' : 'var(--gold-bright)', textShadow: '0 1px 3px rgba(0,0,0,0.7)', ...serifStyle, marginBottom: dividerMb }}>{subtitle}</div>}
      <div className="sku-divider" />
      <span style={{ position: 'absolute', bottom: corner, left: 12, color: 'var(--gold-mid)', fontSize: '0.7rem', ...serifStyle }}>✦</span>
      <span style={{ position: 'absolute', bottom: corner, right: 12, color: 'var(--gold-mid)', fontSize: '0.7rem', ...serifStyle }}>✦</span>
    </div>
  );
}

/* ─── Section panel shell (record modules) ─── */
export function SectionPanel({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; imgKey?: DataCardImgKey; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sku-gold-card" style={{ ...serifStyle, overflow: 'hidden' }}>
      <HeaderBand icon={icon} title={title} eyebrow="Stable Press · Data Hub" onClose={onClose} />
      <div className="sku-parchment" style={{ padding: '14px 14px 16px' }}>{children}</div>
    </div>
  );
}

export function SRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--parchment-shadow)', paddingBottom: 6, marginBottom: 6, gap: 8 }}>
      <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, flexShrink: 0 }}>{label}</dt>
      <dd style={{ fontSize: '0.72rem', color: highlight ? 'var(--gold-bright)' : 'var(--forest-deep)', fontWeight: 600, textAlign: 'right', margin: 0 }}>{value}</dd>
    </div>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--parchment-shadow)', fontWeight: 700, marginBottom: 8, marginTop: 14, borderTop: '1px solid var(--parchment-dark)', paddingTop: 10 }}>{children}</p>;
}

/* ─── Profile detail panel shell (entity / reports) ─── */
export function ProfileDetailPanel({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sku-gold-card" style={{ ...serifStyle, overflow: 'hidden' }}>
      <HeaderBand icon={icon} title={title} eyebrow="Stable Press · Profile Hub" onClose={onClose} />
      <div className="sku-parchment" style={{ padding: '14px 14px 16px' }}>{children}</div>
    </div>
  );
}

export function PSRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--parchment-shadow)', paddingBottom: 6, marginBottom: 6, gap: 8 }}>
      <dt style={{ fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--parchment-shadow)', fontWeight: 700, flexShrink: 0 }}>{label}</dt>
      <dd style={{ fontSize: '0.72rem', color: highlight ? 'var(--gold-bright)' : 'var(--forest-deep)', fontWeight: 600, textAlign: 'right', margin: 0 }}>{value}</dd>
    </div>
  );
}

/* ─── Media / race badges ─── */
const MEDIA_TYPE_BADGE_COLORS: Record<MediaType, React.CSSProperties> = {
  Article:         { background: 'linear-gradient(90deg,#2d5a3d,#3a7050)', color: 'var(--gold-bright)' },
  Photo:           { background: 'linear-gradient(90deg,#3b4a20,#516430)', color: 'var(--gold-bright)' },
  Video:           { background: 'linear-gradient(90deg,#3d2d42,#5a3a68)', color: 'var(--gold-bright)' },
  'Press Release': { background: 'linear-gradient(90deg,#3d2d20,#5a4030)', color: 'var(--gold-bright)' },
  Publication:     { background: 'linear-gradient(90deg,#1e3d48,#2a5568)', color: 'var(--gold-bright)' },
};
const MEDIA_TYPE_ICONS: Record<MediaType, string> = { Article: '📰', Photo: '📷', Video: '🎬', 'Press Release': '📢', Publication: '📖' };

export function MediaTypeBadge({ type }: { type: MediaType }) {
  const style = MEDIA_TYPE_BADGE_COLORS[type] ?? {};
  return (
    <span style={{ ...style, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 2, display: 'inline-flex', alignItems: 'center', gap: 3, border: '1px solid rgba(255,224,154,0.2)', flexShrink: 0 }}>
      <span>{MEDIA_TYPE_ICONS[type]}</span><span>{type}</span>
    </span>
  );
}

export function RaceStatusBadge({ status }: { status: RaceStatus }) {
  const colors: Record<RaceStatus, { bg: string; text: string }> = {
    Entered:   { bg: 'rgba(26,51,34,0.85)', text: 'var(--gold-mid)' },
    Accepted:  { bg: 'rgba(20,55,20,0.9)',  text: 'var(--gold-bright)' },
    Scratched: { bg: 'rgba(80,20,20,0.6)',  text: '#e09090' },
    Declared:  { bg: 'rgba(20,40,80,0.8)',  text: '#90b0e0' },
    Finished:  { bg: 'rgba(40,30,10,0.85)', text: 'var(--gold-bright)' },
  };
  const c = colors[status] ?? colors.Entered;
  return (
    <span style={{ background: c.bg, color: c.text, fontSize: '0.5rem', fontWeight: 700, padding: '2px 7px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.12em', border: '1px solid rgba(255,224,154,0.15)', flexShrink: 0 }}>{status}</span>
  );
}

/* ─── Avatar strip for relationship tiles ─── */
export function PartyAvatarStrip({ parties, fallbackKey }: { parties: PanelParty[]; fallbackKey: string }) {
  if (parties.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
      {parties.map(({ party, isCurrent }) => (
        <div key={party.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ border: `2px solid ${isCurrent ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 3, boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
            <Avatar src={partyPhoto(party, fallbackKey)} alt={party.name} size={36} radius={2} />
          </div>
          <div style={{ fontSize: '0.5rem', color: isCurrent ? 'var(--gold-bright)' : 'var(--parchment-shadow)', textAlign: 'center', maxWidth: 48, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{party.name.split(' ')[0]}</div>
          {isCurrent && <div style={{ background: 'var(--gold-mid)', color: 'var(--forest-deep)', fontSize: '0.42rem', fontWeight: 700, padding: '1px 4px', borderRadius: 2 }}>CUR</div>}
        </div>
      ))}
    </div>
  );
}

/* ─── Data Category Card (right column tile) — gradient + icon, no stock photo ─── */
export interface DataCategoryDef { key: string; label: string; sublabel: string; icon: React.ReactNode; imgKey: DataCardImgKey; }

export function DataCategoryCard({ label, sublabel, icon, active, onClick }: Omit<DataCategoryDef, 'key'> & { active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const lit = hovered || active;
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} aria-label={`${active ? 'Close' : 'View'} ${label} data`} aria-pressed={active} style={{ width: '100%', border: `2px solid ${lit ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', background: 'none', padding: 0, display: 'flex', flexDirection: 'column', boxShadow: lit ? '0 0 0 1px var(--gold-bright), 0 6px 20px rgba(0,0,0,0.6)' : '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.45)', transition: 'border-color 0.18s, box-shadow 0.18s', outline: active ? '2px solid var(--gold-bright)' : 'none', outlineOffset: 2, ...serifStyle }}>
      <div style={{ position: 'relative', width: '100%', height: 64, overflow: 'hidden', background: active ? 'linear-gradient(135deg, var(--forest-light) 0%, var(--forest-mid) 100%)' : 'linear-gradient(135deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.5, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,224,154,0.1) 1px, transparent 0)', backgroundSize: '13px 13px' }} />
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(14,36,22,0.65)', border: `1px solid ${active ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: lit ? 'scale(1.08)' : 'scale(1)', transition: 'transform 0.25s, border-color 0.18s' }}>{icon}</div>
        {active && <div style={{ position: 'absolute', top: 5, right: 6, width: 16, height: 16, borderRadius: 2, background: 'var(--gold-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}><X size={9} strokeWidth={3} style={{ color: 'var(--forest-deep)' }} /></div>}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 7px 4px', background: 'linear-gradient(0deg, rgba(14,36,22,0.88) 0%, transparent 100%)' }}><span style={{ fontSize: '0.56rem', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)', textShadow: '0 1px 3px rgba(0,0,0,0.9)', display: 'block', textAlign: 'center' }}>{label}</span></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px 5px', background: lit ? 'linear-gradient(90deg, var(--forest-mid) 0%, var(--forest-light) 100%)' : 'linear-gradient(90deg, var(--forest-deep) 0%, var(--forest-mid) 100%)', borderTop: `1px solid ${active ? 'var(--gold-bright)' : 'var(--gold-dark)'}`, transition: 'background 0.18s', minHeight: 30 }}>
        <span style={{ fontSize: '0.52rem', color: lit ? 'var(--parchment)' : 'var(--parchment-shadow)', fontStyle: 'italic', letterSpacing: '0.06em', ...serifStyle, transition: 'color 0.18s', flex: 1, textAlign: 'left', paddingRight: 4 }}>{active ? 'Tap to hide' : sublabel}</span>
        <div style={{ width: 22, height: 22, borderRadius: 2, background: active || lit ? 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold-mid) 100%)' : 'linear-gradient(135deg, var(--gold-mid) 0%, var(--gold-dark) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: lit ? '0 1px 6px rgba(0,0,0,0.5)' : '0 1px 3px rgba(0,0,0,0.4)', transition: 'background 0.18s, box-shadow 0.18s' }}>
          {active ? <X size={10} strokeWidth={2.5} style={{ color: 'var(--forest-deep)' }} /> : <ChevronRight size={12} strokeWidth={2.5} style={{ color: 'var(--forest-deep)', transform: lit ? 'translateX(1px)' : 'translateX(0)', transition: 'transform 0.18s ease' }} />}
        </div>
      </div>
      <div style={{ height: 2, width: '100%', background: active ? 'linear-gradient(90deg, var(--gold-mid) 0%, var(--gold-bright) 50%, var(--gold-mid) 100%)' : lit ? 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-bright) 50%, var(--gold-dark) 100%)' : 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-mid) 50%, var(--gold-dark) 100%)', transition: 'background 0.18s' }} />
    </button>
  );
}

/* ─── Left-rail entity tile (relationship modules) — navigates on click ─── */
export function EntityTile({ title, icon, primaryName, secondaryLine, count, imgSrc, onClick }: {
  title: string; icon: React.ReactNode; primaryName: string; secondaryLine: string; count: number; imgSrc?: string; onClick?: () => void;
}) {
  const interactive = !!onClick && count > 0;
  return (
    <div style={{ border: '2px solid var(--gold-dark)', borderRadius: 4, overflow: 'hidden', boxShadow: '0 0 0 1px var(--gold-dark), 0 3px 10px rgba(0,0,0,0.45)', ...serifStyle }}>
      <div style={{ background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', boxShadow: '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--gold-bright)', display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ fontSize: '0.58rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)', textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>{title}</span>
      </div>
      <button onClick={interactive ? onClick : undefined} aria-label={interactive ? `View ${primaryName}` : title} style={{ width: '100%', background: 'var(--parchment)', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(0,0,0,0.022) 20px, rgba(0,0,0,0.022) 21px)', boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.15)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10, border: 'none', cursor: interactive ? 'pointer' : 'default', textAlign: 'left' }}>
        <div style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.35)', borderRadius: 3 }}>
          <Avatar src={imgSrc} alt={primaryName} size={44} icon={icon} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--forest-deep)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...serifStyle }}>{primaryName}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--forest-mid)', fontStyle: 'italic', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...serifStyle }}>{secondaryLine}</div>
          <div style={{ fontSize: '0.56rem', color: 'var(--parchment-shadow)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{count} {count === 1 ? 'record' : 'records'} on file</div>
        </div>
        {interactive && (
          <div style={{ width: 22, height: 22, borderRadius: 2, flexShrink: 0, background: 'linear-gradient(135deg, var(--gold-mid) 0%, var(--gold-dark) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
            <ChevronRight size={12} strokeWidth={2.5} style={{ color: 'var(--forest-deep)' }} />
          </div>
        )}
      </button>
    </div>
  );
}
