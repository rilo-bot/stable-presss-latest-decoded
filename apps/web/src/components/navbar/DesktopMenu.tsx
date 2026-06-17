import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { NAV_SECTIONS, type NavSection } from './config';

interface DesktopMenuProps {
  activeDropdown: string | null;
  setActiveDropdown: (value: string | null) => void;
  isSectionActive: (section: NavSection) => boolean;
  showPodcastWorkflow: boolean;
  staff: boolean;
  pathname: string;
}

export function DesktopMenu({
  activeDropdown,
  setActiveDropdown,
  isSectionActive,
  showPodcastWorkflow,
  staff,
  pathname,
}: DesktopMenuProps) {
  return (
    <div className="hidden md:block border-t border-primary-foreground/10">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <nav className="flex items-center overflow-x-auto" aria-label="Section navigation">
          {NAV_SECTIONS.map((section) => {
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
                    'flex items-center gap-1.5 px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors duration-150 border-b-2 whitespace-nowrap',
                    isActive
                      ? 'text-primary-foreground border-b-2'
                      : 'text-primary-foreground/65 hover:text-primary-foreground border-transparent'
                  )}
                  style={
                    isActive
                      ? { borderBottomColor: 'hsl(var(--brand-accent))' }
                      : undefined
                  }
                >
                  {section.label}
                  {section.sub && <ChevronDown size={10} className="opacity-50" />}
                </Link>

                {/* Dropdown */}
                {section.sub && activeDropdown === section.label && (
                  <div className="absolute top-full left-0 w-64 bg-card border border-border/60 shadow-lg rounded-sm z-50 py-1">
                    {/* Section link at top */}
                    <Link
                      to={section.to}
                      className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 hover:bg-primary/5 transition-colors"
                      onClick={() => setActiveDropdown(null)}
                    >
                      <span className="text-primary">{section.icon}</span>
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
                        All {section.label}
                      </span>
                    </Link>
                    {section.sub.map((item) => (
                      <Link
                        key={item.label}
                        to={item.to}
                        className="block px-4 py-2.5 hover:bg-muted/50 transition-colors"
                        onClick={() => setActiveDropdown(null)}
                      >
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
                          {item.label}
                        </span>
                        <span className="block text-[10px] text-muted-foreground mt-0.5 normal-case tracking-normal">
                          {item.description}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Spacer then Production System links */}
          <div className="flex-1" />

          {showPodcastWorkflow && (
            <Link
              to="/podcast/workflow"
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border-b-2 flex-shrink-0',
                pathname === '/podcast/workflow'
                  ? 'text-primary-foreground'
                  : 'text-primary-foreground/65 hover:text-primary-foreground border-transparent'
              )}
              style={
                pathname === '/podcast/workflow'
                  ? { borderBottomColor: 'hsl(var(--brand-accent))' }
                  : undefined
              }
            >
              <LoaderCircle size={11} />
              Studio
            </Link>
          )}

          {staff && (
            <Link
              to="/newsroom"
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border-b-2 flex-shrink-0',
                pathname === '/newsroom'
                  ? 'text-primary-foreground'
                  : 'text-primary-foreground/65 hover:text-primary-foreground border-transparent'
              )}
              style={
                pathname === '/newsroom'
                  ? { borderBottomColor: 'hsl(var(--brand-accent))' }
                  : undefined
              }
            >
              Production System
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
