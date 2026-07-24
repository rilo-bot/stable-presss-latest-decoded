import { Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { AuthUser } from '@/stores/authStore';
import type { Horse } from '@/types/horse';
import type { Party } from '@/types/party';
import type { MediaItem } from '@/types/mediaItem';
import type { RacingEntry } from '@/types/racingEntry';
import type { RoleConfig, SideNavItem } from '../constants';

interface NewsroomSidebarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  currentRoleConfig: RoleConfig;
  visibleNav: SideNavItem[];
  activeNav: string;
  setActiveNav: (nav: string) => void;
  pendingReview: number;
  horses: Horse[];
  safeParties: Party[];
  mediaItems: MediaItem[];
  racingEntries: RacingEntry[];
  currentUser: AuthUser | null;
}

export function NewsroomSidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
  currentRoleConfig,
  visibleNav,
  activeNav,
  setActiveNav,
  pendingReview,
  horses,
  safeParties,
  mediaItems,
  racingEntries,
  currentUser,
}: NewsroomSidebarProps) {
  const navigate = useNavigate();
  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-border/60 bg-card transition-all duration-200',
        sidebarCollapsed ? 'w-14' : 'w-56'
      )}
    >
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/40">
        {!sidebarCollapsed && (
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em] font-bold text-muted-foreground">Production System</p>
            <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">Newsroom</p>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="p-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Toggle sidebar"
        >
          <Filter size={14} />
        </button>
      </div>

      {!sidebarCollapsed && (
        <div className="px-3 py-3 border-b border-border/40">
          <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground mb-1.5">Your Role</p>
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-sm border text-sm font-semibold"
            style={{ borderColor: `${currentRoleConfig.color}40`, background: `${currentRoleConfig.color}08` }}
          >
            <span style={{ color: currentRoleConfig.color }}>{currentRoleConfig.icon}</span>
            <span style={{ color: currentRoleConfig.color }}>{currentRoleConfig.label}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{currentRoleConfig.description}</p>
        </div>
      )}

      <nav className="flex-1 py-2 overflow-y-auto">
        {['Workspace', 'Content', 'Stables', 'Management'].map((section) => {
          const items = visibleNav.filter((i) => i.section === section);
          if (items.length === 0) return null;
          return (
            <div key={section} className="mb-1">
              {!sidebarCollapsed && (
                <p className="px-4 py-1.5 text-[11px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50">
                  {section}
                </p>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.href) navigate(item.href);
                    else setActiveNav(item.id);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors rounded-sm mx-1',
                    sidebarCollapsed && 'justify-center',
                    activeNav === item.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={item.label}
                >
                  <span className={cn('flex-shrink-0', activeNav === item.id ? 'text-primary' : 'text-muted-foreground')}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
                  {!sidebarCollapsed && item.badge && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-[0.1em] flex-shrink-0"
                      style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                    >
                      {item.badge}
                    </span>
                  )}
                  {!sidebarCollapsed && item.id === 'editor-hub' && pendingReview > 0 && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                      {pendingReview}
                    </span>
                  )}
                  {!sidebarCollapsed && item.id === 'horses' && (horses ?? []).length > 0 && (
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'hsl(var(--brand-accent) / 0.15)', color: 'hsl(var(--brand-accent))' }}
                    >
                      {(horses ?? []).length}
                    </span>
                  )}
                  {!sidebarCollapsed && item.id === 'parties' && safeParties.length > 0 && (
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
                    >
                      {safeParties.length}
                    </span>
                  )}
                  {!sidebarCollapsed && item.id === 'media-production-system' && (mediaItems ?? []).length > 0 && (
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'hsl(var(--chart-3) / 0.15)', color: 'hsl(var(--chart-3))' }}
                    >
                      {(mediaItems ?? []).length}
                    </span>
                  )}
                  {!sidebarCollapsed && item.id === 'racing-production-system' && (racingEntries ?? []).length > 0 && (
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'hsl(var(--chart-1) / 0.15)', color: 'hsl(var(--chart-1))' }}
                    >
                      {(racingEntries ?? []).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </nav>

      {!sidebarCollapsed && currentUser && (
        <div className="border-t border-border/40 px-3 py-3">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-primary-foreground flex-shrink-0"
              style={{ background: currentRoleConfig.color }}
            >
              {currentUser.displayName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{currentUser.displayName}</p>
              <p className="text-[11px] text-muted-foreground capitalize">{currentRoleConfig.label}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
