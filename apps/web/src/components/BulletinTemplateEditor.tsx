import { useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  Eye,
  Edit,
  Check,
  Send,
  Clock,
  Calendar,
  ArrowRight,
  X,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BulletinTemplate } from '@/components/BulletinTemplateGallery';
import { CATEGORIES } from '@/pages/NewsIndex';
import { useArticleStore } from '@/stores/articleStore';

/* ── Helpers ──────────────────────────────────────────── */

function genId() {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ── Props ──────────────────────────────────────────── */

interface BulletinTemplateEditorProps {
  template: BulletinTemplate;
  onBack: () => void;
  onClose: () => void;
  /** Called after the article is saved / published */
  onDone: (articleId: string) => void;
}

type EditorMode = 'edit' | 'preview';

/* ── Component ────────────────────────────────────────── */

export function BulletinTemplateEditor({
  template,
  onBack,
  onClose,
  onDone,
}: BulletinTemplateEditorProps) {
  const addArticle = useArticleStore((s) => s.addArticle);

  // ── editable fields ──
  const [title, setTitle] = useState(template.prefilledTitle);
  const [summary, setSummary] = useState(template.prefilledSummary);
  const [author, setAuthor] = useState('');
  const [readingTime, setReadingTime] = useState(String(template.readingTimeHint));
  const [category, setCategory] = useState(template.category);
  const [imageUrl, setImageUrl] = useState(template.imageUrl);
  const [edition, setEdition] = useState(template.edition);

  // ── structure section notes ──
  const [sectionNotes, setSectionNotes] = useState<string[]>(
    template.structure.map(() => '')
  );

  const [mode, setMode] = useState<EditorMode>('edit');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const publishAs = (target: 'bulletin' | 'draft') => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!author.trim()) newErrors.author = 'Author is required';
    if (!summary.trim()) newErrors.summary = 'Summary is required';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Object.values(newErrors).forEach((e) => toast.error(e));
      return;
    }
    setErrors({});
    setSaving(true);
    const rt = parseInt(readingTime, 10);
    addArticle({
      title: title.trim(),
      summary: summary.trim(),
      author: author.trim(),
      publishedAt: target === 'bulletin' ? new Date() : null,
      linkedHorseIds: [],
      status: target === 'bulletin' ? 'bulletin' : 'draft',
      imageUrl: imageUrl.trim() || template.imageUrl,
      category: category,
      readingTime: isNaN(rt) ? template.readingTimeHint : rt,
      tags: template.tags,
    });
    setTimeout(() => {
      setSaving(false);
      if (target === 'bulletin') {
        toast.success('Bulletin published — it will appear in The Bulletin section now.');
      } else {
        toast.success('Saved as draft — find it in your Workflow Board.');
      }
      onDone(genId());
    }, 600);
  };

  const catDef = CATEGORIES.find((c) => c.key === category);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b border-border/40 flex-shrink-0"
        style={{ background: 'hsl(var(--primary))' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-primary-foreground/60 hover:text-primary-foreground transition-colors text-[11px] font-semibold uppercase tracking-[0.1em]"
            aria-label="Back to templates"
          >
            <ChevronLeft size={13} />
            Templates
          </button>
          <div className="w-px h-4 bg-primary-foreground/20" />
          <div
            className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-1"
            style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
          >
            <BookOpen size={9} />
            {template.name}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 bg-primary-foreground/10 p-0.5 rounded-sm">
            {(['edit', 'preview'] as EditorMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-sm text-[10px] uppercase tracking-[0.1em] font-bold transition-all',
                  mode === m
                    ? 'bg-primary-foreground text-primary'
                    : 'text-primary-foreground/60 hover:text-primary-foreground'
                )}
                aria-pressed={mode === m}
              >
                {m === 'edit' ? <Edit size={10} /> : <Eye size={10} />}
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-primary-foreground/50 hover:text-primary-foreground transition-colors"
            aria-label="Close template editor"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Edit form ── */}
        {mode === 'edit' && (
          <div className="flex flex-1 overflow-hidden">

            {/* Left: form fields */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Template origin note */}
              <div
                className="flex items-start gap-2.5 px-3 py-2.5 rounded-sm border text-[11px]"
                style={{ borderColor: `${template.accentColor}40`, background: `${template.accentColor}08` }}
              >
                <AlertCircle size={13} style={{ color: template.accentColor }} className="flex-shrink-0 mt-0.5" />
                <p className="text-foreground/70">
                  Starting from the <strong className="text-foreground">{template.name}</strong> template.
                  All text below is pre-filled — replace the placeholder brackets with real content before publishing.
                </p>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-title" className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                  Headline *
                </Label>
                <Input
                  id="tpl-title"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: '' })); }}
                  placeholder="Enter your bulletin headline…"
                  className={cn('text-sm font-semibold', errors.title && 'border-destructive ring-1 ring-destructive')}
                  aria-describedby={errors.title ? 'tpl-title-err' : undefined}
                />
                {errors.title && (
                  <p id="tpl-title-err" className="text-[11px] text-destructive">{errors.title}</p>
                )}
              </div>

              {/* Author */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-author" className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                  Author *
                </Label>
                <Input
                  id="tpl-author"
                  value={author}
                  onChange={(e) => { setAuthor(e.target.value); setErrors((p) => ({ ...p, author: '' })); }}
                  placeholder="e.g. James Whitfield"
                  className={cn('text-sm', errors.author && 'border-destructive ring-1 ring-destructive')}
                  aria-describedby={errors.author ? 'tpl-author-err' : undefined}
                />
                {errors.author && (
                  <p id="tpl-author-err" className="text-[11px] text-destructive">{errors.author}</p>
                )}
              </div>

              {/* Summary */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-summary" className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                  Summary / Standfirst *
                </Label>
                <Textarea
                  id="tpl-summary"
                  value={summary}
                  onChange={(e) => { setSummary(e.target.value); setErrors((p) => ({ ...p, summary: '' })); }}
                  placeholder="A concise summary that will appear below the headline in the bulletin…"
                  rows={4}
                  className={cn('text-sm resize-none', errors.summary && 'border-destructive ring-1 ring-destructive')}
                  aria-describedby={errors.summary ? 'tpl-summary-err' : undefined}
                />
                {errors.summary && (
                  <p id="tpl-summary-err" className="text-[11px] text-destructive">{errors.summary}</p>
                )}
              </div>

              {/* Category + reading time row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-category" className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                    Category
                  </Label>
                  <select
                    id="tpl-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-input rounded-sm bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    aria-label="Category"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tpl-reading-time" className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                    Reading Time (min)
                  </Label>
                  <Input
                    id="tpl-reading-time"
                    type="number"
                    min={1}
                    max={60}
                    value={readingTime}
                    onChange={(e) => setReadingTime(e.target.value)}
                    className="text-sm"
                    aria-label="Reading time in minutes"
                  />
                </div>
              </div>

              {/* Edition label */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-edition" className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                  Edition Label
                </Label>
                <Input
                  id="tpl-edition"
                  value={edition}
                  onChange={(e) => setEdition(e.target.value)}
                  placeholder="e.g. Vol. 47 · Fortnightly Edition"
                  className="text-sm"
                />
              </div>

              {/* Image URL */}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-image" className="text-[11px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
                  Cover Image URL
                </Label>
                <Input
                  id="tpl-image"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://…"
                  className="text-xs font-mono"
                />
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Cover preview"
                    crossOrigin="anonymous"
                    className="w-full h-24 object-cover rounded-sm border border-border/50 mt-1"
                  />
                )}
              </div>

              {/* Structure section notes */}
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-muted-foreground">
                  Article Structure Notes
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
                  Optional planning notes for each section — internal CMS notes, not visible in the published bulletin.
                </p>
                <div className="space-y-2.5">
                  {template.structure.map((sec, idx) => (
                    <div key={sec} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-primary-foreground flex-shrink-0"
                          style={{ background: template.accentColor }}
                        >
                          {idx + 1}
                        </div>
                        <Label
                          htmlFor={`sec-note-${idx}`}
                          className="text-[11px] font-semibold text-foreground"
                        >
                          {sec}
                        </Label>
                      </div>
                      <input
                        id={`sec-note-${idx}`}
                        type="text"
                        value={sectionNotes[idx]}
                        onChange={(e) => {
                          const next = [...sectionNotes];
                          next[idx] = e.target.value;
                          setSectionNotes(next);
                        }}
                        placeholder={`Notes for "${sec}" section…`}
                        className="w-full px-3 py-1.5 text-xs border border-input rounded-sm bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring ml-6"
                        aria-label={`Notes for ${sec} section`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: mini-metadata sidebar */}
            <div className="hidden lg:flex flex-col w-60 border-l border-border/40 bg-card overflow-y-auto">
              <div className="p-4 border-b border-border/40">
                <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-3">
                  Bulletin Meta
                </p>
                <div className="space-y-3">
                  {[
                    { label: 'Template', value: template.name },
                    { label: 'Section', value: template.section },
                    { label: 'Category', value: catDef?.label ?? category.replace(/-/g, ' ') },
                    { label: 'Est. Read', value: `${readingTime} min` },
                  ].map((row) => (
                    <div key={row.label}>
                      <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
                        {row.label}
                      </p>
                      <p className="text-xs font-medium text-foreground capitalize mt-0.5">
                        {row.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Structure checklist */}
              <div className="p-4 border-b border-border/40">
                <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-3">
                  Structure
                </p>
                <div className="space-y-1.5">
                  {template.structure.map((sec, idx) => (
                    <div key={sec} className="flex items-center gap-1.5">
                      <div
                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: sectionNotes[idx]?.trim()
                            ? template.accentColor
                            : 'hsl(var(--muted))',
                        }}
                      >
                        {sectionNotes[idx]?.trim() && (
                          <Check size={8} className="text-primary-foreground" />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{sec}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ready-to-publish checklist */}
              <div className="p-4">
                <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-3">
                  Ready to Publish?
                </p>
                <div className="space-y-1.5">
                  {[
                    { label: 'Headline', done: !!title.trim() && !title.includes('[') },
                    { label: 'Author', done: !!author.trim() },
                    { label: 'Summary', done: !!summary.trim() && !summary.includes('[') },
                    { label: 'Cover image', done: !!imageUrl.trim() },
                  ].map((field) => (
                    <div key={field.label} className="flex items-center gap-1.5">
                      <div
                        className={cn(
                          'w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                          field.done ? 'bg-[hsl(var(--primary))]' : 'border border-border/60 bg-muted/40'
                        )}
                      >
                        {field.done && <Check size={8} className="text-primary-foreground" />}
                      </div>
                      <span className={cn('text-[10px]', field.done ? 'text-foreground' : 'text-muted-foreground')}>
                        {field.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Preview mode ── */}
        {mode === 'preview' && (
          <div className="flex-1 overflow-y-auto">
            <div className="relative h-56 overflow-hidden">
              <img
                src={imageUrl || template.imageUrl}
                alt={title}
                crossOrigin="anonymous"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span
                    className="text-[8px] uppercase tracking-[0.22em] font-bold px-2.5 py-1"
                    style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                  >
                    Bulletin
                  </span>
                  {catDef && (
                    <span className="text-[8px] uppercase tracking-[0.14em] font-semibold px-2 py-0.5 rounded-sm border border-primary-foreground/20 text-primary-foreground/70">
                      {catDef.label}
                    </span>
                  )}
                  {edition && (
                    <span className="text-[9px] text-primary-foreground/50 uppercase tracking-[0.1em]">
                      {edition}
                    </span>
                  )}
                </div>
                <h1 className="font-[family-name:var(--font-display)] text-xl md:text-2xl font-bold italic text-primary-foreground leading-[1.1]">
                  {title || 'Your Headline Here'}
                </h1>
              </div>
            </div>

            <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
              {/* Author + meta row */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground border-b border-border/40 pb-5">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
                  >
                    {(author || 'A').charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{author || 'Author Name'}</span>
                </div>
                <span className="opacity-30">·</span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {readingTime || template.readingTimeHint} min read
                </span>
                <span className="opacity-30">·</span>
                <span className="flex items-center gap-1">
                  <Calendar size={10} />
                  {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>

              {/* Summary standfirst */}
              <div
                className="px-4 py-4 border-l-4 rounded-sm"
                style={{ borderColor: template.accentColor, background: `${template.accentColor}08` }}
              >
                <p className="text-sm text-foreground leading-relaxed italic font-[family-name:var(--font-display)]">
                  {summary || 'Your summary will appear here.'}
                </p>
              </div>

              {/* Structure sections */}
              <div className="space-y-5">
                <div className="w-8 h-[2px]" style={{ background: template.accentColor }} />
                {template.structure.map((sec, idx) => (
                  <div key={sec} className="space-y-1.5">
                    <h3 className="font-[family-name:var(--font-display)] text-base font-bold italic text-foreground">
                      {sec}
                    </h3>
                    {sectionNotes[idx]?.trim() ? (
                      <p className="text-sm text-foreground/80 leading-relaxed">{sectionNotes[idx]}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground/50 italic">Section content goes here…</p>
                    )}
                    {idx < template.structure.length - 1 && (
                      <div className="mt-4 h-px bg-border/30" />
                    )}
                  </div>
                ))}
              </div>

              {/* Preview notice */}
              <div className="border border-dashed border-primary/30 rounded-sm px-4 py-3 bg-primary/5 flex items-center gap-2 text-xs text-primary">
                <Eye size={13} className="flex-shrink-0" />
                Editorial preview — italicised content is placeholder text not yet filled in.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex-shrink-0 border-t border-border/40 bg-card px-5 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {[
              !title.trim() || title.includes('['),
              !author.trim(),
              !summary.trim() || summary.includes('['),
            ].some(Boolean) ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <AlertCircle size={12} className="text-muted-foreground" />
                <span>Replace placeholder text in brackets before publishing</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-primary">
                <CheckCircle size={12} />
                <span>Ready to publish</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              disabled={saving}
              onClick={() => publishAs('draft')}
            >
              Save as Draft
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1.5 font-semibold"
              disabled={saving}
              style={{ background: 'hsl(var(--brand-accent))', color: 'hsl(var(--brand-accent-foreground))' }}
              onClick={() => publishAs('bulletin')}
            >
              {saving ? 'Publishing…' : (
                <>
                  <Send size={12} />
                  Publish to Bulletin
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
