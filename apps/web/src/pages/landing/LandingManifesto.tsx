/**
 * "What Stable Press is" — the block a stranger needed and the page did not have.
 *
 * The front page went straight from a photograph to a list of headlines. Nothing
 * on it addressed somebody who had never heard of us: no statement of what is
 * covered, no map of the sections, no account of how the journalism is made. This
 * is the first of the four blocks that fix that (docs/LANDING-PAGE-RESTRUCTURE.md).
 *
 * IT MAKES NO CLAIM WE CANNOT SHOW. Every sentence in `MANIFESTO` describes
 * something a visitor can verify within two clicks — see the rule at the top of
 * copy.ts. There are no reader numbers, no awards and no founding date, because
 * we do not have them.
 *
 * SURFACE. A full-width `bg-card` band: cream furniture sitting on the white
 * sheet, bordered rather than shadowed (THEME-DIRECTION — a shadow under a panel
 * darker than its page reads as a mistake). Green stays out of it; green is the
 * frame around the work, never a field behind it. Gold appears only as the rule
 * above the kicker and as ink on the pillar names.
 */
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';
import type { PublicNavKey } from '@/types/siteSettings';
import { MANIFESTO } from './copy';

export function LandingManifesto() {
  // A pillar links into a public section, so a pillar for a section an admin has
  // switched off would point at a route that redirects straight back here. The
  // pillar's TEXT still stands on its own, so only the link is dropped.
  const publicNav = useSiteSettingsStore((s) => s.publicNav);
  const shows = (key: string) => publicNav[key as PublicNavKey] !== false;

  return (
    <section className="border-y border-border bg-card">
      <div className="px-6 md:px-10 lg:px-16 py-14 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10 lg:gap-16">

          {/* ── The statement ── */}
          <div>
            <div
              className="w-10 h-[3px] rounded-full mb-5"
              style={{ background: 'hsl(var(--brand-accent))' }}
            />
            <p
              className="text-[11px] uppercase tracking-[0.16em] font-bold mb-4"
              style={{ color: 'hsl(var(--brand-accent-ink))' }}
            >
              {MANIFESTO.kicker}
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl lg:text-4xl font-bold leading-[1.15] text-foreground text-balance mb-6">
              {MANIFESTO.heading}
            </h2>
            <div className="space-y-3 max-w-xl">
              {MANIFESTO.body.map((line) => (
                <p key={line} className="text-[15px] md:text-base leading-relaxed text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          </div>

          {/* ── The three pillars ──
              Numbered, because these ARE ordered — report, then analyse, then
              record is the sequence the desk actually works in. (Contrast the
              horse strip, where numbering was removed for asserting a ranking
              the data does not contain.) */}
          <ul className="space-y-0 lg:pt-2">
            {MANIFESTO.pillars.map((pillar, idx) => (
              <li
                key={pillar.name}
                className={
                  idx < MANIFESTO.pillars.length - 1
                    ? 'border-b border-border/60 pb-6 mb-6'
                    : ''
                }
              >
                <div className="flex gap-4 md:gap-5">
                  <span
                    className="flex-shrink-0 font-[family-name:var(--font-display)] text-sm font-bold tabular-nums pt-1"
                    style={{ color: 'hsl(var(--brand-accent-ink))' }}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-[family-name:var(--font-display)] text-lg md:text-xl font-bold text-foreground leading-tight mb-1.5">
                      {pillar.name}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {pillar.line}
                    </p>
                    {shows(pillar.section) && (
                      <Link
                        to={pillar.to}
                        className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:text-primary/80 transition-colors"
                      >
                        {pillar.linkLabel} <ArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

        </div>
      </div>
    </section>
  );
}
