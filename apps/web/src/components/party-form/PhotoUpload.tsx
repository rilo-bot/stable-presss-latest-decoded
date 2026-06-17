import { Upload, X, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE_MB } from './helpers';

interface PhotoUploadProps {
  photoPreview?: string;
  photoFile: File | null;
  photoError?: string;
  dragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  dropZoneRef: React.RefObject<HTMLDivElement>;
  removePhoto: () => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: () => void;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function PhotoUpload({
  photoPreview,
  photoFile,
  photoError,
  dragOver,
  fileInputRef,
  dropZoneRef,
  removePhoto,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleFileInputChange,
}: PhotoUploadProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
        Photo <span className="text-destructive">*</span>
      </Label>
      <p className="text-[11px] text-muted-foreground -mt-1">
        A clear headshot is required for all individuals. JPEG, PNG or WebP, max {MAX_FILE_SIZE_MB} MB.
      </p>

      {photoPreview ? (
        /* Preview state */
        <div className="relative inline-flex group">
          <img
            src={photoPreview}
            alt="Photo preview"
            crossOrigin="anonymous"
            className="h-32 w-32 rounded-md object-cover border border-border/60 shadow-sm"
          />
          <div className="absolute inset-0 rounded-md bg-foreground/0 group-hover:bg-foreground/20 transition-colors" />
          {/* Change / Remove controls */}
          <div className="absolute -top-2 -right-2 flex items-center gap-1">
            <button
              type="button"
              aria-label="Change photo"
              onClick={() => fileInputRef.current?.click()}
              className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow hover:bg-primary/90 transition-colors"
            >
              <Camera size={13} />
            </button>
            <button
              type="button"
              aria-label="Remove photo"
              onClick={removePhoto}
              className="h-7 w-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow hover:bg-destructive/90 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
          {photoFile && (
            <p className="absolute -bottom-5 left-0 text-[10px] text-muted-foreground truncate max-w-[128px]">
              {photoFile.name}
            </p>
          )}
        </div>
      ) : (
        /* Drop-zone state */
        <div
          ref={dropZoneRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload photo — click or drag and drop"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 cursor-pointer transition-all',
            dragOver
              ? 'border-primary bg-primary/8 scale-[1.01]'
              : photoError
              ? 'border-destructive bg-destructive/5 hover:border-destructive/70'
              : 'border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
          )}
        >
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
              dragOver ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            <Upload size={20} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Click to upload or drag &amp; drop
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              JPEG, PNG, WebP or GIF — max {MAX_FILE_SIZE_MB} MB
            </p>
          </div>
        </div>
      )}

      {photoError && (
        <p className="text-xs text-destructive mt-1">{photoError}</p>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileInputChange}
      />
    </div>
  );
}
