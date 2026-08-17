/**
 * "What's inside" — one card per public section.
 *
 * THE COPY IS NOT WRITTEN HERE, AND NOT INVENTED ANYWHERE. Each card's line is
 * `PUBLIC_NAV_SECTIONS[].description` from types/siteSettings.ts — the same
 * sentence an admin reads on that section's visibility switch in Settings. So the
 * front page describes each section in the words the product already uses, and
 * there is one place to change them.
 *
 * The icons come from navbar/config.tsx for the same reason: the tab and the card
 * for a section should not be able to disagree about what it looks like.
 *
 * FILTERED BY THE SAME SWITCHES as the nav and the router. A card for a section
 * an admin has turned off would advertise a route that redirects straight back
 * here — and the band's own note claims "what you see here is what the site is
 * actually running", which has to be true.
 *
 * Phase 2 drops a live count onto each card ("41 stories", "18 profiles") — see
 * docs/LANDING-PAGE-RESTRUCTURE.md §7. The card is laid out with room for it.
 */
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PUBLIC_NAV_SECTIONS } from '@/types/siteSettings';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';
import { NAV_SECTIONS } from '@/components/navbar/config';
import { SECTIONS_BAND } from './copy';

/** key → the tab's own icon, so a section looks the same in the nav and here. */
const ICONS = new Map(NAV_SECTIONS.map((s) => [s.key, s.icon]));

export function LandingSections() {
  const publicNav = useSiteSettingsStore((s) => s.publicNav);
  const sections = PUBLIC_NAV_SECTIONS.filter((s) => publicNav[s.key] !== false);

  // Every section switched off. The heading promises six and there are none, so
  // the block says nothing at all rather than standing there empty.
  if (sections.length === 0) return null;

  return (
    <section className="border-t border-border">
      <div className="px-6 md:px-10 lg:px-16 py-14 md:py-20">

        <div className="max-w-2xl mb-10">
          <p
            className="text-[11px] uppercase tracking-[0.16em] font-bold mb-3"
            style={{ color: 'hsl(var(--brand-accent-ink))' }}
          >
            {SECTIONS_BAND.kicker}
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold leading-tight text-foreground mb-3">
            {/* The heading says "six sections" — so it must not say six when an
                admin has switched two off. */}
            {sections.length === PUBLIC_NAV_SECTIONS.length
              ? SECTIONS_BAND.heading
              : `${sections.length} section${sections.length === 1 ? '' : 's'}, one paper.`}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {SECTIONS_BAND.note}
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {sections.map((section) => (
            <li key={section.key}>
              <Link
                to={section.path}
                className="group flex h-full flex-col rounded-sm border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <span
                  className="mb-4 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm text-primary"
                  style={{ background: 'hsl(var(--brand-accent) / 0.12)' }}
                  aria-hidden="true"
                >
                  {ICONS.get(section.key)}
                </span>

                <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground leading-tight mb-2 group-hover:text-primary transition-colors">
                  {section.label}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {section.description}
                </p>

                {/* Pinned to the base so the six cards' footers line up whatever
                    the description's length. */}
                <span className="mt-auto flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-primary">
                  Open {section.label.toLowerCase()}
                  <ArrowRight
                    size={13}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>

      </div>
    </section>
  );
}
