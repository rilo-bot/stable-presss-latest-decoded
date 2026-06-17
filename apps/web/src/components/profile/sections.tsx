import { useEffect, useMemo } from 'react';
import {
  Camera, TrendingUp, ShoppingCart, Heart, Wand, Binary, FileText, Flag,
  Newspaper, Users, Briefcase, ExternalLink, Link as LinkIcon, DollarSign,
  Lock, Image, BookMarked, ChevronRight, MapPin,
} from 'lucide-react';
import { useMediaStore } from '@/stores/mediaStore';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import { useSaleStore } from '@/stores/saleStore';
import { useReportStore } from '@/stores/reportStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorseStore } from '@/stores/horseStore';
import { useAuthStore } from '@/stores/authStore';
import type { Horse } from '@/types/horse';
import type { MediaType } from '@/types/mediaItem';
import type { RaceStatus } from '@/types/racingEntry';
import type { ReportVisibility } from '@/types/horseReport';
import { PedigreeGrid } from '@/components/PedigreeGrid';
import {
  serifStyle, fmtDate, fmtMoney, SectionPanel, SRow, SectionHeading,
  ProfileDetailPanel, MediaTypeBadge, RaceStatusBadge,
} from '@/components/profile/kit';

/** Common props for every generalised module section. */
interface BaseSectionProps {
  horseIds: string[];
  subjectName: string;
  onClose: () => void;
  /** When set, horse names become clickable to re-point the page. */
  onOpenHorse?: (horseId: string) => void;
}

const EmptyHint = ({ icon, line }: { icon: React.ReactNode; line: string }) => (
  <div style={{ marginTop: 12, padding: '20px 14px', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--parchment-dark)', borderRadius: 3, textAlign: 'center' }}>
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{icon}</div>
    <p style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--parchment-label)', marginBottom: 4 }}>{line}</p>
    <p style={{ fontSize: '0.62rem', color: 'var(--parchment-label)' }}>Records are managed through the Stable Press Production System.</p>
  </div>
);

/** A small clickable / static horse-name chip used inside record rows. */
function HorseTag({ horseId, name, onOpenHorse }: { horseId: string; name?: string; onOpenHorse?: (id: string) => void }) {
  if (!name) return null;
  const content = (<><span style={{ color: 'var(--gold-dark)' }}>· </span>{name}</>);
  if (!onOpenHorse) return <span>{content}</span>;
  return (
    <button onClick={() => onOpenHorse(horseId)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--forest-mid)', fontWeight: 700, ...serifStyle, fontSize: 'inherit' }}>{content}</button>
  );
}

/* ─── MEDIA ─── */
export function MediaSection({ horseIds, subjectName, onClose, onOpenHorse }: BaseSectionProps) {
  const allItems = useMediaStore((s) => s.items);
  const fetchItems = useMediaStore((s) => s.fetchItems);
  const allParties = usePartyStore((s) => s.parties);
  const horses = useHorseStore((s) => s.horses);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const idSet = useMemo(() => new Set(horseIds), [horseIds]);
  const items = useMemo(
    () => allItems.filter((m) => idSet.has(m.horse_id)).sort((a, b) => {
      const da = a.published_date ?? String(a.createdAt);
      const db = b.published_date ?? String(b.createdAt);
      return db.localeCompare(da);
    }),
    [allItems, idSet],
  );
  const horseName = (hid: string) => horses.find((h) => h.id === hid)?.name;
  const multi = horseIds.length > 1;

  return (
    <SectionPanel title="Media Data" icon={<Camera size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="media" onClose={onClose}>
      <SRow label="Subject" value={subjectName} />
      <SRow label="Media Records" value={String(items.length)} />
      {items.length === 0 ? (
        <EmptyHint icon={<Camera size={28} style={{ color: 'var(--parchment-dark)' }} />} line={`No media on file for ${subjectName} yet.`} />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {items.map((item, idx) => {
            const featuredNames = (item.featured_party_ids ?? []).map((pid) => allParties.find((p) => p.id === pid)?.name).filter(Boolean) as string[];
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-label)' }}>
                  {multi && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><BookMarked size={9} style={{ color: 'var(--gold-dark)' }} /><HorseTag horseId={item.horse_id} name={horseName(item.horse_id)} onOpenHorse={onOpenHorse} /></span>}
                  {item.source_publication && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Newspaper size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{item.source_publication}</span>}
                  {item.published_date && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--gold-dark)' }}>·</span>{fmtDate(item.published_date)}</span>}
                  {featuredNames.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Users size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{featuredNames.join(', ')}</span>}
                </div>
                {hasLink && (
                  <div style={{ marginTop: 5 }}>
                    {item.url ? (
                      <a href={item.url} target={item.url.startsWith('/') ? '_self' : '_blank'} rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--forest-mid)', textDecoration: 'none', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 2, padding: '2px 7px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><ExternalLink size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{item.url.length > 52 ? item.url.substring(0, 52) + '…' : item.url}</a>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--forest-mid)', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 2, padding: '2px 7px' }}><LinkIcon size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{item.file_name}</span>
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
        <span style={{ fontSize: '0.62rem', color: 'var(--parchment-label)', fontStyle: 'italic' }}>Media records surface automatically from the Stable Press Production System.</span>
      </div>
    </SectionPanel>
  );
}

/* ─── RACING ─── */
export function RacingSection({ horseIds, horses, subjectName, onClose, onOpenHorse }: BaseSectionProps & { horses: Horse[] }) {
  const allEntries = useRacingEntryStore((s) => s.entries);
  const fetchEntries = useRacingEntryStore((s) => s.fetchEntries);
  const allParties = usePartyStore((s) => s.parties);
  const allHorses = useHorseStore((s) => s.horses);
  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const idSet = useMemo(() => new Set(horseIds), [horseIds]);
  const entries = useMemo(
    () => allEntries.filter((e) => idSet.has(e.horse_id)).sort((a, b) => b.race_date.localeCompare(a.race_date)),
    [allEntries, idSet],
  );
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<RaceStatus, number>> = {};
    entries.forEach((e) => { counts[e.status] = (counts[e.status] ?? 0) + 1; });
    return counts;
  }, [entries]);
  const horseName = (hid: string) => allHorses.find((h) => h.id === hid)?.name;
  const single = horses.length === 1 ? horses[0] : undefined;
  const multi = horseIds.length > 1;

  return (
    <SectionPanel title="Racing Data" icon={<TrendingUp size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="racing" onClose={onClose}>
      <SRow label="Subject" value={subjectName} />
      <SRow label="Race Records" value={String(entries.length)} />
      {single && <SRow label="Career" value={single.careerRecord || '—'} />}
      {single && <SRow label="Winnings" value={single.careerWinnings ? '$' + single.careerWinnings.toLocaleString('en-AU') : '—'} highlight />}

      {entries.length === 0 ? (
        <EmptyHint icon={<Flag size={28} style={{ color: 'var(--parchment-dark)' }} />} line={`No racing records on file for ${subjectName} yet.`} />
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-label)', marginBottom: 4 }}>
                  {multi && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><BookMarked size={9} style={{ color: 'var(--gold-dark)' }} /><HorseTag horseId={entry.horse_id} name={horseName(entry.horse_id)} onOpenHorse={onOpenHorse} /></span>}
                  {entry.race_date && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Flag size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{fmtDate(entry.race_date)}</span>}
                  {entry.venue && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--gold-dark)' }}>·</span>{entry.venue}{entry.country ? `, ${entry.country}` : ''}</span>}
                  {entry.class_grade && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--gold-dark)' }}>·</span>{entry.class_grade}</span>}
                  {entry.distance && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--gold-dark)' }}>·</span>{entry.distance}</span>}
                </div>
                {entry.status === 'Finished' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-label)' }}>
                    {entry.finish_position !== undefined && (
                      <span style={{ color: entry.finish_position === 1 ? 'var(--gold-bright)' : 'var(--forest-mid)', fontWeight: entry.finish_position === 1 ? 700 : 500 }}>
                        {entry.finish_position === 1 ? '🏆' : ''} {entry.finish_position}{entry.finish_position === 1 ? 'st' : entry.finish_position === 2 ? 'nd' : entry.finish_position === 3 ? 'rd' : 'th'}
                      </span>
                    )}
                    {entry.margin && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: 'var(--gold-dark)' }}>·</span>{entry.margin}</span>}
                    {entry.prize_money && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--gold-bright)' }}><span style={{ color: 'var(--gold-dark)' }}>·</span>${entry.prize_money.toLocaleString('en-AU')}</span>}
                  </div>
                )}
                {(jockeyName || trainerName) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.57rem', color: 'var(--parchment-label)', marginTop: 4 }}>
                    {jockeyName && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Users size={8} style={{ color: 'var(--gold-dark)' }} />J: {jockeyName}</span>}
                    {trainerName && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Briefcase size={8} style={{ color: 'var(--gold-dark)' }} />T: {trainerName}</span>}
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
        </>
      )}
    </SectionPanel>
  );
}

/* ─── SALES ─── */
export function SalesSection({ horseIds, subjectName, onClose, onOpenHorse }: BaseSectionProps) {
  const allSales = useSaleStore((s) => s.sales);
  const fetchSales = useSaleStore((s) => s.fetchSales);
  const allParties = usePartyStore((s) => s.parties);
  const allHorses = useHorseStore((s) => s.horses);
  useEffect(() => { fetchSales(); }, [fetchSales]);

  const idSet = useMemo(() => new Set(horseIds), [horseIds]);
  const sales = useMemo(
    () => allSales.filter((s) => idSet.has(s.horse_id)).sort((a, b) => b.sale_date.localeCompare(a.sale_date)),
    [allSales, idSet],
  );
  const horseName = (hid: string) => allHorses.find((h) => h.id === hid)?.name;
  const topPrice = sales.reduce((m, s) => (s.price && s.price > m ? s.price : m), 0);
  const multi = horseIds.length > 1;

  return (
    <SectionPanel title="Sales Data" icon={<ShoppingCart size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="sales" onClose={onClose}>
      <SRow label="Subject" value={subjectName} />
      <SRow label="Sale Records" value={String(sales.length)} />
      {topPrice > 0 && <SRow label="Top Price" value={fmtMoney(topPrice)} highlight />}
      {sales.length === 0 ? (
        <EmptyHint icon={<ShoppingCart size={28} style={{ color: 'var(--parchment-dark)' }} />} line={`No sales history on file for ${subjectName} yet.`} />
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-label)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><DollarSign size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{fmtDate(sale.sale_date)}</span>
                  {multi && <HorseTag horseId={sale.horse_id} name={horseName(sale.horse_id)} onOpenHorse={onOpenHorse} />}
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
        <span style={{ fontSize: '0.64rem', color: 'var(--parchment-label)', fontStyle: 'italic' }}>Sales &amp; auction records are managed through the Stable Press Production System.</span>
      </div>
    </SectionPanel>
  );
}

/* ─── REPORTS / FORMS ─── */
export function ReportsSection({ horseIds, subjectName, onClose, onOpenHorse }: BaseSectionProps) {
  const allReports = useReportStore((s) => s.reports);
  const fetchReports = useReportStore((s) => s.fetchReports);
  const currentUser = useAuthStore((s) => s.currentUser);
  const allHorses = useHorseStore((s) => s.horses);
  useEffect(() => { fetchReports(); }, [fetchReports]);

  const idSet = useMemo(() => new Set(horseIds), [horseIds]);
  const scoped = useMemo(() => allReports.filter((r) => idSet.has(r.horse_id)), [allReports, idSet]);
  const visible = useMemo(() => scoped.filter((r) => (r.visibility as ReportVisibility) === 'public' || !!currentUser), [scoped, currentUser]);
  const hiddenCount = scoped.length - visible.length;
  const horseName = (hid: string) => allHorses.find((h) => h.id === hid)?.name;
  const multi = horseIds.length > 1;

  return (
    <ProfileDetailPanel title="Reports / Forms" icon={<FileText size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} onClose={onClose}>
      <SRow label="Subject" value={subjectName} />
      <SRow label="Documents" value={String(visible.length)} />
      {visible.length === 0 ? (
        <EmptyHint icon={<FileText size={28} style={{ color: 'var(--parchment-dark)' }} />} line={`No documents on file for ${subjectName}.`} />
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
                      {restricted && <Lock size={10} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />}{r.title}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.58rem', color: 'var(--parchment-label)', marginTop: 2 }}>
                      {multi && <HorseTag horseId={r.horse_id} name={horseName(r.horse_id)} onOpenHorse={onOpenHorse} />}
                      {r.issuing_body && <span>{r.issuing_body}</span>}
                      {r.issued_date && <span><span style={{ color: 'var(--gold-dark)' }}>· </span>{fmtDate(r.issued_date)}</span>}
                      {restricted && <span style={{ color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>· Restricted</span>}
                    </div>
                  </div>
                </div>
                {hasLink && (
                  <div style={{ marginTop: 4 }}>
                    {r.url ? (
                      <a href={r.url} target={r.url.startsWith('/') ? '_self' : '_blank'} rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--forest-mid)', textDecoration: 'none', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 2, padding: '2px 7px' }}><ExternalLink size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />Open document</a>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--forest-mid)', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 2, padding: '2px 7px' }}><LinkIcon size={9} style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />{r.file_name}</span>
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
          <span style={{ fontSize: '0.64rem', color: 'var(--parchment-label)', fontStyle: 'italic' }}>{hiddenCount} restricted document{hiddenCount !== 1 ? 's' : ''} hidden — sign in as an authorised member to view.</span>
        </div>
      )}
    </ProfileDetailPanel>
  );
}

/* ─── Per-horse picker for horse-only modules (Pedigree / Stud Book / Breeding) ─── */
function HorsePicker({ horses, onOpenHorse, label }: { horses: Horse[]; onOpenHorse?: (id: string) => void; label: string }) {
  return (
    <>
      <p style={{ fontSize: '0.7rem', color: 'var(--forest-mid)', fontStyle: 'italic', marginBottom: 10 }}>{label} is held per horse. Choose a horse to view its record.</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {horses.map((h, idx) => (
          <li key={h.id} style={{ borderBottom: idx < horses.length - 1 ? '1px solid var(--parchment-dark)' : undefined }}>
            <button onClick={() => onOpenHorse?.(h.id)} disabled={!onOpenHorse} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', background: 'none', border: 'none', cursor: onOpenHorse ? 'pointer' : 'default', textAlign: 'left' }}>
              <div style={{ width: 34, height: 34, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--gold-mid)', flexShrink: 0, background: 'var(--forest-deep)' }}>
                {h.imageUrl && <img src={h.imageUrl} alt={h.name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--forest-deep)', ...serifStyle }}>{h.isUnnamed ? 'Un-Named' : h.name}</div>
                <div style={{ fontSize: '0.58rem', color: 'var(--parchment-label)' }}>{[h.sex, h.colour].filter(Boolean).join(' · ')}</div>
              </div>
              {onOpenHorse && <ChevronRight size={13} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ─── PEDIGREE ─── */
export function PedigreeSection({ horses, subjectName, onClose, onOpenHorse }: { horses: Horse[]; subjectName: string; onClose: () => void; onOpenHorse?: (id: string) => void }) {
  const single = horses.length === 1 ? horses[0] : undefined;
  const hasFamilyTree = single && (single.sire || single.dam || single.sireSire || single.sireDam || single.damSire || single.damDam);
  return (
    <SectionPanel title="Pedigree Data" icon={<Wand size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="pedigree" onClose={onClose}>
      {single ? (
        <>
          {single.pullQuote && <blockquote style={{ borderLeft: '3px solid var(--gold-mid)', paddingLeft: 10, marginBottom: 12, fontStyle: 'italic', fontSize: '0.78rem', color: 'var(--forest-deep)', lineHeight: 1.5 }}>"{single.pullQuote}"</blockquote>}
          {hasFamilyTree ? (
            <div style={{ marginBottom: 12 }}><PedigreeGrid horse={single} /></div>
          ) : (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}><BookMarked size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} /><span style={{ fontSize: '0.64rem', color: 'var(--parchment-label)', fontStyle: 'italic' }}>No pedigree data on file.</span></div>
          )}
          {single.pedigreeNotes && <><SectionHeading>Pedigree Notes</SectionHeading><p style={{ fontSize: '0.72rem', color: 'var(--forest-mid)', lineHeight: 1.6 }}>{single.pedigreeNotes}</p></>}
        </>
      ) : horses.length === 0 ? (
        <EmptyHint icon={<Wand size={28} style={{ color: 'var(--parchment-dark)' }} />} line={`No horses connected to ${subjectName}.`} />
      ) : (
        <HorsePicker horses={horses} onOpenHorse={onOpenHorse} label="Pedigree" />
      )}
    </SectionPanel>
  );
}

/* ─── STUD BOOK ─── */
export function StudBookSection({ horses, subjectName, onClose, onOpenHorse }: { horses: Horse[]; subjectName: string; onClose: () => void; onOpenHorse?: (id: string) => void }) {
  const single = horses.length === 1 ? horses[0] : undefined;
  return (
    <SectionPanel title="Stud Book Data" icon={<Binary size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="studbook" onClose={onClose}>
      {single ? (
        <>
          <dl style={{ margin: 0, padding: 0 }}>
            <SRow label="Horse Name" value={single.isUnnamed ? 'Un-Named' : single.name} />
            <SRow label="Sex" value={single.sex || '—'} />
            <SRow label="Date of Birth" value={single.dob ? new Date(single.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
            <SRow label="Colour" value={single.colour || '—'} />
            <SRow label="Country" value={single.country || '—'} />
            <SRow label="Sire" value={single.sire || '—'} />
            <SRow label="Dam" value={single.dam || '—'} />
          </dl>
          <SectionHeading>Registry Details</SectionHeading>
          <dl style={{ margin: 0, padding: 0 }}>
            <SRow label="Stud Book" value={single.studBook || 'Australian Stud Book'} />
            <SRow label="Registration No." value={single.registrationNumber || 'Not on file'} highlight={!!single.registrationNumber} />
            <SRow label="Microchip" value={single.microchip || 'Not on file'} />
            <SRow label="Brand / Freeze" value={single.brandFreeze || 'Not on file'} />
            <SRow label="Passport No." value={single.passportNumber || 'Not on file'} />
          </dl>
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={14} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.64rem', color: 'var(--parchment-label)', fontStyle: 'italic' }}>Official stud book registration details as held by Racing Australia.</span>
          </div>
        </>
      ) : horses.length === 0 ? (
        <EmptyHint icon={<Binary size={28} style={{ color: 'var(--parchment-dark)' }} />} line={`No horses connected to ${subjectName}.`} />
      ) : (
        <HorsePicker horses={horses} onOpenHorse={onOpenHorse} label="Stud Book registration" />
      )}
    </SectionPanel>
  );
}

/* ─── BREEDING ─── */
export function BreedingSection({ horses, subjectName, onClose, onOpenHorse }: { horses: Horse[]; subjectName: string; onClose: () => void; onOpenHorse?: (id: string) => void }) {
  const eligible = horses.filter((h) => h.sex !== 'Gelding');
  const single = eligible.length === 1 ? eligible[0] : undefined;
  return (
    <SectionPanel title="Breeding Data" icon={<Heart size={14} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />} imgKey="breeding" onClose={onClose}>
      {single ? (
        <>
          <dl style={{ margin: 0, padding: 0 }}>
            <SRow label="Horse Name" value={single.isUnnamed ? 'Un-Named' : single.name} />
            <SRow label="Sex" value={single.sex || '—'} />
            <SRow label="Colour" value={single.colour || '—'} />
            <SRow label="Date of Birth" value={single.dob ? new Date(single.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} />
            <SRow label="Country of Birth" value={single.country || '—'} />
            <SRow label="Sire" value={single.sire || '—'} />
            <SRow label="Dam" value={single.dam || '—'} />
            <SRow label="Dam YOB" value={single.damYob ? String(single.damYob) : '—'} />
          </dl>
          <SectionHeading>Breeding Record</SectionHeading>
          <dl style={{ margin: 0, padding: 0 }}>
            <SRow label="Breeding Status" value="Not recorded" />
            <SRow label="Foals on Record" value="0" />
          </dl>
          <p style={{ fontSize: '0.72rem', color: 'var(--forest-mid)', lineHeight: 1.6, fontStyle: 'italic', marginTop: 10 }}>Full paddock history, foaling records, and breeding partnerships will be displayed here once registered.</p>
        </>
      ) : eligible.length === 0 ? (
        <EmptyHint icon={<Heart size={28} style={{ color: 'var(--parchment-dark)' }} />} line={`No breeding-eligible horses connected to ${subjectName}.`} />
      ) : (
        <HorsePicker horses={eligible} onOpenHorse={onOpenHorse} label="Breeding record" />
      )}
    </SectionPanel>
  );
}
