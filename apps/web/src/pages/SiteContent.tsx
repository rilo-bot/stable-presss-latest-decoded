import { useEffect, useState } from 'react';
import { useSponsorStore } from '@/stores/sponsorStore';
import { useBreakingNewsStore } from '@/stores/breakingNewsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Megaphone, Handshake, Plus, X, Loader2, Eye, EyeOff } from 'lucide-react';

export default function SiteContent() {
  const sponsors = useSponsorStore((s) => s.sponsors);
  const sponsorsLoading = useSponsorStore((s) => s.loading);
  const fetchSponsors = useSponsorStore((s) => s.fetchSponsors);
  const addSponsor = useSponsorStore((s) => s.addSponsor);
  const removeSponsor = useSponsorStore((s) => s.removeSponsor);

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
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && onAddNews()}
            />
            <Button onClick={onAddNews} disabled={nBusy || !nText.trim()} className="gap-1.5">
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
              >
                <span className={item.active ? 'flex-1 text-foreground' : 'flex-1 text-muted-foreground/50 line-through'}>
                  {item.text}
                </span>
                <button
                  onClick={() => void updateItem(item.id, { active: !item.active })}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={item.active ? 'Hide from ticker' : 'Show in ticker'}
                  title={item.active ? 'Active — click to hide' : 'Hidden — click to show'}
                >
                  {item.active ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  onClick={() => void removeItem(item.id)}
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
            <Input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Name *" />
            <Input value={sCategory} onChange={(e) => setSCategory(e.target.value)} placeholder="Category (e.g. Principal Partner)" />
            <Input value={sTagline} onChange={(e) => setSTagline(e.target.value)} placeholder="Tagline" className="sm:col-span-2" />
            <Input value={sUrl} onChange={(e) => setSUrl(e.target.value)} placeholder="Website URL (optional)" className="sm:col-span-2" />
          </div>
          <Button onClick={onAddSponsor} disabled={sBusy || !sName.trim()} className="gap-1.5">
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
              >
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
                  onClick={() => void removeSponsor(s.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                  aria-label="Delete sponsor"
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
