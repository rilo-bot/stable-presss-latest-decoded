import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Upload, Link, Image, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { uploadImage } from '@/lib/upload';
import type { UploadKind } from '@/lib/upload';

/* ── Image uploader: paste URL or upload file ── */
export function ImageUploader({
  value,
  onChange,
  kind = 'horse',
  label = 'image',
  id = 'image-upload',
}: {
  value: string;
  onChange: (url: string) => void;
  /** S3 folder the upload lands in. Defaults to 'horse' for back-compat. */
  kind?: UploadKind;
  /** Short noun used in alt text / aria-labels, e.g. 'horse photo', 'story image'. */
  label?: string;
  /** id for the URL <input>, so an external <Label htmlFor> can target it. */
  id?: string;
}) {
  const [mode, setMode] = useState<'url' | 'upload'>('url');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, WebP, etc.)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB. For larger photos, paste a URL instead.');
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadImage(file, { kind, maxDim: 1280, quality: 0.72 });
      onChange(url);
      toast.success('Image uploaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the image. Try a different file.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearImage = () => {
    onChange('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const isDataUrl = value?.startsWith('data:');

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-0.5 rounded-sm bg-muted/40 border border-border/40 w-fit">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[11px] font-semibold transition-colors',
            mode === 'url'
              ? 'bg-card text-foreground shadow-sm border border-border/40'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Link size={11} />
          Paste URL
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[11px] font-semibold transition-colors',
            mode === 'upload'
              ? 'bg-card text-foreground shadow-sm border border-border/40'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Upload size={11} />
          Upload File
        </button>
      </div>

      {/* URL input mode */}
      {mode === 'url' && (
        <div className="space-y-1.5">
          <Input
            id={id}
            type="url"
            value={isDataUrl ? '' : (value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Paste a direct link to an image. URL-based photos are saved permanently.
          </p>
        </div>
      )}

      {/* File upload mode */}
      {mode === 'upload' && (
        <div className="space-y-2">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'relative flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed cursor-pointer transition-colors py-6 px-4',
              dragging
                ? 'border-primary bg-primary/5'
                : 'border-border/50 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
            )}
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload size={18} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">
                {uploading ? 'Uploading…' : dragging ? 'Drop the image here' : 'Click to browse or drag & drop'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                JPG, PNG, WebP, GIF — max 5 MB
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleInputChange}
              aria-label={`Upload ${label}`}
            />
          </div>

          {/* Upload info */}
          <div className="flex items-start gap-1.5 p-2 rounded-sm bg-[hsl(var(--brand-accent)/0.08)] border border-[hsl(var(--brand-accent)/0.2)]">
            <AlertTriangle size={11} className="text-[hsl(var(--brand-accent))] mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Stored permanently.</span>{' '}
              The image is optimised and uploaded to secure cloud storage when you save.
              You can also paste a URL instead.
            </p>
          </div>
        </div>
      )}

      {/* Preview */}
      {value && (
        <div className="relative rounded-sm overflow-hidden border border-border/40 bg-muted/20">
          <img
            src={value}
            alt={`${label} preview`}
            crossOrigin="anonymous"
            className="w-full h-40 object-cover"
            onError={() => {
              toast.error('Could not load the image. Check the URL and try again.');
              onChange('');
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/30 via-transparent to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Image size={11} className="text-primary-foreground" />
              <span className="text-[10px] text-primary-foreground font-medium">
                {isDataUrl ? 'Uploaded image' : 'Image preview'}
              </span>
            </div>
            <button
              type="button"
              onClick={clearImage}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-foreground/40 hover:bg-destructive/80 text-primary-foreground text-[10px] font-semibold transition-colors"
              aria-label="Remove image"
            >
              <X size={9} />
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
