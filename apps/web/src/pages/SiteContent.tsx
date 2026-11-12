import { useEffect, useState } from 'react';
import { useSponsorStore } from '@/stores/sponsorStore';
import { useBreakingNewsStore } from '@/stores/breakingNewsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Megaphone, Handshake, Plus, X, Loader2, Eye, EyeOff, Pencil, Check } from 'lucide-react';
import type { Sponsor } from '@/types/sponsor';
import { useSiteContentOperatorActions } from '@/pages/production-system/operator-content/useSiteContentOperatorActions';

export default function SiteContent() {
  const sponsors = useSponsorStore((s) => s.sponsors);
  const sponsorsLoading = useSponsorStore((s) => s.loading);
  const fetchSponsors = useSponsorStore((s) => s.fetchSponsors);
  const addSponsor = useSponsorStore((s) => s.addSponsor);
  const removeSponsor = useSponsorStore((s) => s.removeSponsor);
  const updateSponsor = useSponsorStore((s) => s.updateSponsor);

  const news = useBreakingNewsStore((s) => s.items);
  const newsLoading = useBreakingNewsStore((s) => s.loading);
  const fetchBreakingNews = useBreakingNewsStore((s) => s.fetchBreakingNews);
  const addItem = useBreakingNewsStore((s) => s.addItem);
  const updateItem = useBreakingNewsStore((s) => s.updateItem);
  const removeItem = useBreakingNewsStore((s) => s.removeItem);

  useEffect(() => {
    void fetchSponsors();
    void fetchBreakingNews();
  }, [fetchSponsors, fetchBreakingNews]);

  // ── Sponsor form ──
  const [sName, setSName] = useState('');
  const [sCategory, setSCategory] = useState('');
  const [sTagline, setSTagline] = useState('');
  const [sUrl, setSUrl] = useState('');
  const [sBusy, setSBusy] = useState(false);

  const onAddSponsor = async () => {
    if (!sName.trim()) return;
    setSBusy(true);
    const id = await addSponsor({
      name: sName.trim(),
      category: sCategory.trim(),
      tagline: sTagline.trim(),
      websiteUrl: sUrl.trim() || undefined,
      sortOrder: sponsors.length,
    });
    setSBusy(false);
    if (id) {
      setSName('');
      setSCategory('');
      setSTagline('');
      setSUrl('');
    }
  };

  // ── Sponsor inline edit ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', category: '', tagline: '', websiteUrl: '' });
  const [eBusy, setEBusy] = useState(false);

  const startEdit = (s: Sponsor) => {
    setEditingId(s.id);
    setEdit({ name: s.name, category: s.category ?? '', tagline: s.tagline ?? '', websiteUrl: s.websiteUrl ?? '' });
  };

  const onSaveSponsor = async () => {
    if (!editingId || !edit.name.trim()) return;
    setEBusy(true);
    await updateSponsor(editingId, {
      name: edit.name.trim(),
      category: edit.category.trim(),
      tagline: edit.tagline.trim(),
      websiteUrl: edit.websiteUrl.trim() || undefined,
    });
    setEBusy(false);
    setEditingId(null);
  };

  // ── Breaking-news form ──
  const [nText, setNText] = useState('');
  const [nBusy, setNBusy] = useState(false);

  const onAddNews = async () => {
    if (!nText.trim()) return;
    setNBusy(true);
    const id = await addItem({ text: nText.trim(), active: true, sortOrder: news.length });
    setNBusy(false);
    if (id) setNText('');
  };

  // The Stable Hand Operator: site.readContent / addSponsor / editSponsor /
  // removeSponsor / addHeadline / showHeadline / removeHeadline / clearTicker —
  // each drives the forms and row buttons below.
  useSiteContentOperatorActions({ editingId });

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 space-y-12">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
          Site Content
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the sponsors and breaking-news ticker shown on the public landing page.
        </p>
      </div>

      {/* ── Breaking news ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <Megaphone size={18} className="text-primary" />
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
            Breaking-news ticker
          </h2>
        </div>
        <div className="h-px w-full bg-border/60 mb-5" />

        <div className="p-4 border border-dashed border-border/60 rounded-sm mb-6 space-y-3">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
            Add a headline
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={nText}
              onChange={(e) => setNText(e.target.value)}
              placeholder="RACE 7 FLEMINGTON — …"
              data-agent-id="site.headline-input"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && onAddNews()}
            />
            <Button onClick={onAddNews} disabled={nBusy || !nText.trim()} className="gap-1.5" data-agent-id="site.headline-add" data-agent-confirm="Put this headline on the live breaking-news ticker?">
              {nBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add
            </Button>
          </div>
        </div>

        {newsLoading && news.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : news.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 italic py-4">No headlines yet.</p>
        ) : (
          <ul className="space-y-2">
            {news.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 p-3 border border-border/60 rounded-sm bg-card text-sm"
                data-agent-id={`site.headline-${item.id}`}
                data-agent-label={item.text}
              >
                <span className={item.active ? 'flex-1 text-foreground' : 'flex-1 text-muted-foreground/50 line-through'}>
                  {item.text}
                </span>
                <button
                  onClick={() => void updateItem(item.id, { active: !item.active })}
                  data-agent-id={`site.headline-toggle-${item.id}`}
                  aria-pressed={item.active}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={item.active ? 'Hide from ticker' : 'Show in ticker'}
                  title={item.active ? 'Active — click to hide' : 'Hidden — click to show'}
                >
                  {item.active ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  onClick={() => void removeItem(item.id)}
                  data-agent-id={`site.headline-remove-${item.id}`}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Delete"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Sponsors ── */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <Handshake size={18} className="text-primary" />
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
            Sponsors &amp; partners
          </h2>
        </div>
        <div className="h-px w-full bg-border/60 mb-5" />

        <div className="p-4 border border-dashed border-border/60 rounded-sm mb-6 space-y-3">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
            Add a sponsor
          </Label>
          <div className="grid sm:grid-cols-2 gap-2">
            <Input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Name *" data-agent-id="site.sponsor-name" />
            <Input value={sCategory} onChange={(e) => setSCategory(e.target.value)} placeholder="Category (e.g. Principal Partner)" data-agent-id="site.sponsor-category" />
            <Input value={sTagline} onChange={(e) => setSTagline(e.target.value)} placeholder="Tagline" className="sm:col-span-2" data-agent-id="site.sponsor-tagline" />
            <Input value={sUrl} onChange={(e) => setSUrl(e.target.value)} placeholder="Website URL (optional)" className="sm:col-span-2" data-agent-id="site.sponsor-url" />
          </div>
          <Button onClick={onAddSponsor} disabled={sBusy || !sName.trim()} className="gap-1.5" data-agent-id="site.sponsor-add">
            {sBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add sponsor
          </Button>
        </div>

        {sponsorsLoading && sponsors.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : sponsors.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 italic py-4">No sponsors yet.</p>
        ) : (
          <ul className="space-y-2">
            {sponsors.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-3 p-3 border border-border/60 rounded-sm bg-card"
                data-agent-id={`site.sponsor-${s.id}`}
                data-agent-label={s.name}
              >
                {editingId === s.id ? (
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="grid sm:grid-cols-2 gap-2">
                      <Input
                        value={edit.name}
                        onChange={(e) => setEdit((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Name *"
                        aria-label="Sponsor name"
                        data-agent-id="site.sponsor-edit-name"
                      />
                      <Input
                        value={edit.category}
                        onChange={(e) => setEdit((f) => ({ ...f, category: e.target.value }))}
                        placeholder="Category"
                        aria-label="Sponsor category"
                        data-agent-id="site.sponsor-edit-category"
                      />
                      <Input
                        value={edit.tagline}
                        onChange={(e) => setEdit((f) => ({ ...f, tagline: e.target.value }))}
                        placeholder="Tagline"
                        aria-label="Sponsor tagline"
                        className="sm:col-span-2"
                        data-agent-id="site.sponsor-edit-tagline"
                      />
                      <Input
                        value={edit.websiteUrl}
                        onChange={(e) => setEdit((f) => ({ ...f, websiteUrl: e.target.value }))}
                        placeholder="Website URL (optional)"
                        aria-label="Sponsor website URL"
                        className="sm:col-span-2"
                        data-agent-id="site.sponsor-edit-url"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void onSaveSponsor()}
                        disabled={eBusy || !edit.name.trim()}
                        className="gap-1.5"
                        data-agent-id="site.sponsor-save"
                      >
                        {eBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} data-agent-id="site.sponsor-cancel">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                <>
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground truncate">{s.name}</span>
                  {s.category && (
                    <span className="block text-[10px] uppercase tracking-wide font-bold text-primary/80">
                      {s.category}
                    </span>
                  )}
                  {s.tagline && <span className="block text-xs text-muted-foreground mt-0.5">{s.tagline}</span>}
                  {s.websiteUrl && (
                    <a
                      href={s.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-[11px] text-primary hover:underline mt-0.5 truncate"
                    >
                      {s.websiteUrl}
                    </a>
                  )}
                </div>
                <button
                  onClick={() => startEdit(s)}
                  className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                  aria-label="Edit sponsor"
                  data-agent-id={`site.sponsor-edit-${s.id}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => void removeSponsor(s.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                  aria-label="Delete sponsor"
                  data-agent-id={`site.sponsor-remove-${s.id}`}
                >
                  <X size={15} />
                </button>
                </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
