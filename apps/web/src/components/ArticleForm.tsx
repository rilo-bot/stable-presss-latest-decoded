import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AiTextarea } from '@/agent/compose/AiTextarea';
import { ImageUploader } from '@/components/horse-form/ImageUploader';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useArticleStore } from '@/stores/articleStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { connectionResolver } from '@/lib/horseConnections';
import { useAuthStore } from '@/stores/authStore';
import { loadDraft, useFormDraft } from '@/hooks/useFormDraft';
import type { Article } from '@/types/article';
import type { ArticleStatus } from '@/types/article';
import { enterPermission, movesFrom, stageMeta } from '@/lib/workflow';
import { can } from '@/lib/permissions';
import { X, Check, Lock, Newspaper, BarChart2, Mic, RotateCcw, Mail, Radio, Globe, Clock, Tag as TagIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useRegister } from '@/lib/register';

const ARTICLE_DRAFT_KEY = 'article';

interface ArticleDraft {
  title: string;
  summary: string;
  author: string;
  category: string;
  status: ArticleStatus;
  readingTime: string;
  linkedHorseIds: string[];
  imageUrl: string;
  tags: string[];
  scheduledFor: string;
}

interface ArticleFormProps {
  open: boolean;
  onClose: () => void;
  editArticle?: Article | null;
  defaultStatus?: ArticleStatus;
}

/**
 * The stages this user may put THIS story into, derived from the same two rules
 * the server enforces (lib/workflow.ts):
 *
 *  - a new story may be created into any stage whose `enterPermission` the user
 *    holds (plus Draft, which needs none);
 *  - an existing story may only go where a legal move leads, and only if the
 *    user holds that move's permission.
 *
 * This replaced two hardcoded lists — a five-entry one for editors and a
 * two-entry one for contributors. Both offered stages the server would refuse:
 * picking "Published" on a draft sent `status: 'published'`, got a 409 back
 * ("a story cannot go from draft to published"), and the dialog said "Story
 * updated" anyway.
 */
function stageChoices(editArticle: Article | null | undefined): { value: ArticleStatus; label: string }[] {
  if (!editArticle) {
    const creatable: ArticleStatus[] = ['draft', 'submitted', 'approved', 'scheduled', 'published'];
    return creatable
      .filter((s) => {
        const needed = enterPermission(s);
        return needed === null || can(needed);
      })
      .map((s) => ({ value: s, label: stageMeta(s).label }));
  }

  const here = editArticle.status;
  return [
    { value: here, label: `${stageMeta(here).label} (unchanged)` },
    ...movesFrom(here)
      .filter((m) => can(m.permission))
      .map((m) => ({ value: m.to, label: m.label })),
  ];
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time; the wire uses ISO. */
function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ── Category taxonomy — aligned with NewsIndex sections ── */

interface CatDef {
  value: string;
  label: string;
  section: 'News' | 'Analysis' | 'Interviews';
  icon: React.ReactNode;
}

const CATEGORY_DEFS: CatDef[] = [
  // News
  { value: 'race-reports', label: 'Race Reports', section: 'News', icon: <Newspaper size={11} /> },
  { value: 'industry-news', label: 'Industry News', section: 'News', icon: <Newspaper size={11} /> },
  { value: 'morning-edition', label: 'Morning Edition', section: 'News', icon: <Newspaper size={11} /> },
  // Analysis
  { value: 'form-guide', label: 'Form Guide', section: 'Analysis', icon: <BarChart2 size={11} /> },
  { value: 'track-notes', label: 'Track Notes', section: 'Analysis', icon: <BarChart2 size={11} /> },
  { value: 'bloodstock', label: 'Bloodstock', section: 'Analysis', icon: <BarChart2 size={11} /> },
  // Interviews
  { value: 'trainer-profiles', label: 'Trainer Profiles', section: 'Interviews', icon: <Mic size={11} /> },
  { value: 'jockey-desk', label: 'Jockey Desk', section: 'Interviews', icon: <Mic size={11} /> },
  { value: 'owner-stories', label: 'Owner Stories', section: 'Interviews', icon: <Mic size={11} /> },
];

const CATEGORY_SECTIONS = ['News', 'Analysis', 'Interviews'] as const;

const SECTION_COLORS: Record<string, string> = {
  News: 'hsl(var(--primary))',
  Analysis: 'hsl(var(--chart-2))',
  Interviews: 'hsl(var(--brand-accent))',
};

export function ArticleForm({
  open,
  onClose,
  editArticle,
  defaultStatus = 'draft',
}: ArticleFormProps) {
  const addArticle = useArticleStore((s) => s.addArticle);
  const updateArticle = useArticleStore((s) => s.updateArticle);
  const horses = useHorseStore((s) => s.horses);
  const parties = useRegister();
  const horseConn = connectionResolver(parties);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<ArticleStatus>(defaultStatus);
  const [readingTime, setReadingTime] = useState('');
  const [linkedHorseIds, setLinkedHorseIds] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const isContributor = !can('content.draft.edit_any');
  const statusOptions = stageChoices(editArticle);

  // Contributors always get their display name auto-filled as byline
  const authorLocked = isContributor;

  // Reset form when dialog opens or editArticle changes
  useEffect(() => {
    if (!open) return;
    setTagInput('');
    if (editArticle) {
      setTitle(editArticle.title);
      setSummary(editArticle.summary);
      setAuthor(editArticle.author);
      setCategory(editArticle.category ?? '');
      // Editing opens on the story's CURRENT stage. Moving it is a separate,
      // deliberate choice among the moves the user actually holds — clamping a
      // stage the viewer can't set (what happened before) silently rewrote the
      // story's position the moment they hit save.
      setStatus(editArticle.status);
      setReadingTime(editArticle.readingTime?.toString() ?? '');
      setLinkedHorseIds(editArticle.linkedHorseIds ?? []);
      setImageUrl(editArticle.imageUrl ?? '');
      setTags(editArticle.tags ?? []);
      setScheduledFor(isoToLocalInput(editArticle.scheduledFor));
    } else {
      // New story: restore an in-progress draft if one was saved.
      const draft = loadDraft<ArticleDraft>(ARTICLE_DRAFT_KEY);
      // The column's `+` can open this on a stage the viewer may not create
      // into; fall back to Draft rather than offering something the server
      // would refuse.
      const needed = enterPermission(defaultStatus);
      const clampedDefault = needed === null || can(needed) ? defaultStatus : 'draft';
      setTitle(draft?.title ?? '');
      setSummary(draft?.summary ?? '');
      // Contributors are always attributed to their own account — never restore a byline for them.
      setAuthor(isContributor ? (currentUser?.name ?? '') : (draft?.author ?? ''));
      setCategory(draft?.category ?? '');
      setStatus(draft?.status ?? clampedDefault);
      setReadingTime(draft?.readingTime ?? '');
      setLinkedHorseIds(draft?.linkedHorseIds ?? []);
      setImageUrl(draft?.imageUrl ?? '');
      setTags(draft?.tags ?? []);
      setScheduledFor(draft?.scheduledFor ?? '');
      setDraftRestored(!!draft);
    }
  }, [open, editArticle, defaultStatus, isContributor, currentUser?.name]);

  // Auto-save an in-progress draft so an accidental close doesn't lose work.
  const { clearDraft } = useFormDraft<ArticleDraft>(
    ARTICLE_DRAFT_KEY,
    {
      title, summary, author, category, status, readingTime, linkedHorseIds,
      tags, scheduledFor,
      // Skip transient data: URLs — they can blow the localStorage quota.
      imageUrl: imageUrl.startsWith('data:') ? '' : imageUrl,
    },
    {
      enabled: open && !editArticle,
      isEmpty: (d) => !d.title.trim() && !d.summary.trim() && !d.category && d.linkedHorseIds.length === 0 && !d.imageUrl,
    },
  );

  const discardDraft = () => {
    clearDraft();
    setTitle('');
    setSummary('');
    setAuthor(isContributor ? (currentUser?.name ?? '') : '');
    setCategory('');
    const needed = enterPermission(defaultStatus);
    setStatus(needed === null || can(needed) ? defaultStatus : 'draft');
    setReadingTime('');
    setLinkedHorseIds([]);
    setImageUrl('');
    setTags([]);
    setTagInput('');
    setScheduledFor('');
    setDraftRestored(false);
  };

  const toggleHorse = (horseId: string) => {
    setLinkedHorseIds((prev) =>
      prev.includes(horseId) ? prev.filter((id) => id !== horseId) : [...prev, horseId]
    );
  };

  const commitTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput('');
  };

  /**
   * Save.
   *
   * Both store calls are AWAITED and their result checked. This used to fire
   * them without awaiting and toast "Story updated" unconditionally, so every
   * rejection the server raised — an illegal move, a stage the user may not
   * enter, a failed request — was reported to the user as a success while
   * the store rolled the change back behind them.
   */
  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('A headline is required before going to press.');
      return;
    }
    if (!author.trim()) {
      toast.error('Every story needs a byline. Please add an author.');
      return;
    }
    if (status === 'scheduled' && !scheduledFor) {
      toast.error('Pick a date and time for this story to go live.');
      return;
    }

    setSaving(true);
    try {
      // `publishedAt` is deliberately absent — the server stamps it when the
      // story actually goes live. Sending it on every save is what reset a
      // published story's date each time anyone edited it.
      const payload = {
        title: title.trim(),
        summary: summary.trim(),
        author: author.trim(),
        category: category || undefined,
        status,
        readingTime: readingTime ? parseInt(readingTime, 10) : undefined,
        linkedHorseIds,
        tags,
        imageUrl: imageUrl.trim() || undefined,
        ...(status === 'scheduled'
          ? { scheduledFor: new Date(scheduledFor).toISOString() }
          : {}),
      };

      if (editArticle) {
        const ok = await updateArticle(editArticle.id, payload);
        // The store has already shown the server's reason. Keep the dialog open
        // so the work survives and the user can adjust and retry.
        if (!ok) return;
        toast.success('Story updated — the file has been revised.');
      } else {
        const created = await addArticle({ ...payload, publishedAt: null });
        if (!created) return;
        clearDraft();
        setDraftRestored(false);
        toast.success(
          status === 'draft'
            ? 'Story filed — it sits in your draft queue.'
            : `Story filed as ${stageMeta(status).label}.`,
        );
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const selectedCatDef = CATEGORY_DEFS.find((c) => c.value === category);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0 border border-border/60 rounded-sm bg-card">
        {/* Sticky header */}
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-border/60">
          <div className="w-8 h-0.5 mb-3" style={{ background: 'hsl(var(--brand-accent))' }} />
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
            {editArticle ? 'Revise the Story' : 'File a New Story'}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {editArticle
              ? 'Update headline, copy, status, and linked horse profiles.'
              : isContributor
              ? 'Write your story and choose to save as Draft or Submit directly to the editorial queue.'
              : 'Complete the fields below and assign a workflow stage.'}
          </p>
          {/* Contributor scope reminder */}
          {isContributor && (
            <div
              className="mt-3 flex items-center gap-2 px-3 py-2 rounded-sm border text-xs"
              style={{
                borderColor: 'hsl(var(--chart-1) / 0.4)',
                background: 'hsl(var(--chart-1) / 0.06)',
              }}
            >
              <Lock size={11} style={{ color: 'hsl(var(--chart-1))' }} className="flex-shrink-0" />
              <span className="text-foreground/70">
                As a <strong className="text-foreground">Contributor</strong> your story will be
                attributed to your account. Workflow stages are limited to Draft and Submit.
              </span>
            </div>
          )}
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {draftRestored && !editArticle && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-border/60 bg-muted/40 text-xs">
              <RotateCcw size={12} className="flex-shrink-0 text-muted-foreground" />
              <span className="flex-1 text-muted-foreground">
                Unsaved draft restored from your last session.
              </span>
              <button
                type="button"
                onClick={discardDraft}
                className="flex items-center gap-1 px-2 py-0.5 rounded-sm border border-border/60 text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={9} /> Discard
              </button>
            </div>
          )}
          {/* Headline */}
          <div className="space-y-1.5">
            <Label
              htmlFor="article-title"
              className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
            >
              Headline
            </Label>
            <Input
              id="article-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The headline that stops readers in their tracks"
              className="font-[family-name:var(--font-display)] text-base"
            />
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <Label
              htmlFor="article-summary"
              className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
            >
              Story
            </Label>
            <p className="text-[10px] text-muted-foreground/70 -mt-0.5">
              The full copy, as readers will see it. Separate paragraphs with a blank line — the
              first one becomes the teaser on cards and the news index.
            </p>
            <AiTextarea
              id="article-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Write the story. The opening paragraph is the one that earns the read."
              rows={10}
              className="leading-relaxed"
              aiLabel="Story copy"
              aiKey="summary"
              entityKind="article"
              getContext={() => ({
                title,
                category: selectedCatDef ? `${selectedCatDef.section} · ${selectedCatDef.label}` : category,
                author,
                linkedHorses: linkedHorseIds.map((id) => horses.find((h) => h.id === id)?.name).filter(Boolean),
              })}
              onAccept={setSummary}
            />
          </div>

          {/* Lead Image */}
          <div className="space-y-1.5">
            <Label
              htmlFor="article-image"
              className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
            >
              Lead Image
            </Label>
            <p className="text-[10px] text-muted-foreground/70 -mt-0.5">
              The hero photo shown on the public story and across the news index. Paste a link or upload a file.
            </p>
            <ImageUploader
              value={imageUrl}
              onChange={setImageUrl}
              kind="media"
              label="story image"
              id="article-image"
            />
          </div>

          {/* Byline + Reading Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="article-author"
                className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground flex items-center gap-1.5"
              >
                Byline / Author
                {authorLocked && (
                  <Lock size={10} className="text-muted-foreground/50" />
                )}
              </Label>
              <Input
                id="article-author"
                value={author}
                onChange={(e) => !authorLocked && setAuthor(e.target.value)}
                readOnly={authorLocked}
                placeholder="Correspondent name"
                className={authorLocked ? 'bg-muted/40 cursor-default text-muted-foreground' : ''}
                aria-label="Byline / Author"
              />
              {authorLocked && (
                <p className="text-[10px] text-muted-foreground/60">
                  Automatically set to your account name
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="article-readingtime"
                className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
              >
                Reading Time (mins)
              </Label>
              <Input
                id="article-readingtime"
                type="number"
                min={1}
                max={99}
                value={readingTime}
                onChange={(e) => setReadingTime(e.target.value)}
                placeholder="e.g. 8"
              />
            </div>
          </div>

          {/* Category — grouped by section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                Category
              </Label>
              {selectedCatDef && (
                <span
                  className="text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-sm"
                  style={{
                    background: `${SECTION_COLORS[selectedCatDef.section]}15`,
                    color: SECTION_COLORS[selectedCatDef.section],
                  }}
                >
                  {selectedCatDef.section} · {selectedCatDef.label}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/70 -mt-1">
              Selecting a category routes your story to the correct editorial section on the public news index and newsletter pages.
            </p>

            <div className="space-y-3">
              {CATEGORY_SECTIONS.map((section) => {
                const cats = CATEGORY_DEFS.filter((c) => c.section === section);
                const sectionColor = SECTION_COLORS[section];
                return (
                  <div key={section} className="rounded-sm border border-border/50 overflow-hidden">
                    {/* Section header */}
                    <div
                      className="px-3 py-2 flex items-center gap-2"
                      style={{ background: `${sectionColor}08`, borderBottom: `1px solid ${sectionColor}20` }}
                    >
                      <span style={{ color: sectionColor }}>
                        {section === 'News' ? <Newspaper size={12} /> : section === 'Analysis' ? <BarChart2 size={12} /> : <Mic size={12} />}
                      </span>
                      <span
                        className="text-[9px] uppercase tracking-[0.18em] font-bold"
                        style={{ color: sectionColor }}
                      >
                        {section}
                      </span>
                    </div>
                    {/* Category pills */}
                    <div className="p-2 flex flex-wrap gap-1.5 bg-card">
                      {cats.map((cat) => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setCategory(cat.value === category ? '' : cat.value)}
                          className={cn(
                            'flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] font-semibold px-2.5 py-1.5 rounded-sm border transition-all',
                            category === cat.value
                              ? 'text-primary-foreground border-transparent'
                              : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                          )}
                          style={
                            category === cat.value
                              ? { background: sectionColor, borderColor: sectionColor }
                              : undefined
                          }
                        >
                          <span className={category === cat.value ? 'opacity-80' : 'opacity-50'}>
                            {cat.icon}
                          </span>
                          {cat.label}
                          {category === cat.value && <Check size={10} className="ml-0.5" />}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {category && (
              <button
                type="button"
                onClick={() => setCategory('')}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-[0.1em] font-semibold flex items-center gap-1"
              >
                <X size={10} /> Clear category
              </button>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label
              htmlFor="article-tags"
              className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
            >
              Tags
            </Label>
            <p className="text-[10px] text-muted-foreground/70 -mt-0.5">
              Shown under the story as “Filed under”. Press Enter to add each one.
            </p>
            <div className="flex items-center gap-2">
              <Input
                id="article-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    commitTag();
                  }
                }}
                onBlur={commitTag}
                placeholder="e.g. Melbourne Cup"
              />
              <Button type="button" variant="outline" size="sm" onClick={commitTag} disabled={!tagInput.trim()}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="flex items-center gap-1 text-[10px] uppercase tracking-[0.06em]"
                  >
                    <TagIcon size={9} />
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                      aria-label={`Remove tag ${t}`}
                      className="ml-0.5 hover:opacity-70 transition-opacity"
                    >
                      <X size={9} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Workflow stage — only the moves this user may actually make */}
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground flex items-center gap-1.5">
              Workflow Stage
              {isContributor && (
                <Lock size={10} className="text-muted-foreground/50" />
              )}
            </Label>
            <p className="text-[10px] text-muted-foreground/70">
              {editArticle
                ? `This story is at ${stageMeta(editArticle.status).label}. Only the moves you're cleared to make are offered.`
                : isContributor
                ? 'Save as a Draft to continue working, or Submit to place it in the editorial queue.'
                : 'The stage this story starts in.'}
            </p>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-sm border text-left transition-colors',
                    status === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  )}
                >
                  {status === opt.value && (
                    <Check size={11} className="flex-shrink-0 text-primary" />
                  )}
                  <span className="text-[10px] uppercase tracking-[0.08em] font-semibold">
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>

            {/* The publish slot. Required to sit in Scheduled — the stage did
                nothing at all before, because nothing ever set a date. */}
            {status === 'scheduled' && (
              <div className="mt-3 space-y-1.5 rounded-sm border border-border/60 bg-muted/30 p-3">
                <Label
                  htmlFor="article-scheduledfor"
                  className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground flex items-center gap-1.5"
                >
                  <Clock size={11} />
                  Goes live at
                </Label>
                <Input
                  id="article-scheduledfor"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="max-w-[260px]"
                />
                <p className="text-[10px] text-muted-foreground/70">
                  The story publishes itself at this time — no one needs to come back and press
                  anything.
                </p>
              </div>
            )}
          </div>

          {/* Linked Horses */}
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              Link to Horse Profiles
            </Label>
            {horses.length === 0 ? (
              <p className="text-sm text-muted-foreground italic font-[family-name:var(--font-display)]">
                No horses in the stables yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {horses.map((horse) => {
                  const linked = linkedHorseIds.includes(horse.id);
                  return (
                    <button
                      key={horse.id}
                      type="button"
                      onClick={() => toggleHorse(horse.id)}
                      aria-pressed={linked}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-sm border text-left transition-colors',
                        linked
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border/60 hover:border-primary/30 hover:bg-muted/40'
                      )}
                    >
                      <span
                        className={cn(
                          'flex-shrink-0 w-4 h-4 rounded-sm border flex items-center justify-center transition-colors',
                          linked ? 'bg-primary border-primary' : 'border-border'
                        )}
                      >
                        {linked && <Check size={10} className="text-primary-foreground" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground font-[family-name:var(--font-display)] truncate">
                          {horse.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {horseConn(horse).trainer || '—'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {linkedHorseIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {linkedHorseIds.map((hid) => {
                  const h = horses.find((x) => x.id === hid);
                  if (!h) return null;
                  return (
                    <Badge
                      key={hid}
                      variant="secondary"
                      className="flex items-center gap-1 text-[10px] uppercase tracking-[0.06em]"
                    >
                      {h.name}
                      <button
                        onClick={() => toggleHorse(hid)}
                        aria-label={`Remove ${h.name}`}
                        className="ml-0.5 hover:opacity-70 transition-opacity"
                      >
                        <X size={9} />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <DialogFooter className="flex-shrink-0 px-6 py-4 border-t border-border/60 flex items-center gap-3 justify-end">
          <DialogClose asChild>
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90 min-w-[110px]"
          >
            {saving
              ? 'Filing…'
              : editArticle
              ? 'Save Revision'
              : status === 'draft'
              ? 'Save Draft'
              : `File as ${stageMeta(status).label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
