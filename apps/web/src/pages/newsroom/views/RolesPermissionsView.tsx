import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Lock, Pencil, Plus, Save, Shield, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/EmptyState';
import { useRoleStore, type Role, type RoleDraft, type ScreenMeta, type Verb } from '@/stores/roleStore';
import { ROLE_ICON_NAMES, roleIcon } from '@/lib/roleDisplay';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Roles & Permissions — ONE GRID.
//
// Left column: every screen in the sidebar, in sidebar order. Right: the same
// five columns all the way down, so the grid reads across AND down.
//
// WHAT THIS REPLACED. The screen used to render three separate checkbox lists —
// 38 permissions, 24 modules, 5 board columns = 67 decisions per role — which
// could contradict each other: a role could hold "publish" with the Workflow
// Board unticked and own a power it had no screen to use. There is one list now,
// and the module/column axes are DERIVED (see permissionCatalogue.ts).
//
// FOUR RULES MAKE IT READABLE:
//
//   1. A row shows only the verbs its screen supports. Everything else is a
//      DASH, never an unticked box — an admin is not offered a decision that
//      cannot take effect. Pipeline Map is view-only; Comments has no Create.
//
//   2. Any verb implies View, so ticking Edit ticks View and locks it. You
//      cannot act on a screen you cannot open. (The server applies the same rule
//      in normalisePermissions, so this is an explanation, not the enforcement.)
//
//   3. SCOPE, not a second permission. Own/All appears only on rows whose
//      records have an author, and only once the row grants something. This is
//      what replaced the `edit_own` / `edit_any` pairs.
//
//   4. Four interactions and no more: a checkbox, a row label (whole row), a
//      section header cell (that verb down the section), or a preset.
// ---------------------------------------------------------------------------

interface RolesPermissionsViewProps {
  canManageRoles: boolean;
}

const VERB_LABEL: Record<Verb, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  publish: 'Publish',
};

/**
 * Verbs that hand over control of the newsroom itself. Ticking one gets a
 * warning in the save dialog — not a block, because a superadmin legitimately
 * grants these; the point is that it should never happen by accident.
 */
const DANGEROUS = new Set(['roles.create', 'roles.edit', 'roles.delete', 'team.edit', 'team.delete']);

const pid = (screen: string, verb: Verb) => `${screen}.${verb}`;

const emptyDraft = (): RoleDraft => ({
  label: '',
  description: '',
  color: 'hsl(var(--primary))',
  icon: 'Shield',
  permissions: [],
  scopes: {},
});

const draftFrom = (role: Role): RoleDraft => ({
  label: role.label,
  description: role.description ?? '',
  color: role.color ?? 'hsl(var(--primary))',
  icon: role.icon ?? 'Shield',
  permissions: [...role.permissions],
  scopes: { ...role.scopes },
});

/**
 * Rule 2, applied as the user clicks: granting anything grants View; removing
 * View removes the rest of that row. Mirrors `normalisePermissions` server-side.
 */
function withImpliedView(ids: string[]): string[] {
  const out = new Set(ids);
  for (const id of ids) out.add(`${id.slice(0, id.lastIndexOf('.'))}.view`);
  return [...out];
}

/** A one-sentence summary of a role, so nobody reads 55 boxes to know what it is. */
function describeRole(role: Pick<Role, 'permissions'>, screens: ScreenMeta[]): string {
  const held = new Set(role.permissions);
  const seen = screens.filter((s) => held.has(pid(s.id, 'view'))).length;
  const publishes = screens
    .filter((s) => s.verbs.includes('publish') && held.has(pid(s.id, 'publish')))
    .map((s) => s.label);
  const bits = [`Sees ${seen} of ${screens.length} screens`];
  if (publishes.length) bits.push(`publishes ${publishes.join(', ')}`);
  else bits.push('cannot publish');
  return bits.join(' · ');
}

// ── The grid ────────────────────────────────────────────────────────────────

function Grid({
  screens,
  verbs,
  draft,
  onChange,
  readOnly,
}: {
  screens: ScreenMeta[];
  verbs: Verb[];
  draft: RoleDraft;
  onChange: (next: RoleDraft) => void;
  readOnly: boolean;
}) {
  const held = useMemo(() => new Set(draft.permissions), [draft.permissions]);

  const setPermissions = (ids: string[]) => onChange({ ...draft, permissions: withImpliedView(ids) });

  const toggleOne = (screen: ScreenMeta, verb: Verb) => {
    if (readOnly) return;
    const id = pid(screen.id, verb);
    if (held.has(id)) {
      // Removing View takes the whole row with it — rule 2 in reverse.
      const drop = verb === 'view' ? screen.verbs.map((v) => pid(screen.id, v)) : [id];
      setPermissions(draft.permissions.filter((p) => !drop.includes(p)));
    } else {
      setPermissions([...draft.permissions, id]);
    }
  };

  const toggleRow = (screen: ScreenMeta) => {
    if (readOnly) return;
    const all = screen.verbs.map((v) => pid(screen.id, v));
    const complete = all.every((id) => held.has(id));
    setPermissions(complete ? draft.permissions.filter((p) => !all.includes(p)) : [...draft.permissions, ...all]);
  };

  const toggleSection = (section: string, verb: Verb) => {
    if (readOnly) return;
    const rows = screens.filter((s) => s.section === section && s.verbs.includes(verb));
    const ids = rows.map((s) => pid(s.id, verb));
    const complete = ids.every((id) => held.has(id));
    setPermissions(complete ? draft.permissions.filter((p) => !ids.includes(p)) : [...draft.permissions, ...ids]);
  };

  const setScope = (screenId: string, scope: 'own' | 'all') =>
    onChange({ ...draft, scopes: { ...draft.scopes, [screenId]: scope } });

  const sections = [...new Set(screens.map((s) => s.section))];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Screen
            </th>
            {verbs.map((v) => (
              <th
                key={v}
                className="w-[76px] py-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                {VERB_LABEL[v]}
              </th>
            ))}
            <th className="w-[104px] py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Applies to
            </th>
          </tr>
        </thead>

        {sections.map((section) => {
          const rows = screens.filter((s) => s.section === section);
          return (
            <tbody key={section}>
              <tr className="bg-muted/40">
                <td className="py-1.5 pr-3 text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/70">
                  {section}
                </td>
                {verbs.map((v) => {
                  const applicable = rows.filter((s) => s.verbs.includes(v));
                  const complete =
                    applicable.length > 0 && applicable.every((s) => held.has(pid(s.id, v)));
                  return (
                    <td key={v} className="py-1.5 text-center">
                      {applicable.length > 0 && (
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => toggleSection(section, v)}
                          title={`${complete ? 'Clear' : 'Grant'} ${VERB_LABEL[v]} for every ${section} screen`}
                          className={
                            'h-4 w-4 rounded-[3px] border align-middle transition-colors disabled:opacity-40 ' +
                            (complete ? 'border-primary bg-primary' : 'border-muted-foreground/40 hover:border-primary')
                          }
                        />
                      )}
                    </td>
                  );
                })}
                <td />
              </tr>

              {rows.map((screen) => {
                const rowIds = screen.verbs.map((v) => pid(screen.id, v));
                const grants = rowIds.some((id) => held.has(id));
                return (
                  <tr key={screen.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-1.5 pr-3">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => toggleRow(screen)}
                        title={screen.description}
                        className="text-left disabled:cursor-default"
                      >
                        <span className="font-medium text-foreground">{screen.label}</span>
                        {screen.lensOver && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            — actions use {screen.lensOver}
                          </span>
                        )}
                      </button>
                    </td>

                    {verbs.map((v) => {
                      if (!screen.verbs.includes(v)) {
                        return (
                          <td key={v} className="py-1.5 text-center text-muted-foreground/30" aria-hidden>
                            –
                          </td>
                        );
                      }
                      const id = pid(screen.id, v);
                      const on = held.has(id);
                      // Rule 2: View is implied by anything else, so it is shown
                      // ticked and locked rather than silently un-clickable.
                      const lockedView = v === 'view' && rowIds.some((x) => x !== id && held.has(x));
                      return (
                        <td key={v} className="py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={readOnly}
                            onChange={() => (lockedView ? toggleRow(screen) : toggleOne(screen, v))}
                            aria-label={`${VERB_LABEL[v]} — ${screen.label}`}
                            title={
                              lockedView
                                ? 'Needed by the other permissions on this row. Clearing it clears the row.'
                                : DANGEROUS.has(id)
                                  ? 'Hands over control of the newsroom itself.'
                                  : undefined
                            }
                            className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))] disabled:cursor-default"
                          />
                        </td>
                      );
                    })}

                    <td className="py-1.5 text-right">
                      {screen.scoped && grants ? (
                        <div className="inline-flex overflow-hidden rounded-sm border border-border">
                          {(['own', 'all'] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={readOnly}
                              onClick={() => setScope(screen.id, s)}
                              className={
                                'px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50 ' +
                                ((draft.scopes[screen.id] ?? 'own') === s
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:bg-muted')
                              }
                            >
                              {s === 'own' ? 'Own' : 'Everyone'}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/30" aria-hidden>
                          –
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

// ── The screen ──────────────────────────────────────────────────────────────

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

  /** The role being read or edited. Null until one is chosen. */
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoleDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);

  useEffect(() => {
    void fetchCatalogue();
    void fetchRoles();
  }, [fetchCatalogue, fetchRoles]);

  const screens = catalogue?.screens ?? [];
  const verbs = catalogue?.verbs ?? (['view', 'create', 'edit', 'delete', 'publish'] as Verb[]);

  const current = roles.find((r) => r.name === selected) ?? null;
  const editing = draft !== null;
  const readOnly = !canManageRoles || !editing || (!!current && current.isImmutable);

  const startEdit = (role: Role) => {
    setSelected(role.name);
    setDraft(role.isImmutable ? null : draftFrom(role));
    setCreating(false);
  };

  const startCreate = () => {
    setSelected(null);
    setDraft(emptyDraft());
    setCreating(true);
  };

  const cancel = () => {
    setDraft(null);
    setCreating(false);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.label.trim()) {
      toast.error('Give the role a name.');
      return;
    }
    setSaving(true);
    const res = creating ? await createRole(draft) : await updateRole(selected!, draft);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? 'Could not save the role.');
      return;
    }
    toast.success(creating ? `Created “${draft.label}”.` : `Saved “${draft.label}”.`);
    if (creating && res.name) setSelected(res.name);
    setDraft(null);
    setCreating(false);
  };

  const remove = async (role: Role) => {
    setConfirmDelete(null);
    const res = await deleteRole(role.name);
    if (!res.ok) {
      toast.error(res.error ?? 'Could not delete the role.');
      return;
    }
    toast.success(`Deleted “${role.label}”.`);
    if (selected === role.name) {
      setSelected(null);
      setDraft(null);
    }
  };

  if (loading && !loaded) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 size={18} className="mr-2 animate-spin" /> Loading roles…
      </div>
    );
  }

  if (loaded && roles.length === 0) {
    return <EmptyState icon={Shield} heading="No roles yet" description="Create a role to get started." />;
  }

  const shown = draft ?? (current ? draftFrom(current) : null);

  return (
    <div className="space-y-4">
      {/* Role list */}
      <div className="flex flex-wrap items-center gap-2">
        {roles.map((role) => {
          const active = selected === role.name;
          return (
            <button
              key={role.name}
              type="button"
              onClick={() => startEdit(role)}
              className={
                'flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ' +
                (active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')
              }
            >
              <span style={{ color: role.color || 'inherit' }}>{roleIcon(role.icon, 13)}</span>
              {role.label}
              {role.isImmutable && <Lock size={11} className="text-muted-foreground" />}
              {typeof role.assigneeCount === 'number' && role.assigneeCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Users size={10} />
                  {role.assigneeCount}
                </span>
              )}
            </button>
          );
        })}
        {canManageRoles && (
          <Button size="sm" variant="outline" onClick={startCreate} className="gap-1.5">
            <Plus size={13} /> New role
          </Button>
        )}
      </div>

      {!shown && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Pick a role to see exactly what it can do.
        </p>
      )}

      {shown && (
        <div className="rounded-sm border border-border">
          {/* Header: what this role IS, in a sentence */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-foreground">
                  {shown.label || (creating ? 'New role' : '')}
                </p>
                {current?.isImmutable && (
                  <span className="flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    <Lock size={10} /> Cannot be edited
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{describeRole(shown, screens)}</p>
            </div>

            {canManageRoles && !current?.isImmutable && (
              <div className="flex items-center gap-1.5">
                {editing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={cancel} className="gap-1">
                      <X size={13} /> Cancel
                    </Button>
                    <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1">
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                    </Button>
                  </>
                ) : (
                  current && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => startEdit(current)} className="gap-1">
                        <Pencil size={13} /> Edit
                      </Button>
                      {!current.isSystem && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete(current)}
                          className="gap-1 text-destructive hover:text-destructive"
                        >
                          <Trash2 size={13} /> Delete
                        </Button>
                      )}
                    </>
                  )
                )}
              </div>
            )}
          </div>

          {/* Name / description, only while editing */}
          {editing && (
            <div className="grid gap-3 border-b border-border px-3 py-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="role-label" className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Role name
                </Label>
                <Input
                  id="role-label"
                  value={draft!.label}
                  onChange={(e) => setDraft({ ...draft!, label: e.target.value })}
                  placeholder="Sub-editor"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role-desc" className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  What it is for
                </Label>
                <Textarea
                  id="role-desc"
                  rows={1}
                  value={draft!.description ?? ''}
                  onChange={(e) => setDraft({ ...draft!, description: e.target.value })}
                  placeholder="Checks copy and schedules it"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Icon</Label>
                <div className="flex flex-wrap gap-1">
                  {ROLE_ICON_NAMES.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setDraft({ ...draft!, icon: name })}
                        aria-label={name}
                        className={
                          'flex h-7 w-7 items-center justify-center rounded-sm border transition-colors ' +
                          (draft!.icon === name ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')
                        }
                      >
                        {roleIcon(name, 13)}
                      </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="px-3 py-2">
            <Grid
              screens={screens}
              verbs={verbs}
              draft={shown}
              onChange={(next) => setDraft(next)}
              readOnly={readOnly}
            />
          </div>

          {editing && shown.permissions.some((p) => DANGEROUS.has(p)) && (
            <div className="flex items-start gap-2 border-t border-border bg-amber-500/10 px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
              <p className="text-[11px] text-foreground/80">
                This role can change who works here and what they may do. Anyone holding it can grant
                themselves anything you can grant.
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{confirmDelete?.label}”?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.assigneeCount
                ? `${confirmDelete.assigneeCount} person(s) hold this role and will lose their access until an admin gives them another one.`
                : 'Nobody holds this role. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && void remove(confirmDelete)}
              className="gap-1"
            >
              <Trash2 size={13} /> Delete it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
