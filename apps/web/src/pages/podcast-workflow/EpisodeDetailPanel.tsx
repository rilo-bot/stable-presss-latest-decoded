import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle, ChevronRight, X, Star, Calendar, Upload, ArrowRight } from 'lucide-react';

import { useAuthStore } from '@/stores/authStore';
import { usePodcastStore } from '@/stores/podcastStore';
import { can, canEditEpisode } from '@/lib/permissions';
import type { DistributionChannel, PodcastEpisode } from '@/types/podcast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { WORKFLOW_STAGES } from './constants';
import { canDeleteEpisode } from './helpers';
import { OverviewTab, GuestsTab, DistributionTab, ReviewTab } from './detail-tabs';
import { DeleteEpisodeDialog } from './DeleteEpisodeDialog';
import { AudioUploader } from './uploaders';

// ── Episode Detail Panel ──────────────────────────────────────────────────────

export function EpisodeDetailPanel({
  episode,
  onClose,
}: {
  episode: PodcastEpisode;
  onClose: () => void;
}) {
  const currentUser = useAuthStore((s) => s.currentUser);

  const advanceStatus = usePodcastStore((s) => s.advanceStatus);
  const addGuest = usePodcastStore((s) => s.addGuest);
  const removeGuest = usePodcastStore((s) => s.removeGuest);
  const setDistributionChannels = usePodcastStore((s) => s.setDistributionChannels);
  const addReviewNote = usePodcastStore((s) => s.addReviewNote);
  const updateEpisode = usePodcastStore((s) => s.updateEpisode);
  const deleteEpisode = usePodcastStore((s) => s.deleteEpisode);

  const episodes = usePodcastStore((s) => s.episodes);
  const liveEpisode = useMemo(
    () => episodes.find((e) => e.id === episode.id) ?? episode,
    [episodes, episode]
  );

  // Safe array accessors — guard against episodes missing these fields
  const liveGuests = liveEpisode.guests ?? [];
  const liveChannels = liveEpisode.distributionChannels ?? [];

  const [guestForm, setGuestForm] = useState({ name: '', title: '', bio: '' });
  const [scheduleDate, setScheduleDate] = useState(
    liveEpisode.scheduledFor ? liveEpisode.scheduledFor.slice(0, 10) : ''
  );
  const [reviewNote, setReviewNote] = useState(liveEpisode.reviewNotes ?? '');
  const [descEdit, setDescEdit] = useState(liveEpisode.description ?? '');
  const [tab, setTab] = useState<'overview' | 'guests' | 'distribution' | 'review'>('overview');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwn = canEditEpisode(liveEpisode.producedBy, currentUser?.displayName);
  const canAdvanceToAudio = can('podcast.audio.upload') && liveEpisode.status === 'draft' && isOwn;
  const canAdvanceToGuests = can('podcast.guests.manage') && liveEpisode.status === 'audio_uploaded' && isOwn;
  const canAdvanceToDesc = (can('podcast.episode.edit_own') || can('podcast.episode.edit_any')) && liveEpisode.status === 'guests_added' && isOwn;
  const canAdvanceToScheduled = can('podcast.episode.schedule') && liveEpisode.status === 'description_written' && isOwn;
  const canSubmitReview = can('podcast.episode.submit_review') && liveEpisode.status === 'scheduled' && isOwn;
  const canApprove = can('podcast.episode.approve') && liveEpisode.status === 'in_review';
  // Shared with the card on the Podcast screen, and it mirrors the route's own
  // three clauses — the local version here missed `podcast.manage`, so an admin
  // whose role held the umbrella but neither edit power was refused a button the
  // server would have honoured.
  const canDelete = canDeleteEpisode(liveEpisode, currentUser?.displayName);

  const handleAddGuest = () => {
    if (!guestForm.name.trim()) {
      toast.error('Guest name is required.');
      return;
    }
    addGuest(liveEpisode.id, guestForm);
    setGuestForm({ name: '', title: '', bio: '' });
    toast.success(`${guestForm.name} added as a guest.`);
  };

  const handleToggleChannel = (ch: DistributionChannel) => {
    const updated = liveChannels.includes(ch)
      ? liveChannels.filter((c) => c !== ch)
      : [...liveChannels, ch];
    setDistributionChannels(liveEpisode.id, updated);
  };

  // Schedule + advance in ONE update so the date and status can't race or land
  // half-applied. Anchored at local noon so the chosen day doesn't drift across
  // time zones when serialised to UTC.
  const handleSchedule = () => {
    if (!scheduleDate) {
      toast.error('Please select a publish date.');
      return;
    }
    const iso = new Date(`${scheduleDate}T12:00:00`).toISOString();
    updateEpisode(liveEpisode.id, { scheduledFor: iso, status: 'scheduled' });
    toast.success('Publish date set. Episode scheduled.');
  };

  const handleSaveDesc = () => {
    updateEpisode(liveEpisode.id, { description: descEdit });
    toast.success('Description saved.');
  };

  // Save copy + advance to description_written atomically (single PUT).
  const handleMarkCopyDone = () => {
    updateEpisode(liveEpisode.id, { description: descEdit, status: 'description_written' });
    toast.success('Copy marked as done.');
  };

  const handleSaveNote = () => {
    addReviewNote(liveEpisode.id, reviewNote);
    toast.success('Review note saved.');
  };

  const handleCoverChange = (url: string) => {
    updateEpisode(liveEpisode.id, { coverUrl: url });
  };

  // Ask first. This used to delete on the single click, then announce success
  // whatever the server said — including when it refused, which left the episode
  // on screen under a toast claiming it was gone.
  const confirmDelete = async () => {
    setDeleting(true);
    const ok = await deleteEpisode(liveEpisode.id);
    setDeleting(false);
    // Closed either way — on refusal the store has already surfaced the reason
    // and put the episode back. Before `onClose()` so the dialog doesn't sit over
    // the drawer's exit animation.
    setConfirmingDelete(false);
    if (!ok) return;
    toast.success(`“${liveEpisode.title}” deleted.`);
    onClose();
  };

  // Next-step CTA
  const renderNextStep = () => {
    if (liveEpisode.status === 'published') {
      return (
        <div className="flex items-center gap-2 px-4 py-3 rounded-sm bg-primary/10 border border-primary/20">
          <CheckCircle size={16} className="text-primary" />
          <span className="text-sm font-medium text-primary">
            Published across {liveChannels.length} channel{liveChannels.length !== 1 ? 's' : ''}
          </span>
        </div>
      );
    }

    if (canApprove) {
      return (
        <div className="flex gap-2">
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
            }}
          >
            Return for Revisions
          </Button>
        </div>
      );
    }

    if (canSubmitReview) {
      return (
        <Button
          className="w-full bg-primary text-primary-foreground"
          onClick={() => {
            advanceStatus(liveEpisode.id, 'in_review');
            toast.success('Episode submitted for approval review.');
          }}
        >
          <ArrowRight size={14} className="mr-1.5" />
          Submit for Approval Review
        </Button>
      );
    }

    if (canAdvanceToScheduled) {
      return (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="sched-date" className="text-xs">Publish Date</Label>
            <Input
              id="sched-date"
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button
            className="bg-primary text-primary-foreground"
            onClick={handleSchedule}
          >
            <Calendar size={14} className="mr-1.5" />
            Schedule
          </Button>
        </div>
      );
    }

    if (canAdvanceToDesc) {
      return (
        <Button
          className="w-full bg-primary text-primary-foreground"
          onClick={handleMarkCopyDone}
        >
          <Star size={14} className="mr-1.5" />
          Mark Copy as Done
        </Button>
      );
    }

    if (canAdvanceToGuests) {
      return (
        <p className="text-xs text-muted-foreground">
          Add at least one guest, then advance to the next stage.
        </p>
      );
    }

    if (canAdvanceToAudio) {
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Upload the episode audio, then continue to guests.
          </p>
          <AudioUploader
            value={liveEpisode.audioUrl ?? ''}
            onChange={(url, seconds) =>
              updateEpisode(liveEpisode.id, {
                audioUrl: url,
                ...(seconds ? { durationSeconds: seconds } : {}),
              })
            }
          />
          <Button
            className="w-full bg-primary text-primary-foreground"
            disabled={!liveEpisode.audioUrl}
            onClick={() => {
              advanceStatus(liveEpisode.id, 'audio_uploaded');
              toast.success('Audio ready. Next: add guests.');
            }}
          >
            <Upload size={14} className="mr-1.5" />
            Confirm Audio &amp; Continue
          </Button>
        </div>
      );
    }

    return null;
  };

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'guests', label: `Guests (${liveGuests.length})` },
    { id: 'distribution', label: 'Distribution' },
    { id: 'review', label: 'Review' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-foreground/30" onClick={onClose} />

      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 260 }}
        className="w-full max-w-2xl bg-background border-l border-border flex flex-col h-full overflow-hidden"
      >
        {/* Header */}
        <div className="bg-primary text-primary-foreground px-6 py-5 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.1em] text-primary-foreground/60 mb-1">
                S{liveEpisode.season} · Episode {liveEpisode.episodeNumber} · {liveEpisode.host}
              </p>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight">
                {liveEpisode.title}
              </h2>
            </div>
            <button
              aria-label="Close panel"
              onClick={onClose}
              className="mt-0.5 p-1 rounded-sm hover:bg-primary-foreground/10 transition-colors"
            >
              <X size={18} className="text-primary-foreground/70" />
            </button>
          </div>

          {/* Workflow progress */}
          <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
            {WORKFLOW_STAGES.map((stage, i) => {
              const currentIdx = WORKFLOW_STAGES.findIndex((s) => s.status === liveEpisode.status);
              const stageIdx = i;
              const isDone = stageIdx < currentIdx;
              const isCurrent = stageIdx === currentIdx;
              return (
                <div key={stage.status} className="flex items-center gap-1 flex-shrink-0">
                  <div
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-medium transition-colors',
                      isCurrent
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : isDone
                        ? 'text-primary-foreground/70'
                        : 'text-primary-foreground/30'
                    )}
                  >
                    {isDone ? <CheckCircle size={10} /> : stage.icon}
                    <span>{stage.label}</span>
                  </div>
                  {i < WORKFLOW_STAGES.length - 1 && (
                    <ChevronRight size={10} className="text-primary-foreground/25 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border bg-card flex-shrink-0">
          <div className="flex px-6">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-3 text-xs font-medium border-b-2 transition-colors',
                  tab === t.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto slim-scroll p-6 space-y-6">
          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <OverviewTab
              liveEpisode={liveEpisode}

              isOwn={isOwn}
              descEdit={descEdit}
              setDescEdit={setDescEdit}
              handleSaveDesc={handleSaveDesc}
              onCoverChange={handleCoverChange}
              renderNextStep={renderNextStep}
              canDelete={canDelete}
              handleDelete={() => setConfirmingDelete(true)}
            />
          )}

          {/* ── GUESTS ── */}
          {tab === 'guests' && (
            <GuestsTab
              liveEpisode={liveEpisode}
              liveGuests={liveGuests}

              isOwn={isOwn}
              guestForm={guestForm}
              setGuestForm={setGuestForm}
              handleAddGuest={handleAddGuest}
              removeGuest={removeGuest}
              advanceStatus={advanceStatus}
              setTab={setTab}
            />
          )}

          {/* ── DISTRIBUTION ── */}
          {tab === 'distribution' && (
            <DistributionTab
              liveEpisode={liveEpisode}
              liveChannels={liveChannels}

              isOwn={isOwn}
              handleToggleChannel={handleToggleChannel}
            />
          )}

          {/* ── REVIEW ── */}
          {tab === 'review' && (
            <ReviewTab
              liveEpisode={liveEpisode}

              reviewNote={reviewNote}
              setReviewNote={setReviewNote}
              handleSaveNote={handleSaveNote}
              advanceStatus={advanceStatus}
              onClose={onClose}
              setTab={setTab}
            />
          )}
        </div>
      </motion.div>

      <DeleteEpisodeDialog
        episode={confirmingDelete ? liveEpisode : null}
        deleting={deleting}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
