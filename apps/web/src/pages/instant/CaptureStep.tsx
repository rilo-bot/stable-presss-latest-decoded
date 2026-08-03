/**
 * Instant, step one: the capture.
 *
 * Mode toggle → topic line → photos → voice note → Generate. Any ONE of the three
 * inputs is enough; the button says which are missing rather than sitting dead
 * with no explanation.
 *
 * "Take photo" and "Add photos" are the same file input, one with `capture` set.
 * That attribute is the whole difference between the camera and the library on a
 * phone — no camera API, no permissions dance.
 */
import { useRef } from 'react';
import { AlertCircle, Camera, ImagePlus, Loader2, Zap } from 'lucide-react';

import { cn } from '@/lib/utils';

import { MAX_PHOTOS, MAX_TOPIC_CHARS } from './instantClient';
import { PhotoTray } from './PhotoTray';
import { VoiceNote } from './VoiceNote';
import { useInstantStore } from './instantStore';
import type { InstantMode } from './types';

const MODE_COPY: Record<InstantMode, { label: string; hint: string }> = {
  story: {
    label: 'Story',
    hint: 'Saves as a draft news story — it picks up a category and enters the normal editorial workflow.',
  },
  blog: {
    label: 'Blog post',
    hint: 'Saves as a draft blog post — rich body, excerpt and cover, ready to open in the composer.',
  },
};

interface CaptureStepProps {
  /** Modes this user may actually save to. An empty list is handled upstream. */
  allowedModes: InstantMode[];
}

export function CaptureStep({ allowedModes }: CaptureStepProps) {
  const {
    mode, topic, transcript, photos, coverPhotoId, step, progress, error,
    setMode, setTopic, setTranscript, addPhotos, removePhoto, canGenerate, generate,
  } = useInstantStore();

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const working = step === 'working';
  const ready = canGenerate();
  const roomLeft = MAX_PHOTOS - photos.length;

  const pick = (files: FileList | null) => {
    if (files && files.length > 0) addPhotos(Array.from(files));
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div className="space-y-5 rounded-sm border border-border/60 bg-card p-4 sm:p-6">
        <header className="space-y-1.5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <Zap size={15} className="text-primary" />
            Capture on the go
          </h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Snap photos, record a voice note, add a topic — any one will do. The AI describes what it can see, uses
            what you said as fact, and writes a draft you review before anything is saved.
          </p>
        </header>

        {/* ── Output target ── */}
        {allowedModes.length > 1 && (
          <div className="space-y-1.5">
            <span className="block text-[12.5px] font-medium text-foreground">Save it as</span>
            <div className="inline-flex rounded-sm border border-border/70 p-0.5">
              {allowedModes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={cn(
                    'rounded-sm px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {MODE_COPY[m].label}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-muted-foreground">{MODE_COPY[mode].hint}</p>
          </div>
        )}

        {/* ── Topic ── */}
        <div className="space-y-1.5">
          <label htmlFor="instant-topic" className="block text-[12.5px] font-medium text-foreground">
            Main topic / headline
          </label>
          <input
            id="instant-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value.slice(0, MAX_TOPIC_CHARS))}
            placeholder="e.g. Two-year-old filly gallops at Flemington — trainer pleased"
            className="w-full rounded-sm border border-input bg-background px-3 py-2.5 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[11.5px] text-muted-foreground">
            A short line to steer the AI. Optional if you add a photo or a voice note.
          </p>
        </div>

        {/* ── Photos ── */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[12.5px] font-medium text-foreground">Photos</span>
            <span className="text-[11.5px] text-muted-foreground">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={working || roomLeft <= 0}
              className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Camera size={14} className="text-muted-foreground" /> Take photo
            </button>
            <button
              type="button"
              onClick={() => libraryRef.current?.click()}
              disabled={working || roomLeft <= 0}
              className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <ImagePlus size={14} className="text-muted-foreground" /> Add photos
            </button>
          </div>

          {/* `capture` is what opens the camera rather than the library. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { pick(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { pick(e.target.files); e.target.value = ''; }}
          />

          <PhotoTray photos={photos} coverPhotoId={coverPhotoId} onRemove={removePhoto} />
        </div>

        {/* ── Voice note ── */}
        <div className="space-y-2">
          <span className="block text-[12.5px] font-medium text-foreground">Voice note</span>
          <VoiceNote transcript={transcript} onTranscript={setTranscript} disabled={working} />
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-[12.5px] text-destructive">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {/* ── Generate ── */}
        <div className="space-y-2 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={!ready || working}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {working ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            {working ? progress || 'Working…' : 'Generate draft'}
          </button>
          <p className="text-center text-[11.5px] text-muted-foreground">
            {working
              ? 'This takes a few seconds per photo.'
              : ready
                ? 'Nothing is saved until you review it.'
                : 'Add a topic, a photo, or a voice note to continue.'}
          </p>
        </div>
      </div>
    </div>
  );
}
