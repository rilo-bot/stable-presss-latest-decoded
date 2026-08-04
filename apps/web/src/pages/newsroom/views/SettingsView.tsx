/**
 * Settings — Website Customisation, plus the four publication facts below it.
 *
 * WEBSITE CUSTOMISATION is the writable part: six switches, one per public
 * section, that decide what the site's navbar offers. Switching one off drops it
 * from the desktop bar, the mobile menu, and the router — see
 * apps/web/src/components/PublicSection.tsx for why all three and not just the
 * first.
 *
 * IT HIDES, IT DOES NOT UNPUBLISH. No story, post or episode changes state; the
 * API serves exactly what it served before. This is the site's table of contents,
 * and switching a section back on restores it untouched. The copy on screen says
 * so, because "hide Blog" reads like it might delete something.
 *
 * PERMISSIONS. `settings.view` opens this screen and shows the switches;
 * `settings.manage` is what lets you move one. Both a superadmin and the
 * administrator role hold `settings.manage` — the former by short-circuit, the
 * latter because its permission list is materialised from the whole catalogue —
 * and any custom role can be granted it from Roles & Permissions. The server
 * enforces the same split on PUT /api/site-settings/public-nav; this is only the
 * affordance.
 *
 * The four rows at the foot are still read-only, and still honest about it. They
 * describe the workflow, which is code, not configuration.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/permissions';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';
import { PUBLIC_NAV_KEYS, PUBLIC_NAV_SECTIONS, type PublicNavVisibility } from '@/types/siteSettings';

/** Same checkbox as the Roles console, so the two admin screens read alike. */
const BOX = 'h-4 w-4 flex-shrink-0 rounded-[3px] border-input accent-[hsl(var(--primary))]';

function WebsiteCustomisation() {
  const saved = useSiteSettingsStore((s) => s.publicNav);
  const saving = useSiteSettingsStore((s) => s.saving);
  const savePublicNav = useSiteSettingsStore((s) => s.savePublicNav);
  const mayManage = useCan('settings.manage');

  const [draft, setDraft] = useState<PublicNavVisibility>(saved);

  // Re-seed when the server answer lands (or another admin changes it and this
  // tab refetches). Only while clean — clobbering a half-made edit would be
  // worse than showing a slightly stale baseline.
  const dirty = useMemo(
    () => PUBLIC_NAV_KEYS.some((key) => draft[key] !== saved[key]),
    [draft, saved],
  );
  useEffect(() => {
    if (!dirty) setDraft(saved);
    // `dirty` is derived from both; re-running on `saved` alone is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const visibleCount = PUBLIC_NAV_KEYS.filter((key) => draft[key] !== false).length;
  const noneVisible = visibleCount === 0;

  const onSave = async () => {
    if (await savePublicNav(draft)) {
      const hidden = PUBLIC_NAV_SECTIONS.filter((s) => draft[s.key] === false).map((s) => s.label);
      toast.success(
        hidden.length === 0
          ? 'All six sections are visible on the website.'
          : `Website updated — ${hidden.join(', ')} ${hidden.length === 1 ? 'is' : 'are'} now hidden.`,
      );
    }
  };

  return (
    <section className="rounded-sm border border-border/60 bg-card">
      <header className="border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Website Customisation</h2>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          Which sections the public website shows. Unticking one removes it from the navigation and
          from the site — its pages redirect to the homepage. Nothing is unpublished: tick it back
          on and everything returns exactly as it was.
        </p>
      </header>

      <div className="divide-y divide-border/40">
        {PUBLIC_NAV_SECTIONS.map((section) => {
          const on = draft[section.key] !== false;
          return (
            <label
              key={section.key}
              className={
                'flex items-start gap-3 px-4 py-3 transition-colors ' +
                (mayManage ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default')
              }
            >
              <input
                type="checkbox"
                checked={on}
                disabled={!mayManage}
                onChange={() => setDraft((d) => ({ ...d, [section.key]: !on }))}
                className={'mt-[3px] ' + BOX}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-foreground">{section.label}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{section.path}</span>
                  {!on && (
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Hidden
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                  {section.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-3">
        <span className="text-[12px] text-muted-foreground">
          {visibleCount} of {PUBLIC_NAV_SECTIONS.length} sections visible
        </span>
        <div className="flex-1" />
        {!mayManage ? (
          <span className="text-[12px] text-muted-foreground">
            Changing these needs the “Change website settings” permission.
          </span>
        ) : (
          <>
            {noneVisible && (
              <span className="text-[12px] text-muted-foreground">
                At least one section has to stay visible.
              </span>
            )}
            {dirty && !noneVisible && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(saved)} disabled={saving}>
                Discard
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={!dirty || noneVisible || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        )}
      </footer>
    </section>
  );
}

export function SettingsView() {
  return (
    <div className="max-w-2xl space-y-6">
      <WebsiteCustomisation />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Publication</h2>
        {/* READ-ONLY, and honest about it. These four are not stored anywhere —
            they describe how the workflow is built, so there is nothing to edit.
            The two workflow rows used to be factually wrong as well: they still
            described the retired twelve-status pipeline with a legal-review gate,
            which has been five stages and one approval step since the workflow
            rebuild. */}
        {[
          { label: 'Publication Name', value: 'Stable Press', desc: 'Displayed across all editorial output' },
          { label: 'Default Category', value: 'Race Report', desc: 'Applied to new stories without a category' },
          { label: 'Approval Steps', value: '1', desc: 'One approval before a story may be scheduled or published' },
          { label: 'Workflow Stages', value: '5', desc: 'Draft · Submitted · Approved · Scheduled · Published' },
        ].map((setting) => (
          <div key={setting.label} className="rounded-sm border border-border/60 bg-card p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{setting.label}</span>
              <span
                className="rounded-sm px-2 py-0.5 text-sm font-medium"
                style={{ background: 'hsl(var(--brand-accent) / 0.12)', color: 'hsl(var(--brand-accent))' }}
              >
                {setting.value}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{setting.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
