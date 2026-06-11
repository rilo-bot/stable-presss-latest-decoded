import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Mic, Plus, Upload, Users, Calendar, Eye, CheckCircle, LoaderCircle, ChevronRight, X, Star, Globe, Mail, Trash, ArrowRight, Clock } from 'lucide-react';

import { useAuthStore } from '@/stores/authStore';
import { usePodcastStore } from '@/stores/podcastStore';
import { can, canEditEpisode } from '@/lib/permissions';
import type { EpisodeStatus, DistributionChannel, PodcastEpisode } from '@/types/podcast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ── Constants ────────────────────────────────────────────────────────────────

const WORKFLOW_STAGES: { status: EpisodeStatus; label: string; icon: React.ReactNode; description: string }[] = [
  { status: 'draft', label: 'Draft', icon: <Mic size={14} />, description: 'Episode created, awaiting production.' },
  { status: 'audio_uploaded', label: 'Audio Ready', icon: <Upload size={14} />, description: 'Audio file attached and trimmed.' },
  { status: 'guests_added', label: 'Guests Added', icon: <Users size={14} />, description: 'Guest bios and credits confirmed.' },
  { status: 'description_written', label: 'Copy Done', icon: <Star size={14} />, description: 'Description and show notes finalised.' },
  { status: 'scheduled', label: 'Scheduled', icon: <Calendar size={14} />, description: 'Publish date locked in.' },
  { status: 'in_review', label: 'In Review', icon: <Eye size={14} />, description: 'Awaiting editorial sign-off.' },
  { status: 'published', label: 'Published', icon: <CheckCircle size={14} />, description: 'Live across all selected channels.' },
];

const DISTRIBUTION_CHANNELS: { id: DistributionChannel; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'spotify', label: 'Spotify', icon: <LoaderCircle size={14} />, color: 'bg-[#1DB954]/15 text-[#1DB954] border-[#1DB954]/30' },
  { id: 'apple_podcasts', label: 'Apple Podcasts', icon: <Mic size={14} />, color: 'bg-primary/15 text-primary border-primary/30' },
  { id: 'rss_feed', label: 'RSS Feed', icon: <Globe size={14} />, color: 'bg-[hsl(var(--brand-accent)/0.15)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent))/0.3]' },
  { id: 'website', label: 'Website', icon: <Globe size={14} />, color: 'bg-muted text-foreground border-border' },
  { id: 'newsletter', label: 'Newsletter', icon: <Mail size={14} />, color: 'bg-muted text-foreground border-border' },
];

const STATUS_COLORS: Record<EpisodeStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  audio_uploaded: 'bg-primary/10 text-primary border-primary/20',
  guests_added: 'bg-primary/15 text-primary border-primary/30',
  description_written: 'bg-[hsl(var(--brand-accent)/0.12)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent))/0.25]',
  scheduled: 'bg-[hsl(var(--brand-accent)/0.18)] text-[hsl(var(--brand-accent))] border-[hsl(var(--brand-accent))/0.35]',
  in_review: 'bg-destructive/10 text-destructive border-destructive/25',
  published: 'bg-primary text-primary-foreground border-primary',
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DistributionBadges({ channels }: { channels: DistributionChannel[] }) {
  const safeChannels = channels ?? [];
  return (
    <div className="flex flex-wrap gap-1">
      {DISTRIBUTION_CHANNELS.map((ch) => {
        const active = safeChannels.includes(ch.id);
        return (
          <span
            key={ch.id}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium border',
              active ? ch.color : 'opacity-30 bg-muted text-muted-foreground border-border'
            )}
          >
            {ch.icon}
            {ch.label}
          </span>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: EpisodeStatus }) {
  const stage = WORKFLOW_STAGES.find((s) => s.status === status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wide border',
        STATUS_COLORS[status]
      )}
    >
      {stage?.icon}
      {stage?.label}
    </span>
  );
}

// ── Episode Card ─────────────────────────────────────────────────────────────

function EpisodeCard({
  episode,
  onOpen,
}: {
  episode: PodcastEpisode;
  onOpen: (ep: PodcastEpisode) => void;
}) {
  const guests = episode.guests ?? [];
  const distributionChannels = episode.distributionChannels ?? [];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="bg-card border border-border rounded-sm hover:border-primary/40 transition-colors cursor-pointer group"
      onClick={() => onOpen(episode)}
    >
      {episode.coverUrl && (
        <div className="relative h-24 overflow-hidden rounded-t-sm">
          <img
            src={episode.coverUrl}
            alt={episode.title}
            crossOrigin="anonymous"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
          <div className="absolute bottom-2 left-3">
            <StatusPill status={episode.status} />
          </div>
        </div>
      )}

      <div className="p-3">
        {!episode.coverUrl && (
          <div className="mb-2">
            <StatusPill status={episode.status} />
          </div>
        )}

        <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1">
          S{episode.season} · Ep {episode.episodeNumber}
        </p>
        <h4 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground leading-snug line-clamp-2 mb-2">
          {episode.title}
        </h4>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {formatDuration(episode.durationSeconds ?? 0)}
          </span>
          {guests.length > 0 && (
            <span className="flex items-center gap-1">
              <Users size={10} />
              {guests.length} guest{guests.length !== 1 ? 's' : ''}
            </span>
          )}
          {episode.scheduledFor && episode.status !== 'published' && (
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(episode.scheduledFor)}
            </span>
          )}
        </div>

        {distributionChannels.length > 0 && (
          <div className="mt-2">
            <DistributionBadges channels={distributionChannels} />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{episode.host}</span>
          <ChevronRight size={12} className="text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
    </motion.div>
  );
}

// ── Create Episode Dialog ─────────────────────────────────────────────────────

function CreateEpisodeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const createEpisode = usePodcastStore((s) => s.createEpisode);

  const [form, setForm] = useState({
    title: '',
    description: '',
    host: currentUser?.displayName ?? '',
    season: 1,
    episodeNumber: 1,
    durationSeconds: 0,
    audioUrl: '',
    coverUrl: '',
    relatedArticleIds: [] as string[],
    producedBy: currentUser?.displayName ?? '',
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast.error('Episode title is required.');
      return;
    }
    if (!form.host.trim()) {
      toast.error('Host name is required.');
      return;
    }
    setSaving(true);
    setTimeout(() => {
      createEpisode({ ...form, publishedAt: '' });
      toast.success('Episode draft created. Ready for production.');
      setSaving(false);
      onClose();
      setForm({
        title: '',
        description: '',
        host: currentUser?.displayName ?? '',
        season: 1,
        episodeNumber: 1,
        durationSeconds: 0,
        audioUrl: '',
        coverUrl: '',
        relatedArticleIds: [],
        producedBy: currentUser?.displayName ?? '',
      });
    }, 400);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl">
            New Episode
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="ep-title">Episode Title</Label>
            <Input
              id="ep-title"
              placeholder="e.g. Behind the Gates at Randwick"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ep-host">Host</Label>
              <Input
                id="ep-host"
                placeholder="Host name"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ep-season">Season</Label>
              <Input
                id="ep-season"
                type="number"
                min={1}
                value={form.season}
                onChange={(e) => setForm((f) => ({ ...f, season: Number(e.target.value) }))}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ep-num">Episode Number</Label>
              <Input
                id="ep-num"
                type="number"
                min={1}
                value={form.episodeNumber}
                onChange={(e) => setForm((f) => ({ ...f, episodeNumber: Number(e.target.value) }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ep-duration">Duration (minutes)</Label>
              <Input
                id="ep-duration"
                type="number"
                min={0}
                value={Math.floor(form.durationSeconds / 60) || ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, durationSeconds: Number(e.target.value) * 60 }))
                }
                className="mt-1"
                placeholder="e.g. 52"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ep-desc">Description</Label>
            <Textarea
              id="ep-desc"
              placeholder="What is this episode about?"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="mt-1 h-24 resize-none"
            />
          </div>

          <div>
            <Label htmlFor="ep-audio">Audio URL</Label>
            <Input
              id="ep-audio"
              placeholder="https://…/episode.mp3"
              value={form.audioUrl}
              onChange={(e) => setForm((f) => ({ ...f, audioUrl: e.target.value }))}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="ep-cover">Cover Image URL (optional)</Label>
            <Input
              id="ep-cover"
              placeholder="https://…/cover.jpg"
              value={form.coverUrl}
              onChange={(e) => setForm((f) => ({ ...f, coverUrl: e.target.value }))}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? 'Creating…' : 'Create Episode Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Episode Detail Panel ──────────────────────────────────────────────────────

function EpisodeDetailPanel({
  episode,
  onClose,
}: {
  episode: PodcastEpisode;
  onClose: () => void;
}) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const role = currentUser?.role;

  const advanceStatus = usePodcastStore((s) => s.advanceStatus);
  const addGuest = usePodcastStore((s) => s.addGuest);
  const removeGuest = usePodcastStore((s) => s.removeGuest);
  const setDistributionChannels = usePodcastStore((s) => s.setDistributionChannels);
  const setSchedule = usePodcastStore((s) => s.setSchedule);
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

  const isOwn = canEditEpisode(role, liveEpisode.producedBy, currentUser?.displayName);
  const canAdvanceToAudio = can(role, 'podcast.audio.upload') && liveEpisode.status === 'draft' && isOwn;
  const canAdvanceToGuests = can(role, 'podcast.guests.manage') && liveEpisode.status === 'audio_uploaded' && isOwn;
  const canAdvanceToDesc = (can(role, 'podcast.episode.edit_own') || can(role, 'podcast.episode.edit_any')) && liveEpisode.status === 'guests_added' && isOwn;
  const canAdvanceToScheduled = can(role, 'podcast.episode.schedule') && liveEpisode.status === 'description_written' && isOwn;
  const canSubmitReview = can(role, 'podcast.episode.submit_review') && liveEpisode.status === 'scheduled' && isOwn;
  const canApprove = can(role, 'podcast.episode.approve') && liveEpisode.status === 'in_review';
  const canDelete = can(role, 'podcast.episode.delete') && liveEpisode.status !== 'published' && isOwn;

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

  const handleSchedule = () => {
    if (!scheduleDate) {
      toast.error('Please select a publish date.');
      return;
    }
    setSchedule(liveEpisode.id, new Date(scheduleDate).toISOString());
    toast.success('Publish date set.');
  };

  const handleSaveDesc = () => {
    updateEpisode(liveEpisode.id, { description: descEdit });
    toast.success('Description saved.');
  };

  const handleSaveNote = () => {
    addReviewNote(liveEpisode.id, reviewNote);
    toast.success('Review note saved.');
  };

  const handleDelete = () => {
    deleteEpisode(liveEpisode.id);
    toast.success('Episode deleted.');
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
            onClick={() => {
              handleSchedule();
              advanceStatus(liveEpisode.id, 'scheduled');
            }}
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
          onClick={() => {
            handleSaveDesc();
            advanceStatus(liveEpisode.id, 'description_written');
          }}
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
        <Button
          className="w-full bg-primary text-primary-foreground"
          onClick={() => {
            advanceStatus(liveEpisode.id, 'audio_uploaded');
            toast.success('Audio marked as uploaded. Ready for guests.');
          }}
        >
          <Upload size={14} className="mr-1.5" />
          Mark Audio as Uploaded
        </Button>
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <>
              {liveEpisode.coverUrl && (
                <img
                  src={liveEpisode.coverUrl}
                  alt={liveEpisode.title}
                  crossOrigin="anonymous"
                  className="w-full h-44 object-cover rounded-sm"
                />
              )}

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
          )}

          {/* ── GUESTS ── */}
          {tab === 'guests' && (
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
          )}

          {/* ── DISTRIBUTION ── */}
          {tab === 'distribution' && (
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
                  const canToggle = can(role, 'podcast.distribution.manage') && liveEpisode.status !== 'published';
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
          )}

          {/* ── REVIEW ── */}
          {tab === 'review' && (
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
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PodcastWorkflow() {
  // === auto fetch-on-mount (backend planner) ===
  const fetchPodcastEpisodes = usePodcastStore((s) => s.fetchPodcastEpisodes);
  useEffect(() => {
    fetchPodcastEpisodes();
  }, [fetchPodcastEpisodes]);
  // === end auto fetch-on-mount ===

  const currentUser = useAuthStore((s) => s.currentUser);
  const navigate = useNavigate();
  const role = currentUser?.role;

  const episodes = usePodcastStore((s) => s.episodes);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<PodcastEpisode | null>(null);
  const [filterStatus, setFilterStatus] = useState<EpisodeStatus | 'all'>('all');

  const hasPodcastAccess =
    can(role, 'podcast.manage') ||
    can(role, 'podcast.episode.create') ||
    can(role, 'podcast.episode.approve') ||
    can(role, 'podcast.episode.edit_any');

  const canCreate = can(role, 'podcast.episode.create');

  const filteredEpisodes = useMemo(() => {
    const base =
      filterStatus === 'all'
        ? episodes
        : episodes.filter((e) => e.status === filterStatus);
    return [...base].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [episodes, filterStatus]);

  const statsByStatus = useMemo(
    () =>
      WORKFLOW_STAGES.reduce((acc, s) => {
        acc[s.status] = episodes.filter((e) => e.status === s.status).length;
        return acc;
      }, {} as Record<EpisodeStatus, number>),
    [episodes]
  );

  if (!hasPodcastAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mic size={24} className="text-primary" />
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-2">
            Restricted Access
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Podcast workflow management is available to Podcast Producers, Editors, and Administrators.
          </p>
          <Button variant="outline" onClick={() => navigate('/newsroom')}>
            Return to Newsroom
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      {/* Header band */}
      <section className="bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-primary-foreground/60 mb-2">
                Podcast Production
              </p>
              <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold">
                Publishing Workflow
              </h1>
              <div
                className="h-px w-16 mt-3 opacity-40"
                style={{ background: 'hsl(var(--brand-accent))' }}
              />
              <p className="mt-3 text-primary-foreground/70 text-sm max-w-lg">
                Manage every episode from first draft to live distribution across Spotify, Apple
                Podcasts, RSS, and beyond.
              </p>
            </div>

            {/* Macro stats */}
            <div className="flex flex-wrap items-center gap-5">
              {[
                { label: 'Total', count: episodes.length },
                {
                  label: 'In Production',
                  count: episodes.filter(
                    (e) => e.status !== 'published' && e.status !== 'draft'
                  ).length,
                },
                { label: 'Live', count: statsByStatus['published'] ?? 0 },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div
                    className="font-[family-name:var(--font-display)] text-3xl font-bold tabular-nums"
                    style={{ color: 'hsl(var(--brand-accent))' }}
                  >
                    {s.count}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-primary-foreground/60">
                    {s.label}
                  </div>
                </div>
              ))}

              {canCreate && (
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-medium"
                >
                  <Plus size={15} className="mr-1.5" />
                  New Episode
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Workflow pipeline summary */}
      <section className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            <button
              onClick={() => setFilterStatus('all')}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-medium border transition-colors',
                filterStatus === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/40'
              )}
            >
              All
              <span className="font-bold tabular-nums">{episodes.length}</span>
            </button>

            {WORKFLOW_STAGES.map((stage, i) => (
              <div key={stage.status} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight size={10} className="text-muted-foreground/40 flex-shrink-0" />
                )}
                <button
                  onClick={() => setFilterStatus(stage.status)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-medium border transition-colors',
                    filterStatus === stage.status
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                  )}
                >
                  {stage.icon}
                  {stage.label}
                  {(statsByStatus[stage.status] ?? 0) > 0 && (
                    <span
                      className={cn(
                        'font-bold tabular-nums text-[10px] px-1.5 py-0.5 rounded-full',
                        filterStatus === stage.status
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-primary/15 text-primary'
                      )}
                    >
                      {statsByStatus[stage.status]}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Episode grid */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {filteredEpisodes.length === 0 ? (
          <div className="text-center py-20 border border-border rounded-sm bg-card">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Mic size={24} className="text-primary" />
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground mb-2">
              {filterStatus === 'all'
                ? 'No episodes yet.'
                : `No episodes in ${WORKFLOW_STAGES.find((s) => s.status === filterStatus)?.label}.`}
            </h3>
            <div
              className="h-px w-12 mx-auto mb-3"
              style={{ background: 'hsl(var(--brand-accent))' }}
            />
            <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
              {filterStatus === 'all'
                ? 'Create your first episode to begin the production workflow.'
                : 'Episodes will appear here as they move through the pipeline.'}
            </p>
            {canCreate && filterStatus === 'all' && (
              <Button
                className="bg-primary text-primary-foreground"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={14} className="mr-1.5" />
                Create First Episode
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredEpisodes.map((ep) => (
                <EpisodeCard key={ep.id} episode={ep} onOpen={setSelectedEpisode} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* How it works — workflow guide */}
      <section className="border-t border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
          <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-6">
            How the Pipeline Works
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {WORKFLOW_STAGES.map((stage, i) => (
              <div key={stage.status} className="flex md:flex-col items-start gap-3 md:gap-2">
                <div className="flex md:flex-col items-center gap-2 md:w-full">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                    {stage.icon}
                  </div>
                  {i < WORKFLOW_STAGES.length - 1 && (
                    <div className="hidden md:block h-px w-full bg-border/60 mt-1 mb-1" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{stage.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    {stage.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dialogs / panels */}
      <CreateEpisodeDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <AnimatePresence>
        {selectedEpisode && (
          <EpisodeDetailPanel
            key={selectedEpisode.id}
            episode={selectedEpisode}
            onClose={() => setSelectedEpisode(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}