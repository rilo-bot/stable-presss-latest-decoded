import { Bell, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { can } from '@/lib/permissions';
import type { UserRole } from '@/stores/authStore';
import type { RoleConfig, SideNavItem } from '../constants';

interface NewsroomTopBarProps {
  visibleNav: SideNavItem[];
  activeNav: string;
  pendingReview: number;
  currentRoleConfig: RoleConfig;
  userRole: UserRole | null;
  setActiveNav: (nav: string) => void;
  onOpenHorseForm: () => void;
  onOpenPartyForm: () => void;
  onOpenMediaForm: () => void;
  onOpenRacingForm: () => void;
  onNewInColumn: (status: 'draft') => void;
}

export function NewsroomTopBar({
  visibleNav,
  activeNav,
  pendingReview,
  currentRoleConfig,
  userRole,
  setActiveNav,
  onOpenHorseForm,
  onOpenPartyForm,
  onOpenMediaForm,
  onOpenRacingForm,
  onNewInColumn,
}: NewsroomTopBarProps) {
  return (
    <div className="flex items-center justify-between px-4 md:px-6 py-3.5 border-b border-border/40 bg-card">
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
          <span>Newsroom</span>
          <span>/</span>
          <span className="text-foreground font-medium capitalize">
            {visibleNav.find((n) => n.id === activeNav)?.label ?? 'Dashboard'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Notifications"
          >
            <Bell size={15} />
          </button>
          {pendingReview > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[9px] font-bold flex items-center justify-center"
              style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
            >
              {pendingReview}
            </span>
          )}
        </div>

        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold uppercase tracking-wider"
          style={{ background: `${currentRoleConfig.color}18`, color: currentRoleConfig.color }}
        >
          {currentRoleConfig.icon}
          {currentRoleConfig.label}
        </div>

        {/* Quick action buttons per active tab */}
        {activeNav === 'horses' && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
            onClick={() => onOpenHorseForm()}
          >
            <Plus size={13} />
            <span className="hidden sm:inline">Add Thoroughbred</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}

        {activeNav === 'parties' && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
            onClick={() => onOpenPartyForm()}
          >
            <Plus size={13} />
            <span className="hidden sm:inline">Add Party</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}

        {activeNav === 'media-production-system' && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
            onClick={() => onOpenMediaForm()}
          >
            <Plus size={13} />
            <span className="hidden sm:inline">Add Media Record</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}

        {activeNav === 'racing-production-system' && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
            onClick={() => onOpenRacingForm()}
          >
            <Plus size={13} />
            <span className="hidden sm:inline">Add Racing Record</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}

        {activeNav === 'bulletin-templates' && (
          <Button
            size="sm"
            variant="outline"
            className="text-sm gap-1.5"
            onClick={() => setActiveNav('workflow')}
          >
            Back to Workflow
          </Button>
        )}

        {activeNav !== 'horses' && activeNav !== 'parties' && activeNav !== 'media-production-system' && activeNav !== 'racing-production-system' && activeNav !== 'bulletin-templates' && can(userRole, 'content.draft.create') && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
            onClick={() => onNewInColumn('draft')}
          >
            <Plus size={13} />
            <span className="hidden sm:inline">File a Story</span>
            <span className="sm:hidden">New</span>
          </Button>
        )}
      </div>
    </div>
  );
}
