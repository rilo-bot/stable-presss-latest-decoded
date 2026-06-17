import { X, Link as LinkIcon, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { serifStyle } from './constants';
import { fmtFileSize, getFileIcon } from './helpers';

interface FileUploadProps {
  fieldLabelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  urlOrFile: 'url' | 'file';
  setUrlOrFile: (v: 'url' | 'file') => void;
  url: string;
  setUrl: (v: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedFile: globalThis.File | null;
  fileName: string;
  dragOver: boolean;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: () => void;
  clearFile: () => void;
}

export function FileUpload({
  fieldLabelStyle,
  inputStyle,
  urlOrFile,
  setUrlOrFile,
  url,
  setUrl,
  fileInputRef,
  handleFileInputChange,
  selectedFile,
  fileName,
  dragOver,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  clearFile,
}: FileUploadProps) {
  return (
    <div>
      <label style={{ ...fieldLabelStyle, marginBottom: 8 }}>
        URL or File Upload <span style={{ color: 'var(--gold-bright)' }}>*</span>
        <span style={{ color: 'var(--parchment-shadow)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}> (at least one required)</span>
      </label>
      {/* Toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: '1px solid var(--parchment-dark)', borderRadius: 3, overflow: 'hidden' }}>
        {(['url', 'file'] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setUrlOrFile(opt)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 10px',
              background: opt === urlOrFile ? 'linear-gradient(90deg, var(--forest-mid) 0%, var(--forest-light) 100%)' : 'var(--parchment)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.64rem',
              color: opt === urlOrFile ? 'var(--parchment)' : 'var(--forest-deep)',
              fontWeight: opt === urlOrFile ? 700 : 400,
              transition: 'all 0.15s',
              ...serifStyle,
            }}
            aria-pressed={opt === urlOrFile}
          >
            {opt === 'url' ? <LinkIcon size={11} /> : <Upload size={11} />}
            {opt === 'url' ? 'External URL' : 'File Upload'}
          </button>
        ))}
      </div>

      {/* ── URL panel ── */}
      {urlOrFile === 'url' && (
        <div>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article or /articles/art-001"
            style={inputStyle}
            type="url"
          />
          <p style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)', fontStyle: 'italic', marginTop: 4 }}>
            Full external URL or a relative path to a Stable Press article.
          </p>
        </div>
      )}

      {/* ── File Upload panel ── */}
      {urlOrFile === 'file' && (
        <div>
          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            aria-label="Upload file"
          />

          {/* If no file selected yet — drop zone */}
          {!selectedFile && !fileName ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Drop a file here or click to browse"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              style={{
                border: `2px dashed ${dragOver ? 'var(--gold-bright)' : 'var(--parchment-dark)'}`,
                borderRadius: 4,
                padding: '24px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                background: dragOver
                  ? 'rgba(180,140,60,0.07)'
                  : 'repeating-linear-gradient(135deg, transparent, transparent 8px, rgba(0,0,0,0.012) 8px, rgba(0,0,0,0.012) 9px)',
                transition: 'border-color 0.15s, background 0.15s',
                userSelect: 'none',
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: dragOver ? 'rgba(180,140,60,0.18)' : 'var(--parchment-dark)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}>
                <Upload size={18} style={{ color: dragOver ? 'var(--gold-bright)' : 'var(--parchment-shadow)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--forest-deep)', fontWeight: 600, margin: 0, ...serifStyle }}>
                  Drop your file here, or{' '}
                  <span style={{ color: 'var(--gold-bright)', textDecoration: 'underline' }}>browse</span>
                </p>
                <p style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)', fontStyle: 'italic', margin: '4px 0 0', ...serifStyle }}>
                  PDF, images, video, or any document
                </p>
              </div>
            </div>
          ) : (
            /* File selected — show file card */
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              border: '1px solid var(--gold-dark)',
              borderRadius: 4,
              background: 'linear-gradient(90deg, rgba(26,51,34,0.06) 0%, transparent 100%)',
            }}>
              {/* File type icon */}
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 3,
                background: 'linear-gradient(135deg, var(--forest-mid) 0%, var(--forest-light) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--gold-bright)',
              }}>
                {getFileIcon(fileName)}
              </div>

              {/* File info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--forest-deep)', fontWeight: 600, ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fileName}
                </p>
                {selectedFile && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.58rem', color: 'var(--parchment-shadow)', fontStyle: 'italic', ...serifStyle }}>
                    {fmtFileSize(selectedFile.size)} · ready to attach
                  </p>
                )}
                {!selectedFile && fileName && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.58rem', color: 'var(--parchment-shadow)', fontStyle: 'italic', ...serifStyle }}>
                    Previously attached
                  </p>
                )}
              </div>

              {/* Change / remove actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Change file"
                  style={{
                    background: 'none',
                    border: '1px solid var(--parchment-dark)',
                    borderRadius: 2,
                    padding: '3px 8px',
                    fontSize: '0.58rem',
                    color: 'var(--forest-deep)',
                    cursor: 'pointer',
                    ...serifStyle,
                    letterSpacing: '0.06em',
                    transition: 'border-color 0.15s',
                  }}
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={clearFile}
                  aria-label="Remove file"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--parchment-shadow)', display: 'flex', alignItems: 'center', padding: 2 }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Always-visible helper when a file is selected */}
          {(selectedFile || fileName) && (
            <p style={{ fontSize: '0.56rem', color: 'var(--parchment-shadow)', fontStyle: 'italic', marginTop: 5, ...serifStyle }}>
              File will be stored in the Stable Press asset library on save.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
