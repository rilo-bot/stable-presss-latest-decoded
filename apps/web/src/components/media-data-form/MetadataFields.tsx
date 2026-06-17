import { X, Plus, Newspaper, ChevronDown, Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { Party } from '@/types/party';
import type { Article } from '@/types/article';
import { serifStyle } from './constants';

interface MetadataFieldsProps {
  fieldLabelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;

  // Title / source / date
  title: string;
  setTitle: (v: string) => void;
  sourcePublication: string;
  setSourcePublication: (v: string) => void;
  publishedDate: string;
  setPublishedDate: (v: string) => void;

  // Featured parties
  allParties: Party[];
  featuredPartyIds: string[];
  filteredParties: Party[];
  toggleParty: (id: string) => void;
  partyDropOpen: boolean;
  setPartyDropOpen: React.Dispatch<React.SetStateAction<boolean>>;
  partySearch: string;
  setPartySearch: (v: string) => void;

  // Linked article
  linkedArticle: Article | undefined;
  linkedArticleId: string;
  setLinkedArticleId: (v: string) => void;
  filteredArticles: Article[];
  articleDropOpen: boolean;
  setArticleDropOpen: React.Dispatch<React.SetStateAction<boolean>>;
  articleSearch: string;
  setArticleSearch: (v: string) => void;

  sectionDivider: React.ReactNode;
  fileUpload: React.ReactNode;
}

export function MetadataFields({
  fieldLabelStyle,
  inputStyle,
  title,
  setTitle,
  sourcePublication,
  setSourcePublication,
  publishedDate,
  setPublishedDate,
  allParties,
  featuredPartyIds,
  filteredParties,
  toggleParty,
  partyDropOpen,
  setPartyDropOpen,
  partySearch,
  setPartySearch,
  linkedArticle,
  linkedArticleId,
  setLinkedArticleId,
  filteredArticles,
  articleDropOpen,
  setArticleDropOpen,
  articleSearch,
  setArticleSearch,
  sectionDivider,
  fileUpload,
}: MetadataFieldsProps) {
  return (
    <>
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
      {fileUpload}

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
    </>
  );
}
