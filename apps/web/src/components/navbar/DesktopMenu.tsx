/**
 * The section row — the second of TWO header rows.
 *
 * The header was three rows and 112px of sticky chrome. The MASTHEAD STRIP (the
 * first row: the strapline, the date, and up to seven role-conditional 10px links)
 * is gone — see NavBar.tsx. The wordmark row and this one remain.
 *
 * Six sections, one per destination. There were eight, and three of them — News,
 * Analysis and Interviews — were the SAME PAGE under different `?section=` params.
 * See navbar/config.tsx.
 *
 * The staff links keep their position at the right-hand end of this row, past the
 * spacer, unchanged.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { visibleNavSections, type NavSection } from './config';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';

interface DesktopMenuProps {
  activeDropdown: string | null;
  setActiveDropdown: (value: string | null) => void;
  isSectionActive: (section: NavSection) => boolean;
  staff: boolean;
  pathname: string;
}

/** The staff link's own styling, kept separate from the section links above. */
const staffLinkClass = (active: boolean) =>
  cn(
    'flex items-center gap-1.5 px-3 py-2.5 text-[12px] uppercase tracking-[0.08em] font-semibold transition-colors border-b-2 flex-shrink-0',
    active
      ? 'text-primary-foreground'
      : 'text-primary-foreground/65 hover:text-primary-foreground border-transparent'
  );

export function DesktopMenu({
  activeDropdown,
  setActiveDropdown,
  isSectionActive,
  staff,
  pathname,
}: DesktopMenuProps) {
  // Which of the six an admin has switched on. Subscribed, so flipping a switch
  // in Settings updates this header without a reload.
  const publicNav = useSiteSettingsStore((s) => s.publicNav);
  const sections = visibleNavSections(publicNav);

  return (
    <div className="hidden md:block border-t border-primary-foreground/10">
      {/* Edge to edge — no `max-w-7xl mx-auto` container, here or on the row above. */}
      <div className="px-6 md:px-10 lg:px-16">
        <nav className="flex items-center overflow-x-auto" aria-label="Section navigation">
          {sections.map((section) => {
            const isActive = isSectionActive(section);

            return (
              <div
                key={section.label}
                className="relative flex-shrink-0"
                onMouseEnter={() => section.sub && setActiveDropdown(section.label)}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <Link
                  to={section.to}
                  className={cn(
                    // 12px, not 11px, and tracking eased from 0.1em: these are the
                    // primary navigation of the site and were set smaller and looser
                    // than the body copy beneath them.
                    'flex items-center gap-1.5 px-3 py-2.5 text-[12px] uppercase tracking-[0.08em] font-semibold transition-colors duration-150 border-b-2 whitespace-nowrap',
                    isActive
                      ? 'text-primary-foreground'
                      : 'text-primary-foreground/65 hover:text-primary-foreground border-transparent'
                  )}
                  style={isActive ? { borderBottomColor: 'hsl(var(--brand-accent))' } : undefined}
                >
                  {section.label}
                  {section.sub && <ChevronDown size={10} className="opacity-50" />}
                </Link>

                {/* Dropdown */}
                {section.sub && activeDropdown === section.label && (
                  <div className="absolute top-full left-0 w-64 bg-card border border-border/60 shadow-lg rounded-sm z-50 py-1">
                    {section.sub.map((item) => (
                      <Link
                        key={item.label}
                        to={item.to}
                        className="block px-4 py-2.5 hover:bg-muted/50 transition-colors"
                        onClick={() => setActiveDropdown(null)}
                      >
                        <span className="block text-[12px] font-semibold text-foreground">
                          {item.label}
                        </span>
                        <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {item.description}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Spacer, then the staff links — same place as always. */}
          <div className="flex-1" />

          {/* A "Studio" link sat here, pointing at /podcast/workflow. Podcast
              production is a Campaign Engine screen now, so it is one rail entry
              behind the link beside this comment — two links to the same place,
              one of them a redirect, is the duplication this header row exists to
              have less of. */}

          {staff && (
            <Link
              to="/production-system"
              className={staffLinkClass(pathname === '/production-system')}
              style={
                pathname === '/production-system'
                  ? { borderBottomColor: 'hsl(var(--brand-accent))' }
                  : undefined
              }
            >
              Campaign Engine
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
