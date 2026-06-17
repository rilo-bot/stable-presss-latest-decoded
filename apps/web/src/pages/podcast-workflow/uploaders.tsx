import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, Link as LinkIcon, X, Image as ImageIcon, AudioLines } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { uploadImage, uploadLargeFile } from '@/lib/upload';

const MB = 1024 * 1024;

// Matches the server allow-list caps in apps/server/src/routes/uploads.ts.
const IMAGE_MAX = 15 * MB;
const AUDIO_MAX = 250 * MB;

type Mode = 'url' | 'upload';

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-sm bg-muted/40 border border-border/40 w-fit">
      {(['url', 'upload'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[11px] font-semibold transition-colors',
            mode === m
              ? 'bg-card text-foreground shadow-sm border border-border/40'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {m === 'url' ? <LinkIcon size={11} /> : <Upload size={11} />}
          {m === 'url' ? 'Paste URL' : 'Upload File'}
        </button>
      ))}
    </div>
  );
}

// ── Cover image ────────────────────────────────────────────────────────────

export function CoverUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('upload');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image (JPG, PNG, WebP, GIF).');
      return;
    }
    if (file.size > IMAGE_MAX) {
      toast.error(`Image must be under ${Math.round(IMAGE_MAX / MB)} MB.`);
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadImage(file, { kind: 'podcast', maxDim: 1280, quality: 0.8 });
      onChange(url);
      toast.success('Cover image uploaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <ModeToggle mode={mode} setMode={setMode} />

      {mode === 'url' ? (
        <Input
          type="url"
          value={value?.startsWith('data:') ? '' : (value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…/cover.jpg"
        />
      ) : (
        <div
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-1.5 rounded-sm border-2 border-dashed cursor-pointer transition-colors py-5 px-4',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border/50 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
          )}
        >
          <ImageIcon size={18} className="text-primary" />
          <p className="text-xs font-semibold text-foreground">
            {uploading ? 'Uploading…' : dragging ? 'Drop the image' : 'Click or drag & drop a cover'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            JPG, PNG, WebP — optimised to cloud storage
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            aria-label="Upload cover image"
          />
        </div>
      )}

      {value && (
        <div className="relative rounded-sm overflow-hidden border border-border/40 bg-muted/20">
          <img
            src={value}
            alt="Cover preview"
            crossOrigin="anonymous"
            className="w-full h-32 object-cover"
            onError={() => {
              toast.error('Could not load that image. Check the URL.');
              onChange('');
            }}
          />
          <button
            type="button"
            onClick={() => {
              onChange('');
              if (fileRef.current) fileRef.current.value = '';
            }}
            className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded bg-foreground/40 hover:bg-destructive/80 text-primary-foreground text-[10px] font-semibold transition-colors"
            aria-label="Remove cover image"
          >
            <X size={9} />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ── Audio ────────────────────────────────────────────────────────────────────

export function AudioUploader({
  value,
  onChange,
}: {
  value: string;
  /**
   * Fired once with the stored URL and (for uploaded files) the length detected
   * from the file's metadata — emitted together so callers persist both in a
   * single write rather than racing two updates.
   */
  onChange: (url: string, durationSeconds?: number) => void;
}) {
  const [mode, setMode] = useState<Mode>('upload');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Read duration straight from the local file — instant, no network needed.
  const detectDuration = (file: File): Promise<number | undefined> =>
    new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const probe = document.createElement('audio');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        const d = isFinite(probe.duration) && probe.duration > 0 ? Math.round(probe.duration) : undefined;
        URL.revokeObjectURL(objectUrl);
        resolve(d);
      };
      probe.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(undefined);
      };
      probe.src = objectUrl;
    });

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      toast.error('Please choose an audio file (MP3, WAV, AAC, OGG).');
      return;
    }
    if (file.size > AUDIO_MAX) {
      toast.error(`Audio must be under ${Math.round(AUDIO_MAX / MB)} MB.`);
      return;
    }
    setUploading(true);
    setPct(0);
    try {
      const durationPromise = detectDuration(file);
      const { url } = await uploadLargeFile(file, 'podcast', (p) => setPct(p.pct));
      onChange(url, await durationPromise);
      toast.success('Audio uploaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the audio file.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <ModeToggle mode={mode} setMode={setMode} />

      {mode === 'url' ? (
        <Input
          type="url"
          value={value?.startsWith('data:') ? '' : (value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…/episode.mp3"
        />
      ) : (
        <div
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onClick={() => !uploading && fileRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-1.5 rounded-sm border-2 border-dashed transition-colors py-5 px-4',
            uploading ? 'cursor-default' : 'cursor-pointer',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border/50 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
          )}
        >
          <AudioLines size={18} className="text-primary" />
          {uploading ? (
            <>
              <p className="text-xs font-semibold text-foreground">Uploading… {pct}%</p>
              <div className="w-full max-w-xs h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-foreground">
                {dragging ? 'Drop the audio file' : 'Click or drag & drop episode audio'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                MP3, WAV, AAC, OGG — up to {Math.round(AUDIO_MAX / MB)} MB
              </p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            aria-label="Upload episode audio"
          />
        </div>
      )}

      {value && !uploading && (
        <div className="rounded-sm border border-border/40 bg-muted/20 p-2 space-y-2">
          <audio controls src={value} crossOrigin="anonymous" className="w-full" />
          <button
            type="button"
            onClick={() => {
              onChange('');
              if (fileRef.current) fileRef.current.value = '';
            }}
            className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Remove audio"
          >
            <X size={10} />
            Remove audio
          </button>
        </div>
      )}
    </div>
  );
}
