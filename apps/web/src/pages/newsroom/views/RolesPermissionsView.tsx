import { useEffect, useMemo, useState } from 'react';
import { Lock, Plus, Save, Shield, Trash2, Users, Loader2, Copy, X, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/EmptyState';
import { useRoleStore, type Role, type RoleDraft } from '@/stores/roleStore';
import { ROLE_ICON_NAMES, roleColor, roleIcon } from '@/lib/roleDisplay';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// One card per role, each showing its ENTIRE access at a glance as a grid of
// resource rows. "Edit permissions" flips that one card in place rather than
// opening a separate editor above the list — the previous design meant you
// could never see the role you were changing while you changed it, and the
// list only ever showed counts ("18 permissions"), so answering "what can an
// editor actually do?" required entering edit mode and reading three long
// columns of checkboxes.
//
// Rows come from the server catalogue (`permission.resource`), so adding an
// action to permissionCatalogue.ts makes a checkbox appear here with no
// frontend change.
// ---------------------------------------------------------------------------

const ROLE_COLOR_CHOICES = ['#7c3aed', '#0ea5e9', '#059669', '#d97706', '#dc2626', '#475569'];

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

type Axis = 'permissions' | 'modules' | 'workflowStages';

interface GridItem {
  id: string;
  /** Checkbox caption. */
  short: string;
  /** Tooltip — the full label plus, for actions, what it means. */
  title: string;
}

interface GridRow {
  axis: Axis;
  label: string;
  items: GridItem[];
}

// ── One resource row ─────────────────────────────────────────────────────────

function PermissionRow({
  row, selected, editing, onToggle, onToggleAll,
}: {
  row: GridRow;
  selected: string[];
  editing: boolean;
  onToggle: (axis: Axis, id: string) => void;
  onToggleAll: (axis: Axis, ids: string[], next: boolean) => void;
}) {
  const ids = row.items.map((i) => i.id);
  const chosen = ids.filter((id) => selected.includes(id)).length;
  const all = chosen === ids.length;

  return (
    <div className="flex items-start gap-4 px-3.5 py-2.5 rounded-sm bg-muted/25 hover:bg-muted/40 transition-colors">
      <span className="w-36 flex-shrink-0 text-sm font-medium text-foreground leading-6">
        {row.label}
      </span>

      <div className="flex-1 min-w-0 flex items-center gap-x-5 gap-y-1.5 flex-wrap">
        {row.items.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <label
              key={item.id}
              title={item.title}
              className={
                'inline-flex items-center gap-1.5 leading-6 ' +
                (editing ? 'cursor-pointer' : 'cursor-default') +
                (checked ? '' : ' opacity-45')
              }
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!editing}
                onChange={() => onToggle(row.axis, item.id)}
                className="h-3.5 w-3.5 rounded-[3px] border-input accent-[hsl(var(--primary))] disabled:cursor-default"
              />
              <span className="text-sm text-muted-foreground">{item.short}</span>
            </label>
          );
        })}
      </div>

      {editing && ids.length > 1 && (
        <button
          type="button"
          onClick={() => onToggleAll(row.axis, ids, !all)}
          className="flex-shrink-0 text-[12px] font-semibold text-primary hover:underline leading-6"
        >
          {all ? 'None' : 'All'}
        </button>
      )}
    </div>
  );
}

// ── One role card ────────────────────────────────────────────────────────────

function RoleCard({
  role, rows, editing, locked, draft, setDraft, busy, otherRoles,
  onStartEdit, onCancel, onSave, onDelete, onCloneFrom,
}: {
  /** null while composing a brand-new role. */
  role: Role | null;
  rows: GridRow[];
  editing: boolean;
  /** Another card is mid-edit — don't offer an Edit button that would discard it. */
  locked: boolean;
  draft: RoleDraft;
  setDraft: React.Dispatch<React.SetStateAction<RoleDraft>>;
  busy: boolean;
  otherRoles: Role[];
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onCloneFrom: (slug: string) => void;
}) {
  // While editing, the grid reflects the unsaved draft; otherwise the saved role.
  const selectedFor = (axis: Axis): string[] =>
    editing ? draft[axis] : role ? role[axis] : [];

  const toggle = (axis: Axis, id: string) =>
    setDraft((d) => ({
      ...d,
      [axis]: d[axis].includes(id) ? d[axis].filter((x) => x !== id) : [...d[axis], id],
    }));

  const toggleAll = (axis: Axis, ids: string[], next: boolean) =>
    setDraft((d) => ({
      ...d,
      [axis]: next ? [...new Set([...d[axis], ...ids])] : d[axis].filter((x) => !ids.includes(x)),
    }));

  const color = role ? roleColor(role) : draft.color;
  const assignees = role?.assigneeCount ?? 0;
  const granted = (role ? role.permissions.length : draft.permissions.length)
    + (role ? role.modules.length : draft.modules.length);

  return (
    <section
      className={
        'rounded-sm bg-card border transition-colors ' +
        (editing ? 'border-primary/50' : 'border-border/60')
      }
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap px-4 pt-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ color }} className="flex-shrink-0">
              {roleIcon(editing ? draft.icon : role?.icon, 16)}
            </span>
            <h3 className="text-[17px] font-semibold text-foreground truncate">
              {editing ? draft.label || 'New role' : role?.label}
            </h3>
            {role?.isImmutable ? (
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                <Lock size={9} /> System
              </span>
            ) : role?.isSystem ? (
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                <Shield size={9} /> Built-in
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {(editing ? draft.description : role?.description) || 'No description.'}
            {role && (
              <>
                {' · '}
                <span className="inline-flex items-center gap-1 align-middle">
                  <Users size={12} /> {assignees} user{assignees !== 1 ? 's' : ''}
                </span>
              </>
            )}
            {' · '}
            {granted} granted
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
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
            <span className="text-[12px] text-muted-foreground flex items-center gap-1.5">
              <Lock size={12} /> Always has full access
            </span>
          ) : locked ? null : (
            <>
              <Button size="sm" variant="outline" onClick={onStartEdit} disabled={busy} className="gap-1.5">
                <Pencil size={13} /> Edit permissions
              </Button>
              {role && !role.isSystem && (
                <button
                  onClick={onDelete}
                  disabled={busy}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  aria-label={`Delete ${role.label}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Identity fields — only while editing */}
      {editing && (
        <div className="px-4 pb-3 space-y-3 border-b border-border/40">
          <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-start">
            <div className="space-y-1.5">
              <Label className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
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
              <Label className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
                Colour
              </Label>
              <div className="flex items-center gap-1.5 h-9">
                {ROLE_COLOR_CHOICES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, color: c }))}
                    aria-label={`Colour ${c}`}
                    className={
                      'w-5 h-5 rounded-full border-2 transition-transform ' +
                      (draft.color === c ? 'scale-110 border-foreground' : 'border-transparent')
                    }
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
                Icon
              </Label>
              <div className="flex items-center gap-0.5 flex-wrap max-w-[280px]">
                {ROLE_ICON_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, icon: name }))}
                    aria-label={name}
                    className={
                      'p-1 rounded-sm border transition-colors ' +
                      (draft.icon === name
                        ? 'border-primary text-primary bg-primary/10'
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
            <Label className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold flex items-center gap-1.5">
                <Copy size={12} /> Start from
              </span>
              {otherRoles.map((r) => (
                <button
                  key={r.slug}
                  type="button"
                  onClick={() => onCloneFrom(r.slug)}
                  className="text-[12px] px-2 py-1 rounded-full border border-input text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
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
        </div>
      )}

      {/* The grid */}
      <div className="p-3 space-y-1.5">
        {role?.isImmutable ? (
          <p className="text-sm text-muted-foreground px-1 py-2">
            The superadmin role is enforced in code and always resolves to every module, action and
            workflow column — it cannot be edited or deleted, so the platform can never be locked out
            of its own roles screen.
          </p>
        ) : (
          rows.map((row) => (
            <PermissionRow
              key={`${row.axis}:${row.label}`}
              row={row}
              selected={selectedFor(row.axis)}
              editing={editing}
              onToggle={toggle}
              onToggleAll={toggleAll}
            />
          ))
        )}
      </div>
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

  /** null = nothing open, '' = composing a new role, otherwise the role SLUG. */
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManageRoles) return;
    void fetchCatalogue();
    void fetchRoles();
  }, [canManageRoles, fetchCatalogue, fetchRoles]);

  /**
   * The grid, assembled from all three axes into one uniform list of rows so a
   * card reads top to bottom as a single table. Navigation comes first (what
   * you can open), then actions (what you can do), then the board columns.
   */
  const rows = useMemo<GridRow[]>(() => {
    if (!catalogue) return [];

    const navRows: GridRow[] = groupBy(catalogue.modules, (m) => m.section).map(
      ([section, mods]) => ({
        axis: 'modules',
        label: section,
        items: mods.map((m) => ({ id: m.id, short: m.label, title: `Open ${m.label}` })),
      }),
    );

    const actionRows: GridRow[] = groupBy(catalogue.permissions, (p) => p.resource).map(
      ([resource, perms]) => ({
        axis: 'permissions',
        label: resource,
        items: perms.map((p) => ({ id: p.id, short: p.short, title: `${p.label} — ${p.description}` })),
      }),
    );

    const stageRow: GridRow[] = catalogue.workflowStages.length
      ? [{
          axis: 'workflowStages',
          label: 'Board Columns',
          items: catalogue.workflowStages.map((s) => ({
            id: s.id,
            short: s.label,
            title: `See the ${s.label} column`,
          })),
        }]
      : [];

    return [...navRows, ...actionRows, ...stageRow];
  }, [catalogue]);

  if (!canManageRoles) {
    return (
      <EmptyState
        icon={Lock}
        heading="Permission required"
        description="You need the “Manage roles” permission to create roles and choose what they can do."
      />
    );
  }

  const startNew = () => { setEditingSlug(''); setDraft(emptyDraft()); };
  const startEdit = (role: Role) => { setEditingSlug(role.slug); setDraft(draftFrom(role)); };
  const closeEditor = () => { setEditingSlug(null); setDraft(emptyDraft()); };

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
      closeEditor();
    } else toast.error(r.error ?? 'Could not save the role.');
  };

  const onDelete = async (role: Role) => {
    const held = role.assigneeCount ?? 0;
    const warning = held > 0
      ? `Delete "${role.label}"? It will be removed from ${held} team member${held !== 1 ? 's' : ''}.`
      : `Delete "${role.label}"?`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    const r = await deleteRole(role.slug);
    setBusy(false);
    if (r.ok) {
      toast.success('Role deleted.');
      if (editingSlug === role.slug) closeEditor();
    } else toast.error(r.error ?? 'Could not delete the role.');
  };

  const cardProps = {
    rows, draft, setDraft, busy,
    onCancel: closeEditor,
    onSave,
    onCloneFrom: cloneFrom,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[12px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
            Roles &amp; Permissions
          </p>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Every role on the platform lives here, with everything it grants shown up front. Edit a
            role to change it, then assign it from{' '}
            <span className="font-medium text-foreground">Team Members</span>.
          </p>
        </div>
        {editingSlug === null && (
          <Button size="sm" onClick={startNew} className="gap-1.5">
            <Plus size={14} /> New role
          </Button>
        )}
      </div>

      {/* New-role card, composed at the top */}
      {editingSlug === '' && (
        <RoleCard
          {...cardProps}
          role={null}
          editing
          locked={false}
          otherRoles={roles}
          onStartEdit={() => {}}
          onDelete={() => {}}
        />
      )}

      {loading && !loaded ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading roles…</p>
      ) : roles.length === 0 && editingSlug === null ? (
        <EmptyState
          icon={Shield}
          heading="No roles defined yet."
          description="Create a role to control what a team member can open and do."
        />
      ) : (
        roles.map((role) => (
          <RoleCard
            {...cardProps}
            key={role.slug}
            role={role}
            editing={editingSlug === role.slug}
            locked={editingSlug !== null && editingSlug !== role.slug}
            otherRoles={roles.filter((r) => r.slug !== role.slug)}
            onStartEdit={() => startEdit(role)}
            onDelete={() => onDelete(role)}
          />
        ))
      )}
    </div>
  );
}
