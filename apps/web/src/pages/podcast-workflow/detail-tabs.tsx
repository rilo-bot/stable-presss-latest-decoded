import { Users, CheckCircle, X, Plus, Trash, ArrowRight, Clock, Calendar } from 'lucide-react';
import { toast } from 'sonner';

import { can } from '@/lib/permissions';
import type { UserRole } from '@/stores/authStore';
import type { DistributionChannel, PodcastEpisode, EpisodeGuest } from '@/types/podcast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { DISTRIBUTION_CHANNELS } from './constants';
import { formatDuration, formatDate } from './helpers';
import { DistributionBadges, StatusPill } from './components';
import { CoverUploader } from './uploaders';

type DetailTab = 'overview' | 'guests' | 'distribution' | 'review';

// ── OVERVIEW ──

export function OverviewTab({
  liveEpisode,
  role,
  isOwn,
  descEdit,
  setDescEdit,
  handleSaveDesc,
  onCoverChange,
  renderNextStep,
  canDelete,
  handleDelete,
}: {
  liveEpisode: PodcastEpisode;
  role: UserRole | undefined;
  isOwn: boolean;
  descEdit: string;
  setDescEdit: React.Dispatch<React.SetStateAction<string>>;
  handleSaveDesc: () => void;
  onCoverChange: (url: string) => void;
  renderNextStep: () => React.ReactNode;
  canDelete: boolean;
  handleDelete: () => void;
}) {
  const canEdit =
    (can(role, 'podcast.episode.edit_own') || can(role, 'podcast.episode.edit_any')) && isOwn;
  return (
    <>
      {canEdit ? (
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
            Cover Image
          </p>
          <CoverUploader value={liveEpisode.coverUrl ?? ''} onChange={onCoverChange} />
        </div>
      ) : liveEpisode.coverUrl ? (
        <img
          src={liveEpisode.coverUrl}
          alt={liveEpisode.title}
          crossOrigin="anonymous"
          className="w-full h-44 object-cover rounded-sm"
        />
      ) : null}

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock size={13} />
          {formatDuration(liveEpisode.durationSeconds ?? 0)}
        </span>
        {liveEpisode.scheduledFor && (
          <span className="flex items-center gap-1.5">
            <Calendar size={13} />
            {liveEpisode.status === 'published' ? 'Published ' : 'Scheduled '}
            {formatDate(liveEpisode.scheduledFor)}
          </span>
        )}
        <StatusPill status={liveEpisode.status} />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Description
        </p>
        {(can(role, 'podcast.episode.edit_own') || can(role, 'podcast.episode.edit_any')) && isOwn ? (
          <div className="space-y-2">
            <Textarea
              value={descEdit}
              onChange={(e) => setDescEdit(e.target.value)}
              className="h-32 resize-none text-sm"
            />
            <Button variant="outline" size="sm" onClick={handleSaveDesc}>
              Save Description
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {liveEpisode.description || 'No description yet.'}
          </p>
        )}
      </div>

      {liveEpisode.audioUrl && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
            Audio Preview
          </p>
          <audio
            controls
            src={liveEpisode.audioUrl}
            className="w-full rounded-sm"
          />
        </div>
      )}

      {/* Next step */}
      <div className="border border-border rounded-sm p-4 bg-muted/30">
        <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-3">
          Next Step
        </p>
        {renderNextStep() ?? (
          <p className="text-sm text-muted-foreground">
            No actions available for your role at this stage.
          </p>
        )}
      </div>

      {canDelete && (
        <button
          onClick={handleDelete}
          className="flex items-center gap-2 text-xs text-destructive hover:text-destructive/80 transition-colors"
        >
          <Trash size={12} />
          Delete this episode
        </button>
      )}
    </>
  );
}

// ── GUESTS ──

export function GuestsTab({
  liveEpisode,
  liveGuests,
  role,
  isOwn,
  guestForm,
  setGuestForm,
  handleAddGuest,
  removeGuest,
  advanceStatus,
  setTab,
}: {
  liveEpisode: PodcastEpisode;
  liveGuests: EpisodeGuest[];
  role: UserRole | undefined;
  isOwn: boolean;
  guestForm: { name: string; title: string; bio: string };
  setGuestForm: React.Dispatch<React.SetStateAction<{ name: string; title: string; bio: string }>>;
  handleAddGuest: () => void;
  removeGuest: (episodeId: string, guestId: string) => void;
  advanceStatus: (episodeId: string, status: PodcastEpisode['status']) => void;
  setTab: React.Dispatch<React.SetStateAction<DetailTab>>;
}) {
  return (
    <>
      {liveGuests.length === 0 ? (
        <div className="text-center py-12 border border-border rounded-sm bg-card">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Users size={18} className="text-primary" />
          </div>
          <p className="font-[family-name:var(--font-display)] font-bold text-foreground mb-1">
            No guests yet
          </p>
          <p className="text-xs text-muted-foreground">
            Add guests and their credits below.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {liveGuests.map((guest) => (
            <div
              key={guest.id}
              className="flex items-start justify-between gap-3 p-3 border border-border rounded-sm bg-card"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Users size={12} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{guest.name}</p>
                  <p className="text-xs text-muted-foreground">{guest.title}</p>
                  {guest.bio && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{guest.bio}</p>
                  )}
                </div>
              </div>
              {can(role, 'podcast.guests.manage') && isOwn && (
                <button
                  aria-label={`Remove ${guest.name}`}
                  onClick={() => {
                    removeGuest(liveEpisode.id, guest.id);
                    toast.success(`${guest.name} removed.`);
                  }}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {can(role, 'podcast.guests.manage') && isOwn && (
        <div className="border border-border rounded-sm p-4 bg-card space-y-3">
          <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Add Guest
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="g-name" className="text-xs">Name</Label>
              <Input
                id="g-name"
                value={guestForm.name}
                onChange={(e) => setGuestForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="g-title" className="text-xs">Title / Role</Label>
              <Input
                id="g-title"
                value={guestForm.title}
                onChange={(e) => setGuestForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Head Trainer"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="g-bio" className="text-xs">Bio (optional)</Label>
            <Textarea
              id="g-bio"
              value={guestForm.bio}
              onChange={(e) => setGuestForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="Short biography"
              className="mt-1 h-16 resize-none text-sm"
            />
          </div>
          <Button size="sm" className="bg-primary text-primary-foreground" onClick={handleAddGuest}>
            <Plus size={13} className="mr-1.5" />
            Add Guest
          </Button>

          {liveEpisode.status === 'audio_uploaded' && liveGuests.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                advanceStatus(liveEpisode.id, 'guests_added');
                toast.success('Guest list confirmed. Ready for description.');
                setTab('overview');
              }}
            >
              <ArrowRight size={13} className="mr-1.5" />
              Confirm Guest List
            </Button>
          )}
        </div>
      )}
    </>
  );
}

// ── DISTRIBUTION ──

export function DistributionTab({
  liveEpisode,
  liveChannels,
  role,
  isOwn,
  handleToggleChannel,
}: {
  liveEpisode: PodcastEpisode;
  liveChannels: DistributionChannel[];
  role: UserRole | undefined;
  isOwn: boolean;
  handleToggleChannel: (ch: DistributionChannel) => void;
}) {
  return (
    <>
      <div>
        <p className="text-sm font-medium text-foreground mb-1">Distribution Channels</p>
        <p className="text-xs text-muted-foreground mb-4">
          Select where this episode will be published once approved.
        </p>
      </div>

      <div className="space-y-2">
        {DISTRIBUTION_CHANNELS.map((ch) => {
          const active = liveChannels.includes(ch.id);
          // Server only persists channel edits for episodes you can edit
          // (edit_any, or your own via edit_own). Gate on isOwn so the toggle
          // isn't enabled into a silent 403 for other producers' episodes.
          const canToggle =
            can(role, 'podcast.distribution.manage') && isOwn && liveEpisode.status !== 'published';
          return (
            <button
              key={ch.id}
              disabled={!canToggle}
              onClick={() => canToggle && handleToggleChannel(ch.id)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-sm border text-left transition-all',
                active
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-card text-muted-foreground',
                canToggle && 'hover:border-primary/50 cursor-pointer',
                !canToggle && 'opacity-60 cursor-not-allowed'
              )}
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <span
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center',
                    active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {ch.icon}
                </span>
                {ch.label}
              </span>
              <div
                className={cn(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                  active ? 'border-primary bg-primary' : 'border-border'
                )}
              >
                {active && <CheckCircle size={10} className="text-primary-foreground" />}
              </div>
            </button>
          );
        })}
      </div>

      {liveEpisode.status === 'published' && liveChannels.length > 0 && (
        <div className="mt-4 p-4 rounded-sm border border-primary/20 bg-primary/5">
          <p className="text-xs font-medium text-primary mb-1">Live on {liveChannels.length} channels</p>
          <DistributionBadges channels={liveChannels} />
        </div>
      )}
    </>
  );
}

// ── REVIEW ──

export function ReviewTab({
  liveEpisode,
  role,
  reviewNote,
  setReviewNote,
  handleSaveNote,
  advanceStatus,
  onClose,
  setTab,
}: {
  liveEpisode: PodcastEpisode;
  role: UserRole | undefined;
  reviewNote: string;
  setReviewNote: React.Dispatch<React.SetStateAction<string>>;
  handleSaveNote: () => void;
  advanceStatus: (episodeId: string, status: PodcastEpisode['status']) => void;
  onClose: () => void;
  setTab: React.Dispatch<React.SetStateAction<DetailTab>>;
}) {
  return (
    <>
      <div>
        <p className="text-sm font-medium text-foreground mb-1">Review Notes</p>
        <p className="text-xs text-muted-foreground mb-4">
          Editorial feedback for the producer before final approval.
        </p>
      </div>

      {can(role, 'podcast.episode.approve') ? (
        <div className="space-y-3">
          <Textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Provide feedback for the producer…"
            className="h-36 resize-none"
          />
          <Button variant="outline" size="sm" onClick={handleSaveNote}>
            Save Review Notes
          </Button>
        </div>
      ) : (
        <div className="p-4 border border-border rounded-sm bg-muted/30">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {liveEpisode.reviewNotes || 'No review notes yet.'}
          </p>
        </div>
      )}

      {liveEpisode.status === 'in_review' && can(role, 'podcast.episode.approve') && (
        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1 bg-primary text-primary-foreground"
            onClick={() => {
              advanceStatus(liveEpisode.id, 'published');
              toast.success('Episode approved and published.');
              onClose();
            }}
          >
            <CheckCircle size={14} className="mr-1.5" />
            Approve & Publish
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              advanceStatus(liveEpisode.id, 'scheduled');
              toast.success('Episode returned for revisions.');
              setTab('overview');
            }}
          >
            Return for Revisions
          </Button>
        </div>
      )}
    </>
  );
}
