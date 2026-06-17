import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import type { Article } from '@/types/article';
import { TIER_ORDER, TIER_LABELS } from '@/rbac/entitlement';
import type { SubscriptionTier } from '@/rbac/entitlement';
import type { KanbanStatus } from '@/components/KanbanColumn';
import type { UserRole } from '@/stores/authStore';
import { can } from '@/lib/permissions';
import { X, Check, Lock, Newspaper, BarChart2, Mic } from 'lucide-react';
import { toast } from 'sonner';

interface ArticleFormProps {
  open: boolean;
  onClose: () => void;
  editArticle?: Article | null;
  defaultStatus?: KanbanStatus;
  userRole?: UserRole | null;
}

// Full list — shown for editors/admins/publishers
const ALL_STATUS_OPTIONS: { value: KanbanStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'editorial_review', label: 'Editorial Review' },
  { value: 'revision', label: 'Revision Required' },
  { value: 'legal_review', label: 'Legal Review' },
  { value: 'compliance', label: 'Compliance Check' },
  { value: 'approved', label: 'Approved' },
  { value: 'publisher_review', label: 'Publisher Review' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'bulletin', label: 'Bulletin' },
];

// Contributors can only use Draft or Submitted
const CONTRIBUTOR_STATUS_OPTIONS: { value: KanbanStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submit for Editorial Review' },
];

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
  userRole = null,
}: ArticleFormProps) {
  const addArticle = useArticleStore((s) => s.addArticle);
  const updateArticle = useArticleStore((s) => s.updateArticle);
  const horses = useHorseStore((s) => s.horses);
  const parties = usePartyStore((s) => s.parties);
  const horseConn = connectionResolver(parties);
  const currentUser = useAuthStore((s) => s.currentUser);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<KanbanStatus>(defaultStatus);
  const [readingTime, setReadingTime] = useState('');
  const [minTier, setMinTier] = useState<SubscriptionTier>('free');
  const [linkedHorseIds, setLinkedHorseIds] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const isContributor = userRole === 'contributor';
  const statusOptions = isContributor ? CONTRIBUTOR_STATUS_OPTIONS : ALL_STATUS_OPTIONS;

  // Contributors always get their display name auto-filled as byline
  const authorLocked = isContributor;

  // Reset form when dialog opens or editArticle changes
  useEffect(() => {
    if (!open) return;
    if (editArticle) {
      setTitle(editArticle.title);
      setSummary(editArticle.summary);
      setAuthor(editArticle.author);
      setCategory(editArticle.category ?? '');
      // If contributor editing, clamp status to allowed options
      const resolvedStatus = (editArticle.status as KanbanStatus) ?? 'draft';
      if (isContributor) {
        const allowed = CONTRIBUTOR_STATUS_OPTIONS.map((o) => o.value);
        setStatus(allowed.includes(resolvedStatus) ? resolvedStatus : 'draft');
      } else {
        setStatus(resolvedStatus);
      }
      setReadingTime(editArticle.readingTime?.toString() ?? '');
      setMinTier(editArticle.minTier ?? 'free');
      setLinkedHorseIds(editArticle.linkedHorseIds ?? []);
      setImageUrl(editArticle.imageUrl ?? '');
    } else {
      setTitle('');
      setSummary('');
      // Auto-fill byline for contributors
      setAuthor(isContributor ? (currentUser?.displayName ?? '') : '');
      setCategory('');
      const clampedDefault = isContributor
        ? (['draft', 'submitted'].includes(defaultStatus) ? defaultStatus : 'draft')
        : defaultStatus;
      setStatus(clampedDefault);
      setReadingTime('');
      setMinTier('free');
      setLinkedHorseIds([]);
      setImageUrl('');
    }
  }, [open, editArticle, defaultStatus, isContributor, currentUser?.displayName]);

  const toggleHorse = (horseId: string) => {
    setLinkedHorseIds((prev) =>
      prev.includes(horseId) ? prev.filter((id) => id !== horseId) : [...prev, horseId]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('A headline is required before going to press.');
      return;
    }
    if (!author.trim()) {
      toast.error('Every story needs a byline. Please add an author.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        summary: summary.trim(),
        author: author.trim(),
        category: category || undefined,
        status: status as Article['status'],
        readingTime: readingTime ? parseInt(readingTime, 10) : undefined,
        minTier,
        linkedHorseIds,
        publishedAt: status === 'published' ? new Date() : null,
        imageUrl: imageUrl.trim() || undefined,
      };

      if (editArticle) {
        updateArticle(editArticle.id, payload);
        toast.success('Story updated — the file has been revised.');
      } else {
        addArticle(payload);
        if (status === 'submitted') {
          toast.success('Story submitted — it is now in the editorial queue.');
        } else {
          toast.success('Story filed — it sits in your draft queue.');
        }
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
              Summary / Lead Paragraph
            </Label>
            <AiTextarea
              id="article-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="The opening paragraph — the paragraph that earns the read."
              rows={4}
              className="resize-none leading-relaxed"
              aiLabel="Summary / lead paragraph"
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
            <div className="space-y-1.5">
              <Label
                htmlFor="article-mintier"
                className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground"
              >
                Access Tier
              </Label>
              <select
                id="article-mintier"
                value={minTier}
                onChange={(e) => setMinTier(e.target.value as SubscriptionTier)}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {TIER_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {t === 'free' ? 'Free — everyone' : `${TIER_LABELS[t]} members & up`}
                  </option>
                ))}
              </select>
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

          {/* Workflow Status — scoped by role */}
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground flex items-center gap-1.5">
              Workflow Stage
              {isContributor && (
                <Lock size={10} className="text-muted-foreground/50" />
              )}
            </Label>
            {isContributor && (
              <p className="text-[10px] text-muted-foreground/70">
                Save as a Draft to continue working, or Submit to place it in the editorial queue.
              </p>
            )}
            <div className={cn(
              'grid gap-2',
              isContributor ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
            )}>
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-sm border text-left transition-colors',
                    status === opt.value
                      ? 'border-primary bg-primary/8 text-primary'
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
              : status === 'submitted'
              ? 'Submit Story'
              : 'Save Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
