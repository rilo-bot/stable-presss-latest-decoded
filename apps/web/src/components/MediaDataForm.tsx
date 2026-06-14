/**
 * MediaDataForm
 *
 * Full create / edit form for a MediaItem record.
 * Can be rendered as a standalone page or embedded inside a dialog/sheet.
 * Props:
 *   horseId       — pre-fills (and locks) the horse field when provided
 *   initial       — existing MediaItem for edits (undefined = new record)
 *   onSave        — called with the saved id on success
 *   onCancel      — called when the user dismisses without saving
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { X, Plus, Link as LinkIcon, Upload, Newspaper, ChevronDown, Check, Search, FileText, Image as ImageIcon, File as FileIcon, FileArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useMediaStore } from '@/stores/mediaStore';
import { uploadRawFile } from '@/lib/upload';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useArticleStore } from '@/stores/articleStore';
import type { MediaItem, MediaType } from '@/types/mediaItem';
import { MEDIA_TYPES } from '@/types/mediaItem';

const serifStyle: React.CSSProperties = {
  fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif",
};

/* ── Helpers ── */
function fmtDate(d?: Date | string | null): string {
  if (!d) return '';
  try {
    return new Date(d as string).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return String(d); }
}

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return <ImageIcon size={16} />;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return <FileIcon size={16} />;
  if (['pdf'].includes(ext)) return <FileText size={16} />;
  if (['zip', 'tar', 'gz', 'rar'].includes(ext)) return <FileArchive size={16} />;
  return <FileIcon size={16} />;
}

const MEDIA_TYPE_ICONS: Record<MediaType, string> = {
  Article: '📰',
  Photo: '📷',
  Video: '🎬',
  'Press Release': '📢',
  Publication: '📖',
};

interface MediaDataFormProps {
  horseId?: string;
  initial?: MediaItem;
  onSave?: (id: string) => void;
  onCancel?: () => void;
  /** Compact mode — rendered inside HorseDetail, no outer wrapper card */
  compact?: boolean;
}

export function MediaDataForm({ horseId, initial, onSave, onCancel, compact = false }: MediaDataFormProps) {
  const addItem = useMediaStore((s) => s.addItem);
  const updateItem = useMediaStore((s) => s.updateItem);

  const horses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const allParties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const allArticles = useArticleStore((s) => s.articles);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);

  useEffect(() => { fetchHorses(); }, [fetchHorses]);
  useEffect(() => { fetchParties(); }, [fetchParties]);
  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  // ── Form state ──
  const [selectedHorseId, setSelectedHorseId] = useState(horseId ?? initial?.horse_id ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [mediaType, setMediaType] = useState<MediaType>(initial?.media_type ?? 'Article');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [sourcePublication, setSourcePublication] = useState(initial?.source_publication ?? '');
  const [publishedDate, setPublishedDate] = useState(initial?.published_date ?? '');
  const [urlOrFile, setUrlOrFile] = useState<'url' | 'file'>(initial?.file_name ? 'file' : 'url');
  const [url, setUrl] = useState(initial?.url ?? '');

  // File upload state
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);
  const [fileName, setFileName] = useState(initial?.file_name ?? '');
  const [fileUrl, setFileUrl] = useState(initial?.file_url ?? '');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [featuredPartyIds, setFeaturedPartyIds] = useState<string[]>(initial?.featured_party_ids ?? []);
  const [linkedArticleId, setLinkedArticleId] = useState(initial?.linked_article_id ?? '');

  // ── UI state ──
  const [saving, setSaving] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  const [partyDropOpen, setPartyDropOpen] = useState(false);
  const [articleDropOpen, setArticleDropOpen] = useState(false);
  const [articleSearch, setArticleSearch] = useState('');
  const [horseDropOpen, setHorseDropOpen] = useState(false);
  const [horseSearch, setHorseSearch] = useState('');

  const isEdit = !!initial;
  const horseFixed = !!horseId;

  // ── Derived ──
  const selectedHorse = useMemo(
    () => horses.find((h) => h.id === selectedHorseId),
    [horses, selectedHorseId],
  );

  const filteredParties = useMemo(() => {
    const q = partySearch.toLowerCase();
    return allParties.filter(
      (p) => !q || p.name.toLowerCase().includes(q),
    );
  }, [allParties, partySearch]);

  const filteredArticles = useMemo(() => {
    const q = articleSearch.toLowerCase();
    return allArticles.filter(
      (a) => !q || a.title.toLowerCase().includes(q) || (a.author ?? '').toLowerCase().includes(q),
    );
  }, [allArticles, articleSearch]);

  const filteredHorses = useMemo(() => {
    const q = horseSearch.toLowerCase();
    return horses.filter((h) => !q || (h.name ?? '').toLowerCase().includes(q));
  }, [horses, horseSearch]);

  const linkedArticle = useMemo(
    () => allArticles.find((a) => a.id === linkedArticleId),
    [allArticles, linkedArticleId],
  );

  // ── File handlers ──
  function handleFileSelect(file: globalThis.File) {
    setSelectedFile(file);
    setFileName(file.name);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function clearFile() {
    setSelectedFile(null);
    setFileName('');
    setFileUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Validation ──
  function validate(): string | null {
    if (!selectedHorseId) return 'Please select a horse.';
    if (!subject.trim()) return 'Subject is required.';
    if (!title.trim()) return 'Title is required.';
    if (urlOrFile === 'url' && !url.trim()) return 'Please provide a URL.';
    if (urlOrFile === 'file' && !fileName.trim()) return 'Please upload a file.';
    return null;
  }

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      // Upload a newly-selected file to S3 before saving; reuse the existing
      // stored URL on edits where no new file was chosen.
      let resolvedFileUrl = fileUrl;
      if (urlOrFile === 'file' && selectedFile) {
        try {
          const result = await uploadRawFile(selectedFile, 'media');
          resolvedFileUrl = result.url;
          setFileUrl(result.url);
        } catch (uploadErr) {
          toast.error(uploadErr instanceof Error ? uploadErr.message : 'Could not upload the file.');
          return;
        }
      }
      const payload: Omit<MediaItem, 'id' | 'createdAt'> = {
        horse_id: selectedHorseId,
        subject: subject.trim(),
        media_type: mediaType,
        title: title.trim(),
        source_publication: sourcePublication.trim() || undefined,
        published_date: publishedDate || undefined,
        url: urlOrFile === 'url' ? url.trim() || undefined : undefined,
        file_name: urlOrFile === 'file' ? fileName.trim() || undefined : undefined,
        file_url: urlOrFile === 'file' ? resolvedFileUrl || undefined : undefined,
        featured_party_ids: featuredPartyIds,
        linked_article_id: linkedArticleId || undefined,
      };
      if (isEdit && initial) {
        await updateItem(initial.id, payload);
        toast.success('Media record updated');
        onSave?.(initial.id);
      } else {
        const newId = await addItem(payload);
        if (newId) {
          toast.success('Media record saved');
          onSave?.(newId);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Party toggle ──
  function toggleParty(id: string) {
    setFeaturedPartyIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  /* ─────────────────── Render ─────────────────── */
  const fieldLabelStyle: React.CSSProperties = {
    fontSize: '0.6rem',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    fontWeight: 700,
    color: 'var(--parchment-shadow)',
    ...serifStyle,
    display: 'block',
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--parchment)',
    border: '1px solid var(--parchment-dark)',
    borderRadius: 3,
    color: 'var(--forest-deep)',
    fontSize: '0.78rem',
    fontFamily: "'IM Fell English', Georgia, serif",
    width: '100%',
    padding: '7px 10px',
    outline: 'none',
  };

  const sectionDivider = (
    <div style={{ height: 1, background: 'var(--parchment-dark)', margin: '14px 0' }} />
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0, ...serifStyle }}>
      {/* ── Header ── */}
      {!compact && (
        <div style={{
          background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)',
          borderBottom: '2px solid var(--gold-mid)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Newspaper size={16} style={{ color: 'var(--gold-bright)' }} />
            <span style={{ fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--gold-bright)', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
              {isEdit ? 'Edit Media Record' : 'New Media Record'}
            </span>
          </div>
          {onCancel && (
            <button type="button" onClick={onCancel} aria-label="Close form" style={{ width: 26, height: 26, borderRadius: 2, border: '1px solid var(--gold-dark)', background: 'rgba(26,51,34,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <X size={13} style={{ color: 'var(--gold-bright)' }} />
            </button>
          )}
        </div>
      )}

      <div style={{ background: 'var(--parchment)', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 22px, rgba(0,0,0,0.018) 22px, rgba(0,0,0,0.018) 23px)', padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── 1. Horse ── */}
        <div>
          <label style={fieldLabelStyle}>Horse <span style={{ color: 'var(--gold-bright)' }}>*</span></label>
          {horseFixed ? (
            <div style={{ ...inputStyle, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--forest-deep)' }}>
                {selectedHorse?.name ?? selectedHorseId}
              </span>
              <span style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)', fontStyle: 'italic' }}>(locked)</span>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setHorseDropOpen((v) => !v)}
                style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 6 }}
                aria-expanded={horseDropOpen}
                aria-label="Select horse"
              >
                <span style={{ flex: 1, textAlign: 'left', color: selectedHorse ? 'var(--forest-deep)' : 'var(--parchment-shadow)', fontStyle: selectedHorse ? 'normal' : 'italic' }}>
                  {selectedHorse?.name ?? 'Select a horse…'}
                </span>
                <ChevronDown size={13} style={{ color: 'var(--parchment-shadow)', flexShrink: 0 }} />
              </button>
              {horseDropOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--parchment)', border: '1px solid var(--parchment-dark)', borderTop: 'none', borderRadius: '0 0 3px 3px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', maxHeight: 200, overflow: 'auto' }}>
                  <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--parchment-dark)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Search size={12} style={{ color: 'var(--parchment-shadow)' }} />
                    <input
                      value={horseSearch}
                      onChange={(e) => setHorseSearch(e.target.value)}
                      placeholder="Search horses…"
                      style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.72rem', color: 'var(--forest-deep)', fontFamily: "'IM Fell English', Georgia, serif" }}
                      autoFocus
                    />
                  </div>
                  {filteredHorses.length === 0 && (
                    <div style={{ padding: '10px 12px', fontSize: '0.68rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No horses found.</div>
                  )}
                  {filteredHorses.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => { setSelectedHorseId(h.id); setHorseDropOpen(false); setHorseSearch(''); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: h.id === selectedHorseId ? 'var(--parchment-dark)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {h.id === selectedHorseId && <Check size={11} style={{ color: 'var(--forest-deep)', flexShrink: 0 }} />}
                      <span style={{ fontSize: '0.74rem', color: 'var(--forest-deep)', ...serifStyle }}>{h.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {sectionDivider}

        {/* ── 2. Subject ── */}
        <div>
          <label style={fieldLabelStyle}>Subject <span style={{ color: 'var(--gold-bright)' }}>*</span></label>
          <Textarea
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief description of what this media item covers…"
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
            required
          />
        </div>

        {/* ── 3. Media Type ── */}
        <div>
          <label style={fieldLabelStyle}>Media Type <span style={{ color: 'var(--gold-bright)' }}>*</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MEDIA_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMediaType(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  borderRadius: 3,
                  border: `2px solid ${t === mediaType ? 'var(--gold-bright)' : 'var(--parchment-dark)'}`,
                  background: t === mediaType ? 'linear-gradient(90deg, var(--forest-mid) 0%, var(--forest-light) 100%)' : 'var(--parchment)',
                  cursor: 'pointer',
                  fontSize: '0.68rem',
                  color: t === mediaType ? 'var(--parchment)' : 'var(--forest-deep)',
                  fontWeight: t === mediaType ? 700 : 400,
                  transition: 'all 0.15s',
                  ...serifStyle,
                }}
                aria-pressed={t === mediaType}
              >
                <span>{MEDIA_TYPE_ICONS[t]}</span>
                <span>{t}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 4. Title ── */}
        <div>
          <label style={fieldLabelStyle}>Title <span style={{ color: 'var(--gold-bright)' }}>*</span></label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Full title of the article, photo, or press release…"
            style={inputStyle}
            required
          />
        </div>

        {/* ── 5. Source Publication (optional) ── */}
        <div>
          <label style={fieldLabelStyle}>Source Publication <span style={{ color: 'var(--parchment-shadow)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <Input
            value={sourcePublication}
            onChange={(e) => setSourcePublication(e.target.value)}
            placeholder="e.g. The Racing Post, Stable Press, Racing NSW Photography…"
            style={inputStyle}
          />
        </div>

        {/* ── 6. Published Date (optional) ── */}
        <div>
          <label style={fieldLabelStyle}>Published Date <span style={{ color: 'var(--parchment-shadow)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <Input
            type="date"
            value={publishedDate}
            onChange={(e) => setPublishedDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {sectionDivider}

        {/* ── 7. URL or File Upload ── */}
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

        {sectionDivider}

        {/* ── 8. Featured Parties (optional) ── */}
        <div>
          <label style={{ ...fieldLabelStyle, marginBottom: 6 }}>
            Featured Parties <span style={{ color: 'var(--parchment-shadow)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
          </label>
          {/* Selected chips */}
          {featuredPartyIds.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {featuredPartyIds.map((pid) => {
                const p = allParties.find((pp) => pp.id === pid);
                if (!p) return null;
                return (
                  <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'linear-gradient(90deg, var(--forest-mid) 0%, var(--forest-light) 100%)', border: '1px solid var(--gold-dark)', borderRadius: 2, padding: '2px 6px 2px 8px' }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--parchment)', ...serifStyle }}>{p.name}</span>
                    <button type="button" onClick={() => toggleParty(pid)} aria-label={`Remove ${p.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: 'var(--gold-mid)' }}>
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Dropdown trigger */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPartyDropOpen((v) => !v)}
              style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              aria-expanded={partyDropOpen}
              aria-label="Add featured party"
            >
              <Plus size={12} style={{ color: 'var(--parchment-shadow)', flexShrink: 0 }} />
              <span style={{ color: 'var(--parchment-shadow)', fontStyle: 'italic', fontSize: '0.72rem' }}>Add featured party…</span>
            </button>
            {partyDropOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--parchment)', border: '1px solid var(--parchment-dark)', borderTop: 'none', borderRadius: '0 0 3px 3px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', maxHeight: 220, overflow: 'auto' }}>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--parchment-dark)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Search size={12} style={{ color: 'var(--parchment-shadow)' }} />
                  <input
                    value={partySearch}
                    onChange={(e) => setPartySearch(e.target.value)}
                    placeholder="Search parties…"
                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.72rem', color: 'var(--forest-deep)', fontFamily: "'IM Fell English', Georgia, serif" }}
                    autoFocus
                  />
                  <button type="button" onClick={() => setPartyDropOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--parchment-shadow)' }}><X size={12} /></button>
                </div>
                {filteredParties.length === 0 && (
                  <div style={{ padding: '10px 12px', fontSize: '0.68rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No parties found.</div>
                )}
                {filteredParties.map((p) => {
                  const selected = featuredPartyIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleParty(p.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: selected ? 'rgba(0,0,0,0.04)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div style={{ width: 14, height: 14, borderRadius: 2, border: `1px solid ${selected ? 'var(--gold-bright)' : 'var(--parchment-dark)'}`, background: selected ? 'var(--forest-mid)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selected && <Check size={9} style={{ color: 'var(--gold-bright)' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--forest-deep)', ...serifStyle, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        {p.roles && p.roles.length > 0 && (
                          <span style={{ fontSize: '0.56rem', color: 'var(--parchment-shadow)', textTransform: 'capitalize' }}>{p.roles.join(', ')}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 9. Linked Article (optional) ── */}
        <div>
          <label style={{ ...fieldLabelStyle, marginBottom: 6 }}>
            Linked Article <span style={{ color: 'var(--parchment-shadow)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
          </label>
          {linkedArticle && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, background: 'linear-gradient(90deg, var(--forest-mid) 0%, var(--forest-light) 100%)', border: '1px solid var(--gold-dark)', borderRadius: 3, padding: '6px 10px' }}>
              <Newspaper size={11} style={{ color: 'var(--gold-bright)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '0.68rem', color: 'var(--parchment)', ...serifStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linkedArticle.title}</span>
              <button type="button" onClick={() => setLinkedArticleId('')} aria-label="Unlink article" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-mid)', flexShrink: 0 }}><X size={11} /></button>
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setArticleDropOpen((v) => !v)}
              style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              aria-expanded={articleDropOpen}
              aria-label="Link to article"
            >
              <Plus size={12} style={{ color: 'var(--parchment-shadow)', flexShrink: 0 }} />
              <span style={{ color: 'var(--parchment-shadow)', fontStyle: 'italic', fontSize: '0.72rem' }}>
                {linkedArticleId ? 'Change linked article…' : 'Link to a Stable Press article…'}
              </span>
            </button>
            {articleDropOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--parchment)', border: '1px solid var(--parchment-dark)', borderTop: 'none', borderRadius: '0 0 3px 3px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', maxHeight: 220, overflow: 'auto' }}>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--parchment-dark)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Search size={12} style={{ color: 'var(--parchment-shadow)' }} />
                  <input
                    value={articleSearch}
                    onChange={(e) => setArticleSearch(e.target.value)}
                    placeholder="Search articles…"
                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.72rem', color: 'var(--forest-deep)', fontFamily: "'IM Fell English', Georgia, serif" }}
                    autoFocus
                  />
                  <button type="button" onClick={() => setArticleDropOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--parchment-shadow)' }}><X size={12} /></button>
                </div>
                {/* None option */}
                <button
                  type="button"
                  onClick={() => { setLinkedArticleId(''); setArticleDropOpen(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: !linkedArticleId ? 'rgba(0,0,0,0.04)' : 'transparent', border: 'none', borderBottom: '1px solid var(--parchment-dark)', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '0.68rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', ...serifStyle }}>— No linked article —</span>
                </button>
                {filteredArticles.length === 0 && (
                  <div style={{ padding: '10px 12px', fontSize: '0.68rem', fontStyle: 'italic', color: 'var(--parchment-shadow)' }}>No articles found.</div>
                )}
                {filteredArticles.map((a) => {
                  const selected = a.id === linkedArticleId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => { setLinkedArticleId(a.id); setArticleDropOpen(false); setArticleSearch(''); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: selected ? 'rgba(0,0,0,0.04)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {selected && <Check size={11} style={{ color: 'var(--forest-deep)', flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--forest-deep)', ...serifStyle, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                        <span style={{ fontSize: '0.56rem', color: 'var(--parchment-shadow)', textTransform: 'capitalize' }}>{a.author ?? ''} · {a.status}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer actions ── */}
      <div style={{
        background: 'linear-gradient(180deg, var(--forest-deep) 0%, var(--forest-mid) 100%)',
        borderTop: '2px solid var(--gold-dark)',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
      }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{ background: 'none', border: '1px solid var(--gold-dark)', borderRadius: 3, color: 'var(--gold-mid)', fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, padding: '6px 14px', cursor: 'pointer', ...serifStyle, transition: 'border-color 0.15s, color 0.15s' }}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          style={{
            background: saving ? 'var(--gold-dark)' : 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold-mid) 100%)',
            border: 'none',
            borderRadius: 3,
            color: 'var(--forest-deep)',
            fontSize: '0.62rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
            padding: '6px 20px',
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            ...serifStyle,
            transition: 'background 0.15s',
          }}
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Media Record'}
        </button>
      </div>
    </form>
  );
}
