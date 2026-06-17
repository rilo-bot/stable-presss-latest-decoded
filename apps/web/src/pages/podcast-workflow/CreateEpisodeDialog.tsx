import { useState } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/stores/authStore';
import { usePodcastStore } from '@/stores/podcastStore';
import { Button } from '@/components/ui/button';
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

// ── Create Episode Dialog ─────────────────────────────────────────────────────

export function CreateEpisodeDialog({
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
