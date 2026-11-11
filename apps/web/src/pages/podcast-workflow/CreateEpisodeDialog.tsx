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
import { CoverUploader, AudioUploader } from './uploaders';

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
    host: currentUser?.name ?? '',
    season: 1,
    episodeNumber: 1,
    durationSeconds: 0,
    audioUrl: '',
    coverUrl: '',
    relatedArticleIds: [] as string[],
    producedBy: currentUser?.name ?? '',
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('Episode title is required.');
      return;
    }
    if (!form.host.trim()) {
      toast.error('Host name is required.');
      return;
    }
    setSaving(true);
    const id = await createEpisode({ ...form, publishedAt: '' });
    setSaving(false);
    // createEpisode returns undefined and surfaces its own error toast on failure;
    // only confirm + close when it actually persisted.
    if (!id) return;
    toast.success('Episode draft created. Ready for production.');
    onClose();
    setForm({
      title: '',
      description: '',
      host: currentUser?.name ?? '',
      season: 1,
      episodeNumber: 1,
      durationSeconds: 0,
      audioUrl: '',
      coverUrl: '',
      relatedArticleIds: [],
      producedBy: currentUser?.name ?? '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[88vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl">
            New Episode
          </DialogTitle>
        </DialogHeader>

        {/* -mr-6/pr-5 pulls the scroll gutter to the panel edge so the slim
            scrollbar sits flush rather than floating inside the padding. */}
        <div className="space-y-4 py-1 overflow-y-auto min-h-0 slim-scroll -mr-6 pr-5">
          <div>
            <Label htmlFor="ep-title">Episode Title</Label>
            <Input
              id="ep-title"
              data-agent-id="podcast.create-title"
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
                data-agent-id="podcast.create-host"
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
                data-agent-id="podcast.create-season"
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
                data-agent-id="podcast.create-number"
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
                data-agent-id="podcast.create-duration"
                type="number"
                min={0}
                value={Math.floor(form.durationSeconds / 60) || ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, durationSeconds: (Number(e.target.value) || 0) * 60 }))
                }
                className="mt-1"
                placeholder="Auto-filled from audio"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ep-desc">Description</Label>
            <Textarea
              id="ep-desc"
              data-agent-id="podcast.create-description"
              placeholder="What is this episode about?"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="mt-1 h-24 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Episode Audio</Label>
              <div className="mt-1.5">
                <AudioUploader
                  agentId="podcast.create-audio"
                  value={form.audioUrl}
                  onChange={(url, seconds) =>
                    setForm((f) => ({
                      ...f,
                      audioUrl: url,
                      durationSeconds: seconds ?? f.durationSeconds,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label>Cover Image (optional)</Label>
              <div className="mt-1.5">
                <CoverUploader
                  agentId="podcast.create-cover"
                  value={form.coverUrl}
                  onChange={(url) => setForm((f) => ({ ...f, coverUrl: url }))}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" data-agent-id="podcast.create-cancel">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={saving} className="bg-primary text-primary-foreground" data-agent-id="podcast.create-submit">
            {saving ? 'Creating…' : 'Create Episode Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
