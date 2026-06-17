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
import { X, Newspaper, ChevronDown, Check, Search } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { AiTextarea } from '@/agent/compose/AiTextarea';
import { useMediaStore } from '@/stores/mediaStore';
import { uploadRawFile } from '@/lib/upload';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useArticleStore } from '@/stores/articleStore';
import type { MediaItem, MediaType } from '@/types/mediaItem';
import { serifStyle, MEDIA_TYPES, MEDIA_TYPE_ICONS } from './media-data-form/constants';
import { FileUpload } from './media-data-form/FileUpload';
import { MetadataFields } from './media-data-form/MetadataFields';

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
          <AiTextarea
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief description of what this media item covers…"
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 60, paddingBottom: 34 }}
            required
            aiLabel="Subject"
            aiKey="subject"
            entityKind="media item"
            getContext={() => ({ horse: selectedHorse?.name, mediaType, title, source: sourcePublication })}
            onAccept={setSubject}
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

        <MetadataFields
          fieldLabelStyle={fieldLabelStyle}
          inputStyle={inputStyle}
          title={title}
          setTitle={setTitle}
          sourcePublication={sourcePublication}
          setSourcePublication={setSourcePublication}
          publishedDate={publishedDate}
          setPublishedDate={setPublishedDate}
          allParties={allParties}
          featuredPartyIds={featuredPartyIds}
          filteredParties={filteredParties}
          toggleParty={toggleParty}
          partyDropOpen={partyDropOpen}
          setPartyDropOpen={setPartyDropOpen}
          partySearch={partySearch}
          setPartySearch={setPartySearch}
          linkedArticle={linkedArticle}
          linkedArticleId={linkedArticleId}
          setLinkedArticleId={setLinkedArticleId}
          filteredArticles={filteredArticles}
          articleDropOpen={articleDropOpen}
          setArticleDropOpen={setArticleDropOpen}
          articleSearch={articleSearch}
          setArticleSearch={setArticleSearch}
          sectionDivider={sectionDivider}
          fileUpload={
            <FileUpload
              fieldLabelStyle={fieldLabelStyle}
              inputStyle={inputStyle}
              urlOrFile={urlOrFile}
              setUrlOrFile={setUrlOrFile}
              url={url}
              setUrl={setUrl}
              fileInputRef={fileInputRef}
              handleFileInputChange={handleFileInputChange}
              selectedFile={selectedFile}
              fileName={fileName}
              dragOver={dragOver}
              handleDrop={handleDrop}
              handleDragOver={handleDragOver}
              handleDragLeave={handleDragLeave}
              clearFile={clearFile}
            />
          }
        />
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
