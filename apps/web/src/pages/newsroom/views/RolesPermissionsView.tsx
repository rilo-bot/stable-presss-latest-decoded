import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronRight, Copy, Loader2, Lock, Pencil, Plus,
  Save, Search, Shield, Trash2, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/EmptyState';
import {
  useRoleStore, type ModuleMeta, type PermissionMeta, type Role, type RoleDraft,
  type WorkflowStageMeta,
} from '@/stores/roleStore';
import { ROLE_ICON_NAMES, roleColor, roleIcon } from '@/lib/roleDisplay';
import {
  DANGEROUS_PERMISSIONS, ROLE_LAYOUT, grantsNoScreens, unmappedIds,
  type ScreenSpec, type SectionSpec,
} from './rolePermissionLayout';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Roles & Permissions — a LIST you expand, not a wall of checkboxes.
//
// This screen used to render every role fully expanded, all the time: 15 rows
// and 67 checkboxes per card (24 modules + 38 actions + 5 board columns), which
// with the four seeded roles put ~200 checkboxes on first paint. Answering "what
// roles do we have?" meant scrolling past all of them, and reading one role meant
// visually subtracting the 59 things it could NOT do from the 67 drawn — the
// unchecked ones were rendered at 45% opacity rather than omitted.
//
// Three things changed (docs/RBAC-UI-REVIEW.md):
//
//   1. COLLAPSED BY DEFAULT. One row per role, carrying a summary written FROM
//      the permission set — "Publishes stories · Approves copy · 18 screens" —
//      rather than the old "18 granted", which told you a quantity and not a
//      capability.
//
//   2. THE READ VIEW SHOWS ONLY WHAT IS GRANTED, as chips. No unchecked entries
//      and no disabled inputs. That last part matters beyond tidiness: `disabled`
//      checkboxes are not keyboard-focusable, so the old read view was literally
//      unreachable for anyone not using a mouse.
//
//   3. SEARCH MATCHES WHAT A ROLE GRANTS, not just its name. Typing "publish"
//      finds every role that can publish and opens them.
//
// The checkbox grid still exists, but only inside edit mode. It moves to a
// right-hand sheet in the next phase; until then it flips the open row in place.
//
// Rows come from the server catalogue, so adding an action to
// permissionCatalogue.ts makes it appear here with no frontend change.
// ---------------------------------------------------------------------------

const ROLE_COLOR_CHOICES = ['#7c3aed', '#0ea5e9', '#059669', '#d97706', '#dc2626', '#475569'];

/**
 * Permissions that hand over control of the platform itself, and what to say
 * about each. Called out in the read view because the old grid styled
 * `platform.admin` exactly like "See the Draft column" — and one of these
 * (`roles.manage`) currently lets its holder grant themselves the rest.
 * See docs/RBAC-STAFF-CAMPAIGN-ENGINE-REVIEW.md C1.
 */
const RISK_BLURBS: Record<string, string> = {
  'platform.admin': 'can manage every organisation and override any ownership',
  'roles.manage': 'can change what every role on the platform grants',
  'team.manage': 'can invite people and change who holds which role',
  'claims.verify': 'can verify or reject racing identities',
};

/**
 * How a role's access is described in one line, most significant first. The
 * summary names the first two that match — a capability, not a count.
 */
const SUMMARY_RULES: Array<{ id: string; phrase: string }> = [
  { id: 'platform.admin', phrase: 'Full platform access' },
  { id: 'roles.manage', phrase: 'Manages roles' },
  { id: 'team.manage', phrase: 'Manages the team' },
  { id: 'content.publish', phrase: 'Publishes stories' },
  { id: 'content.approve', phrase: 'Approves copy' },
  { id: 'content.editorial_review', phrase: 'Reviews copy' },
  { id: 'content.draft.edit_any', phrase: 'Edits any story' },
  { id: 'blog.publish', phrase: 'Publishes blogs' },
  { id: 'podcast.episode.publish', phrase: 'Publishes episodes' },
  { id: 'content.submit', phrase: 'Drafts & submits' },
  { id: 'content.draft.create', phrase: 'Writes drafts' },
  { id: 'blog.create', phrase: 'Writes blog posts' },
  { id: 'media.upload_own', phrase: 'Uploads media' },
  { id: 'analytics.view', phrase: 'Sees analytics' },
  // No `newsroom.access` entry: every staff role has it, so it distinguishes
  // nothing. It is not even in the catalogue any more — see rolePermissionLayout.
];

const emptyDraft = (): RoleDraft => ({
  label: '',
  description: '',
  color: ROLE_COLOR_CHOICES[0],
  icon: 'Shield',
  permissions: [],
  modules: [],
  workflowStages: [],
});

const draftFrom = (role: Role): RoleDraft => ({
  label: role.label,
  description: role.description ?? '',
  color: role.color ?? ROLE_COLOR_CHOICES[0],
  icon: role.icon ?? 'Shield',
  permissions: [...role.permissions],
  modules: [...role.modules],
  workflowStages: [...role.workflowStages],
});

/** Group an array into ordered [key, items] pairs, preserving first-seen order. */
function groupBy<T>(items: T[], key: (t: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return [...map.entries()];
}

/** The three independent things a role carries, as stored on the draft. */
type Axis = 'permissions' | 'modules' | 'workflowStages';

/** Catalogue lookups + the searchable text for each role, computed once. */
interface Lookups {
  perm: Map<string, PermissionMeta>;
  mod: Map<string, ModuleMeta>;
  stage: Map<string, WorkflowStageMeta>;
  stageCount: number;
}

/**
 * The one-line description of what a role grants. Deliberately not a count:
 * "18 granted" is a number you then have to go and investigate.
 */
function accessSummary(role: Role, l: Lookups): string {
  if (role.isImmutable) return 'Everything, always';
  const held = new Set(role.permissions);
  const phrases = SUMMARY_RULES.filter((r) => held.has(r.id)).slice(0, 2).map((r) => r.phrase);

  const parts: string[] = [...phrases];
  if (role.modules.length > 0) {
    parts.push(`${role.modules.length} screen${role.modules.length === 1 ? '' : 's'}`);
  }
  if (role.workflowStages.length > 0) {
    parts.push(
      role.workflowStages.length === l.stageCount
        ? 'all board columns'
        : `${role.workflowStages.length} of ${l.stageCount} columns`,
    );
  }
  if (parts.length === 0) return 'No access granted yet';
  return parts.join(' · ');
}

/** Everything about a role that search should match — name AND what it grants. */
function haystack(role: Role, l: Lookups): string {
  const bits = [role.label, role.slug, role.description ?? ''];
  for (const id of role.permissions) {
    const m = l.perm.get(id);
    if (m) bits.push(m.label, m.resource, m.short);
    else bits.push(id);
  }
  for (const id of role.modules) bits.push(l.mod.get(id)?.label ?? id);
  for (const id of role.workflowStages) bits.push(l.stage.get(id)?.label ?? id);
  return bits.join(' ').toLowerCase();
}

// ── Read view ────────────────────────────────────────────────────────────────

/** One chip. Granted things only — there is nothing to un-tick here. */
function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[12px] text-foreground"
    >
      {children}
    </span>
  );
}

/**
 * One labelled group of granted chips, sub-grouped by resource/section so
 * "Podcast" reads as thirteen podcast actions rather than thirteen loose chips
 * indistinguishable from the editorial ones.
 */
function GrantGroup({
  heading, caption, groups, empty,
}: {
  heading: string;
  caption?: string;
  groups: Array<[string, Array<{ id: string; label: string; title?: string }>]>;
  empty: string;
}) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {heading}
      </p>
      {caption && <p className="mb-2 text-[12px] text-muted-foreground/80">{caption}</p>}
      {groups.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {groups.map(([name, items]) => (
            <div key={name} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="w-32 flex-shrink-0 text-[12px] text-muted-foreground">{name}</span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {items.map((i) => (
                  <Chip key={i.id} title={i.title}>
                    {i.label}
                  </Chip>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoleReadView({ role, l }: { role: Role; l: Lookups }) {
  const held = new Set(role.permissions);

  const actionGroups = useMemo(() => {
    const metas = role.permissions
      .map((id) => l.perm.get(id))
      .filter((m): m is PermissionMeta => !!m);
    return groupBy(metas, (m) => m.resource).map(
      ([resource, items]) =>
        [resource, items.map((m) => ({ id: m.id, label: m.label, title: m.description }))] as [
          string,
          Array<{ id: string; label: string; title?: string }>,
        ],
    );
  }, [role.permissions, l]);

  const moduleGroups = useMemo(() => {
    const metas = role.modules.map((id) => l.mod.get(id)).filter((m): m is ModuleMeta => !!m);
    return groupBy(metas, (m) => m.section).map(
      ([section, items]) =>
        [section, items.map((m) => ({ id: m.id, label: m.label }))] as [
          string,
          Array<{ id: string; label: string; title?: string }>,
        ],
    );
  }, [role.modules, l]);

  const stageItems = role.workflowStages
    .map((id) => l.stage.get(id))
    .filter((s): s is WorkflowStageMeta => !!s)
    .map((s) => ({ id: s.id, label: s.label }));

  const risks = Object.keys(RISK_BLURBS).filter((id) => held.has(id));

  if (role.isImmutable) {
    return (
      <p className="px-1 py-1 text-sm text-muted-foreground">
        Superadmin is enforced in code and always resolves to every module, action and workflow
        column. It cannot be edited or deleted, so the platform can never be locked out of its own
        roles screen.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {risks.length > 0 && (
        <div className="flex items-start gap-2 rounded-sm border border-[hsl(var(--brand-accent)/0.4)] bg-[hsl(var(--brand-accent)/0.08)] px-3 py-2">
          <AlertTriangle
            size={14}
            className="mt-0.5 flex-shrink-0 text-[hsl(var(--brand-accent))]"
            aria-hidden="true"
          />
          <p className="text-[12.5px] leading-relaxed text-foreground">
            <span className="font-semibold">Controls the platform itself.</span> Anyone with this
            role{' '}
            {risks.map((id, i) => (
              <span key={id}>
                {i > 0 && (i === risks.length - 1 ? ' and ' : ', ')}
                {RISK_BLURBS[id]}
              </span>
            ))}
            .
          </p>
        </div>
      )}

      <GrantGroup
        heading="Can do"
        groups={actionGroups}
        empty="Nothing — this role grants no actions."
      />
      <GrantGroup
        heading="Can open"
        // Honest about what this axis currently does: the server resolves the
        // module list but no route enforces it, so it controls the sidebar and
        // the per-URL check in the browser. See RBAC review H1 — when that
        // lands, this caption comes off.
        caption="Which screens appear in the Campaign Engine."
        groups={moduleGroups}
        // They CAN sign in — that comes with being staff — they just arrive at an
        // empty sidebar. Saying "cannot open the Campaign Engine" was true only
        // while newsroom access was a grantable checkbox.
        empty="No screens — they can sign in, but the sidebar will be empty."
      />
      <GrantGroup
        heading="Board columns"
        groups={stageItems.length ? [['Workflow', stageItems]] : []}
        empty="None — the workflow board will be empty for this role."
      />
    </div>
  );
}

// ── Edit mode: one checkbox ──────────────────────────────────────────────────

/**
 * NOTHING IN EDIT MODE IS DIMMED TO SHOW STATE. The checkbox is the state; text
 * at reduced opacity saying the same thing again is redundant, and it was how the
 * original screen managed to be both cluttered and below the AA contrast floor.
 * Labels are full-strength whether ticked or not. The only muted text is a
 * permission's description, which is secondary *information*, not a state cue.
 */
const BOX = 'h-4 w-4 flex-shrink-0 rounded-[3px] border-input accent-[hsl(var(--primary))]';

/**
 * An action checkbox. The catalogue's `description` sits beneath the label rather
 * than in a `title` where only a mouse could reach it — affordable now that only
 * one screen's actions are open at a time.
 */
function ActionBox({
  meta, checked, onToggle,
}: {
  meta: PermissionMeta;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-muted/60">
      <input type="checkbox" checked={checked} onChange={onToggle} className={'mt-[2px] ' + BOX} />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[13px] text-foreground">
          {meta.label}
          {DANGEROUS_PERMISSIONS.has(meta.id) && (
            <AlertTriangle
              size={11}
              className="flex-shrink-0 text-[hsl(var(--brand-accent))]"
              aria-label="Controls the platform itself"
            />
          )}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
          {meta.description}
        </span>
      </span>
    </label>
  );
}

/** A bare toggle — a workflow column or an Editor Hub tab. */
function PlainBox({
  label, checked, onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-muted/60">
      <input type="checkbox" checked={checked} onChange={onToggle} className={BOX} />
      <span className="text-[13px] text-foreground">{label}</span>
    </label>
  );
}

// ── Edit mode: one screen and everything under it ───────────────────────────

/**
 * One screen: a single line you tick to grant, with everything it can do folded
 * away behind it.
 *
 * COLLAPSED BY DEFAULT is the whole point. Rendering every screen's actions at
 * once — which the previous pass did — put the same 60-odd checkboxes on screen as
 * the flat grid it replaced, just in a better order. Most screens (Overview,
 * Pipeline Map, Magazine Builder, the four registers) have no actions at all, so
 * collapsed they are exactly one checkbox and one word.
 *
 * Two separate hit targets, because they do different things: the label toggles
 * the grant, and the count on the right opens the detail. A checkbox nested inside
 * an expander button would be invalid markup and would fight the label click.
 */
function ScreenBlock({
  spec, l, draft, open, pinned, onToggleOpen,
  onToggleModule, onToggleAction, onToggleStage, onToggleAllActions,
}: {
  spec: ScreenSpec;
  l: Lookups;
  draft: RoleDraft;
  open: boolean;
  /** Always open, with no expander — for a block too small to be worth folding. */
  pinned?: boolean;
  onToggleOpen: () => void;
  onToggleModule: (id: string) => void;
  onToggleAction: (id: string) => void;
  onToggleStage: (id: string) => void;
  onToggleAllActions: (ids: string[], next: boolean) => void;
}) {
  const mod = spec.module ? l.mod.get(spec.module) : undefined;
  const heading = mod?.label ?? spec.label ?? spec.module ?? '';
  const actions = (spec.actions ?? [])
    .map((id) => l.perm.get(id))
    .filter((m): m is PermissionMeta => !!m);
  const actionIds = actions.map((a) => a.id);
  const grantedActions = actionIds.filter((id) => draft.permissions.includes(id)).length;
  const allActions = actionIds.length > 0 && grantedActions === actionIds.length;
  const tabs = spec.tabs ?? [];
  const expandable = !pinned && (actions.length > 0 || !!spec.stages || tabs.length > 0);
  const isOpen = pinned || open;
  const panelId = `screen-${spec.module ?? spec.label}`;

  /** What's inside, summarised on the collapsed row. */
  const insideBits: string[] = [];
  if (actionIds.length > 0) insideBits.push(`${grantedActions}/${actionIds.length} actions`);
  if (spec.stages) insideBits.push(`${draft.workflowStages.length}/${l.stageCount} columns`);
  if (tabs.length > 0) {
    insideBits.push(`${tabs.filter((t) => draft.modules.includes(t)).length}/${tabs.length} tabs`);
  }

  return (
    <div className="rounded-sm border border-border/50 bg-card">
      <div className="flex items-center gap-1 px-1.5 py-0.5">
        {spec.module ? (
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-sm px-1.5 py-1.5 transition-colors hover:bg-muted/60">
            <input
              type="checkbox"
              checked={draft.modules.includes(spec.module)}
              onChange={() => onToggleModule(spec.module!)}
              className={BOX}
            />
            <span className="truncate text-[13.5px] font-medium text-foreground">{heading}</span>
          </label>
        ) : (
          <span className="min-w-0 flex-1 px-1.5 py-1.5 text-[13.5px] font-medium text-foreground">
            {heading}
          </span>
        )}

        {expandable && (
          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-sm px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="tabular-nums">{insideBits.join(' · ')}</span>
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {spec.note && !isOpen && (
        <p className="px-3.5 pb-2 text-[12px] leading-snug text-muted-foreground">{spec.note}</p>
      )}

      {isOpen && (
        <div id={panelId} className="space-y-2.5 border-t border-border/40 px-3 py-2.5">
          {spec.note && (
            <p className="text-[12px] leading-snug text-muted-foreground">{spec.note}</p>
          )}

          {actions.length > 0 && (
            <div>
              {actionIds.length > 1 && (
                <button
                  type="button"
                  onClick={() => onToggleAllActions(actionIds, !allActions)}
                  className="mb-0.5 px-2 text-[12px] font-semibold text-primary hover:underline"
                >
                  {allActions ? 'Clear all' : 'Select all'}
                </button>
              )}
              <div className="grid gap-x-6 sm:grid-cols-2">
                {actions.map((meta) => (
                  <ActionBox
                    key={meta.id}
                    meta={meta}
                    checked={draft.permissions.includes(meta.id)}
                    onToggle={() => onToggleAction(meta.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {spec.stages && (
            <div>
              <p className="mb-0.5 px-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Columns they see
              </p>
              <div className="flex flex-wrap gap-x-2">
                {[...l.stage.values()].map((s) => (
                  <PlainBox
                    key={s.id}
                    label={s.label}
                    checked={draft.workflowStages.includes(s.id)}
                    onToggle={() => onToggleStage(s.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {tabs.length > 0 && (
            <div>
              <p className="mb-0.5 px-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Tabs
              </p>
              <div className="flex flex-wrap gap-x-2">
                {tabs.map((id) => (
                  <PlainBox
                    key={id}
                    label={l.mod.get(id)?.label ?? id}
                    checked={draft.modules.includes(id)}
                    onToggle={() => onToggleModule(id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Edit mode: the whole editor body ────────────────────────────────────────

function RoleEditor({
  role, l, sections, draft, setDraft, otherRoles, onCloneFrom,
}: {
  role: Role | null;
  l: Lookups;
  sections: SectionSpec[];
  draft: RoleDraft;
  setDraft: React.Dispatch<React.SetStateAction<RoleDraft>>;
  otherRoles: Role[];
  onCloneFrom: (slug: string) => void;
}) {
  const toggle = (axis: Axis, id: string) =>
    setDraft((d) => ({
      ...d,
      [axis]: d[axis].includes(id) ? d[axis].filter((x) => x !== id) : [...d[axis], id],
    }));

  const toggleAllActions = (ids: string[], next: boolean) =>
    setDraft((d) => ({
      ...d,
      permissions: next
        ? [...new Set([...d.permissions, ...ids])]
        : d.permissions.filter((x) => !ids.includes(x)),
    }));

  /**
   * Which screens are opened out. Several may be open at once — setting up Stories
   * and then Blogs is one continuous job, and forcing the first shut to see the
   * second is the kind of tidiness that costs the user clicks.
   */
  const [openScreens, setOpenScreens] = useState<Set<string>>(new Set());
  const toggleScreen = (key: string) =>
    setOpenScreens((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-3">
      {/* Valid but empty-handed: they can sign in (that comes with being staff)
          and will find nothing in the sidebar. Better said here than discovered
          by the person it happens to. */}
      {grantsNoScreens(draft.modules) && (
        <div className="flex items-start gap-2 rounded-sm border border-[hsl(var(--brand-accent)/0.4)] bg-[hsl(var(--brand-accent)/0.08)] px-3 py-2">
          <AlertTriangle
            size={14}
            className="mt-0.5 flex-shrink-0 text-[hsl(var(--brand-accent))]"
            aria-hidden="true"
          />
          <p className="text-[12.5px] leading-relaxed text-foreground">
            <span className="font-semibold">No screens picked yet.</span> Anyone with this role can
            sign in to the Campaign Engine — that comes with being on the team — but their sidebar
            will be empty until you tick at least one screen below.
          </p>
        </div>
      )}
      <div className="grid items-start gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="space-y-1.5">
          <Label className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Role name
          </Label>
          <Input
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="e.g. Racing Desk Lead"
            maxLength={60}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Colour
          </Label>
          <div className="flex h-9 items-center gap-1.5">
            {ROLE_COLOR_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, color: c }))}
                aria-label={`Colour ${c}`}
                aria-pressed={draft.color === c}
                className={
                  'h-5 w-5 rounded-full border-2 transition-transform ' +
                  (draft.color === c ? 'scale-110 border-foreground' : 'border-transparent')
                }
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Icon
          </Label>
          <div className="flex max-w-[280px] flex-wrap items-center gap-0.5">
            {ROLE_ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, icon: name }))}
                aria-label={`Icon ${name}`}
                aria-pressed={draft.icon === name}
                className={
                  'rounded-sm border p-1 transition-colors ' +
                  (draft.icon === name
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground')
                }
              >
                {roleIcon(name, 13)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Description <span className="font-normal normal-case tracking-normal">(optional)</span>
        </Label>
        <Textarea
          value={draft.description ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="What is this role for?"
          rows={2}
          maxLength={240}
        />
      </div>

      {otherRoles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Copy size={12} /> Start from
          </span>
          {otherRoles.map((r) => (
            <button
              key={r.slug}
              type="button"
              onClick={() => onCloneFrom(r.slug)}
              className="rounded-full border border-input px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {role && (
        <p className="text-[11px] text-muted-foreground/70">
          The identifier <code>{role.slug}</code> stays fixed — renaming changes the label only.
        </p>
      )}

      {/* Screen by screen, in sidebar order. */}
      <div className="space-y-3 pt-1">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {section.title}
            </p>
            {section.note && (
              <p className="mb-1.5 text-[12px] leading-snug text-muted-foreground/90">
                {section.note}
              </p>
            )}
            <div className="space-y-1">
              {section.screens.map((spec, i) => {
                const key = spec.module ?? spec.label ?? String(i);
                return (
                  <ScreenBlock
                    key={key}
                    spec={spec}
                    l={l}
                    draft={draft}
                    // The Platform block is two checkboxes with nothing to fold
                    // away, so it stays open — a collapsed row hiding two items is
                    // a click for no reason.
                    open={openScreens.has(key)}
                    pinned={section.isAccess}
                    onToggleOpen={() => toggleScreen(key)}
                    onToggleModule={(id) => toggle('modules', id)}
                    onToggleAction={(id) => toggle('permissions', id)}
                    onToggleStage={(id) => toggle('workflowStages', id)}
                    onToggleAllActions={toggleAllActions}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── One accordion row ────────────────────────────────────────────────────────

function RoleRow({
  role, l, sections, open, editing, editingElsewhere, draft, setDraft, busy, otherRoles,
  onToggleOpen, onStartEdit, onCancel, onSave, onDelete, onCloneFrom,
}: {
  /** null while composing a brand-new role. */
  role: Role | null;
  l: Lookups;
  sections: SectionSpec[];
  open: boolean;
  editing: boolean;
  /** Another row is mid-edit — say so rather than silently hiding the button. */
  editingElsewhere: boolean;
  draft: RoleDraft;
  setDraft: React.Dispatch<React.SetStateAction<RoleDraft>>;
  busy: boolean;
  otherRoles: Role[];
  onToggleOpen: () => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onCloneFrom: (slug: string) => void;
}) {
  const color = role ? roleColor(role) : draft.color;
  const assignees = role?.assigneeCount ?? 0;
  const panelId = `role-panel-${role?.slug ?? 'new'}`;

  return (
    <section
      className={
        'overflow-hidden rounded-sm border bg-card transition-colors ' +
        (editing ? 'border-primary/50' : 'border-border/60')
      }
    >
      <div className="flex items-center gap-2 px-2 py-2">
        {/* The whole header is the toggle. Action buttons are siblings, never
            nested inside it — a button inside a button is invalid and breaks
            keyboard activation. */}
        <button
          type="button"
          onClick={onToggleOpen}
          disabled={!role}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
        >
          <span className="flex-shrink-0 text-muted-foreground">
            {role ? (
              open ? <ChevronDown size={15} /> : <ChevronRight size={15} />
            ) : (
              <Plus size={15} />
            )}
          </span>
          <span style={{ color }} className="flex-shrink-0">
            {roleIcon(editing ? draft.icon : role?.icon, 16)}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold text-foreground">
                {role ? role.label : draft.label || 'New role'}
              </span>
              {role?.isImmutable ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Lock size={9} /> System
                </span>
              ) : role?.isSystem ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Shield size={9} /> Built-in
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
              {role ? accessSummary(role, l) : 'Choose what it can do below'}
            </span>
          </span>

          {role && (
            <span className="flex flex-shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
              <Users size={12} /> {assignees}
              <span className="hidden sm:inline">user{assignees !== 1 ? 's' : ''}</span>
            </span>
          )}
        </button>

        <div className="flex flex-shrink-0 items-center gap-2 pr-1">
          {editing ? (
            <>
              <Button size="sm" onClick={onSave} disabled={busy} className="gap-1.5">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {role ? 'Save changes' : 'Create role'}
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
            </>
          ) : role?.isImmutable ? (
            <span className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:flex">
              <Lock size={12} /> Full access
            </span>
          ) : role ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onStartEdit}
                disabled={busy || editingElsewhere}
                title={editingElsewhere ? 'Finish the role you are editing first.' : undefined}
                className="gap-1.5"
              >
                <Pencil size={13} />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              {!role.isSystem && (
                <button
                  onClick={onDelete}
                  disabled={busy || editingElsewhere}
                  className="p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                  aria-label={`Delete ${role.label}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {open && (
        <div id={panelId} className="border-t border-border/40 px-4 py-3.5">
          {editing ? (
            <RoleEditor
              role={role}
              l={l}
              sections={sections}
              draft={draft}
              setDraft={setDraft}
              otherRoles={otherRoles}
              onCloneFrom={onCloneFrom}
            />
          ) : role ? (
            <RoleReadView role={role} l={l} />
          ) : null}
        </div>
      )}
    </section>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

interface RolesPermissionsViewProps {
  canManageRoles: boolean;
}

export function RolesPermissionsView({ canManageRoles }: RolesPermissionsViewProps) {
  const catalogue = useRoleStore((s) => s.catalogue);
  const roles = useRoleStore((s) => s.roles);
  const loading = useRoleStore((s) => s.loading);
  const loaded = useRoleStore((s) => s.loaded);
  const fetchCatalogue = useRoleStore((s) => s.fetchCatalogue);
  const fetchRoles = useRoleStore((s) => s.fetchRoles);
  const createRole = useRoleStore((s) => s.createRole);
  const updateRole = useRoleStore((s) => s.updateRole);
  const deleteRole = useRoleStore((s) => s.deleteRole);

  /** Which row is expanded for READING. Independent of edit mode. */
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  /** null = not editing, '' = composing a new role, otherwise the role SLUG. */
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  useEffect(() => {
    if (!canManageRoles) return;
    void fetchCatalogue();
    void fetchRoles();
  }, [canManageRoles, fetchCatalogue, fetchRoles]);

  const lookups = useMemo<Lookups>(
    () => ({
      perm: new Map((catalogue?.permissions ?? []).map((p) => [p.id, p])),
      mod: new Map((catalogue?.modules ?? []).map((m) => [m.id, m])),
      stage: new Map((catalogue?.workflowStages ?? []).map((s) => [s.id, s])),
      stageCount: catalogue?.workflowStages.length ?? 0,
    }),
    [catalogue],
  );

  /**
   * The editor's sections: the sidebar-shaped layout, plus a trailing block for
   * any catalogue id the layout does not mention. Without that fallback, adding a
   * permission to permissionCatalogue.ts and forgetting to place it in
   * rolePermissionLayout.ts would make it ungrantable with no error anywhere.
   */
  const sections = useMemo<SectionSpec[]>(() => {
    if (!catalogue) return [];
    const missing = unmappedIds(
      catalogue.permissions.map((p) => p.id),
      catalogue.modules.map((m) => m.id),
    );
    if (missing.actions.length === 0 && missing.modules.length === 0) return ROLE_LAYOUT;

    const screens: ScreenSpec[] = [
      ...(missing.actions.length ? [{ label: 'Actions', actions: missing.actions }] : []),
      ...missing.modules.map((id) => ({ module: id })),
    ];
    return [
      ...ROLE_LAYOUT,
      {
        title: 'Not yet grouped',
        note:
          'New in the catalogue and not yet placed in the sidebar layout. Still grantable — it just needs a home in rolePermissionLayout.ts.',
        screens,
      },
    ];
  }, [catalogue]);

  /**
   * Search matches a role's NAME and everything it GRANTS, so "publish" finds
   * every role that can publish — the question an admin actually arrives with.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => haystack(r, lookups).includes(q));
  }, [roles, query, lookups]);

  if (!canManageRoles) {
    return (
      <EmptyState
        icon={Lock}
        heading="Permission required"
        description="You need the “Manage roles” permission to create roles and choose what they can do."
      />
    );
  }

  /** Unsaved ticks or identity edits that Cancel would throw away. */
  const isDirty = (): boolean => {
    if (editingSlug === null) return false;
    if (editingSlug === '') {
      return (
        draft.label.trim() !== '' ||
        draft.permissions.length > 0 ||
        draft.modules.length > 0 ||
        draft.workflowStages.length > 0
      );
    }
    const saved = roles.find((r) => r.slug === editingSlug);
    if (!saved) return false;
    const same = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join() === [...b].sort().join();
    return (
      draft.label !== saved.label ||
      (draft.description ?? '') !== (saved.description ?? '') ||
      draft.color !== (saved.color ?? ROLE_COLOR_CHOICES[0]) ||
      draft.icon !== (saved.icon ?? 'Shield') ||
      !same(draft.permissions, saved.permissions) ||
      !same(draft.modules, saved.modules) ||
      !same(draft.workflowStages, saved.workflowStages)
    );
  };

  const startNew = () => {
    setEditingSlug('');
    setOpenSlug(null);
    setDraft(emptyDraft());
  };
  const startEdit = (role: Role) => {
    setEditingSlug(role.slug);
    setOpenSlug(role.slug); // editing implies open
    setDraft(draftFrom(role));
  };
  const closeEditor = () => {
    setEditingSlug(null);
    setDraft(emptyDraft());
  };

  /**
   * Cancel confirms when there is work to lose. The old screen discarded up to
   * 67 checkboxes of configuration on a single stray click, silently.
   */
  const cancelEditor = () => {
    if (isDirty() && !window.confirm('Discard your unsaved changes to this role?')) return;
    closeEditor();
  };

  const toggleOpen = (slug: string) => {
    // A row being edited must not collapse out from under the editor.
    if (editingSlug === slug) return;
    setOpenSlug((s) => (s === slug ? null : slug));
  };

  /** Copy another role's three tick-sets as a starting point. */
  const cloneFrom = (slug: string) => {
    const src = roles.find((r) => r.slug === slug);
    if (!src) return;
    setDraft((d) => ({
      ...d,
      permissions: [...src.permissions],
      modules: [...src.modules],
      workflowStages: [...src.workflowStages],
    }));
    toast.success(`Copied ${src.label}'s access.`);
  };

  const onSave = async () => {
    if (!draft.label.trim()) {
      toast.error('Give the role a name.');
      return;
    }
    setBusy(true);
    const r = editingSlug ? await updateRole(editingSlug, draft) : await createRole(draft);
    setBusy(false);
    if (r.ok) {
      toast.success(editingSlug ? 'Role updated.' : 'Role created.');
      // Leave the row they just saved open so the result is visible.
      setOpenSlug(editingSlug || r.slug || null);
      closeEditor();
    } else toast.error(r.error ?? 'Could not save the role.');
  };

  const confirmDelete = async () => {
    const role = deleteTarget;
    if (!role) return;
    setBusy(true);
    const r = await deleteRole(role.slug);
    setBusy(false);
    if (r.ok) {
      toast.success('Role deleted.');
      setDeleteTarget(null);
      if (editingSlug === role.slug) closeEditor();
      if (openSlug === role.slug) setOpenSlug(null);
    } else toast.error(r.error ?? 'Could not delete the role.');
  };

  const rowProps = {
    l: lookups,
    sections,
    draft,
    setDraft,
    busy,
    onCancel: cancelEditor,
    onSave,
    onCloneFrom: cloneFrom,
  };

  const held = deleteTarget?.assigneeCount ?? 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Every role on the platform. Open one to see exactly what it grants, then assign it from{' '}
          <span className="font-medium text-foreground">Team Members</span>.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles or permissions…"
              aria-label="Search roles or permissions"
              className="h-9 w-56 pl-8 pr-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {editingSlug === null && (
            <Button size="sm" onClick={startNew} className="gap-1.5">
              <Plus size={14} /> New role
            </Button>
          )}
        </div>
      </div>

      {/* New-role row, composed at the top */}
      {editingSlug === '' && (
        <RoleRow
          {...rowProps}
          role={null}
          open
          editing
          editingElsewhere={false}
          otherRoles={roles}
          onToggleOpen={() => {}}
          onStartEdit={() => {}}
          onDelete={() => {}}
        />
      )}

      {loading && !loaded ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading roles…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          heading="No roles match that search."
          description="Search covers role names and everything a role grants — try “publish”, “blog” or “analytics”."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((role) => (
            <RoleRow
              {...rowProps}
              key={role.slug}
              role={role}
              // A search that matched what a role GRANTS is only useful if you can
              // see the match, so a filtered list opens its results.
              open={query.trim() !== '' || openSlug === role.slug || editingSlug === role.slug}
              editing={editingSlug === role.slug}
              editingElsewhere={editingSlug !== null && editingSlug !== role.slug}
              otherRoles={roles.filter((r) => r.slug !== role.slug)}
              onToggleOpen={() => toggleOpen(role.slug)}
              onStartEdit={() => startEdit(role)}
              onDelete={() => setDeleteTarget(role)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation — was `window.confirm`, the one destructive action
          in the console using a browser dialog while the rest of the app has this. */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o && !busy) setDeleteTarget(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this role?</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  “<span className="font-semibold text-foreground">{deleteTarget.label}</span>” will
                  be removed permanently.
                  {held > 0 ? (
                    <>
                      {' '}
                      <span className="font-semibold text-foreground">
                        {held} team member{held !== 1 ? 's' : ''}
                      </span>{' '}
                      currently hold{held === 1 ? 's' : ''} it and will be left with no role, which
                      removes their newsroom access until you assign them another.
                    </>
                  ) : (
                    ' Nobody holds it.'
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
