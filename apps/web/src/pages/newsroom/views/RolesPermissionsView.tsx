import { useEffect, useMemo, useState } from 'react';
import { Lock, Plus, Save, Shield, Trash2, Users, Loader2, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/EmptyState';
import { useRoleStore, type CustomRole, type RoleDraft } from '@/stores/roleStore';
import { toast } from 'sonner';

const ROLE_COLOR_CHOICES = ['#7c3aed', '#0ea5e9', '#059669', '#d97706', '#dc2626', '#475569'];

const emptyDraft = (): RoleDraft => ({
  label: '',
  description: '',
  color: ROLE_COLOR_CHOICES[0],
  permissions: [],
  modules: [],
});

const draftFrom = (role: CustomRole): RoleDraft => ({
  label: role.label,
  description: role.description ?? '',
  color: role.color ?? ROLE_COLOR_CHOICES[0],
  permissions: [...role.permissions],
  modules: [...role.modules],
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

interface CheckRowProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}

function CheckRow({ checked, onChange, label, hint }: CheckRowProps) {
  return (
    <label className="flex items-start gap-2.5 py-1.5 px-2 rounded-sm hover:bg-muted/40 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-[3px] border-input accent-[hsl(var(--primary))] cursor-pointer"
      />
      <span className="min-w-0">
        <span className="block text-sm text-foreground leading-tight">{label}</span>
        {hint && <span className="block text-[12px] text-muted-foreground/70 leading-tight mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

interface CheckGroupProps {
  title: string;
  ids: string[];
  selected: string[];
  onToggleAll: (ids: string[], next: boolean) => void;
  children: React.ReactNode;
}

function CheckGroup({ title, ids, selected, onToggleAll, children }: CheckGroupProps) {
  const chosen = ids.filter((id) => selected.includes(id)).length;
  const all = chosen === ids.length && ids.length > 0;
  return (
    <div className="border border-border/60 rounded-sm bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
        <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
          {title} <span className="text-muted-foreground/50 font-medium">{chosen}/{ids.length}</span>
        </p>
        <button
          type="button"
          onClick={() => onToggleAll(ids, !all)}
          className="text-[12px] font-semibold text-primary hover:underline"
        >
          {all ? 'Clear' : 'Select all'}
        </button>
      </div>
      <div className="p-1.5">{children}</div>
    </div>
  );
}

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

  /** null = nothing open, '' = composing a new role, otherwise the role id. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManageRoles) return;
    void fetchCatalogue();
    void fetchRoles();
  }, [canManageRoles, fetchCatalogue, fetchRoles]);

  const moduleGroups = useMemo(
    () => groupBy(catalogue?.modules ?? [], (m) => m.section),
    [catalogue],
  );
  const permissionGroups = useMemo(
    () => groupBy(catalogue?.permissions ?? [], (p) => p.group),
    [catalogue],
  );

  if (!canManageRoles) {
    return (
      <EmptyState
        icon={Lock}
        heading="Administrator access required"
        description="Only administrators can create roles and choose which modules and permissions they carry."
      />
    );
  }

  const startNew = () => {
    setEditingId('');
    setDraft(emptyDraft());
  };

  const startEdit = (role: CustomRole) => {
    setEditingId(role.id);
    setDraft(draftFrom(role));
  };

  const closeEditor = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const cloneFromPreset = (key: string) => {
    const preset = catalogue?.builtinRoles.find((b) => b.key === key);
    if (!preset) return;
    setDraft((d) => ({ ...d, permissions: [...preset.permissions], modules: [...preset.modules] }));
    toast.success(`Copied the ${preset.label} preset into this role.`);
  };

  const toggle = (field: 'permissions' | 'modules', id: string) =>
    setDraft((d) => ({
      ...d,
      [field]: d[field].includes(id) ? d[field].filter((x) => x !== id) : [...d[field], id],
    }));

  const toggleAll = (field: 'permissions' | 'modules') => (ids: string[], next: boolean) =>
    setDraft((d) => ({
      ...d,
      [field]: next
        ? [...new Set([...d[field], ...ids])]
        : d[field].filter((x) => !ids.includes(x)),
    }));

  const onSave = async () => {
    if (!draft.label.trim()) {
      toast.error('Give the role a name.');
      return;
    }
    setBusy(true);
    const r = editingId ? await updateRole(editingId, draft) : await createRole(draft);
    setBusy(false);
    if (r.ok) {
      toast.success(editingId ? 'Role updated.' : 'Role created.');
      closeEditor();
    } else toast.error(r.error ?? 'Could not save the role.');
  };

  const onDelete = async (role: CustomRole) => {
    const held = role.assigneeCount ?? 0;
    const warning = held > 0
      ? `Delete "${role.label}"? It will be removed from ${held} team member${held !== 1 ? 's' : ''}.`
      : `Delete "${role.label}"?`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    const r = await deleteRole(role.id);
    setBusy(false);
    if (r.ok) {
      toast.success('Role deleted.');
      if (editingId === role.id) closeEditor();
    } else toast.error(r.error ?? 'Could not delete the role.');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[12px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
            Roles &amp; Permissions
          </p>
          <p className="text-sm text-muted-foreground max-w-xl">
            Create a role, tick the modules it can open and the actions it may perform, then assign
            it to team members from <span className="font-medium text-foreground">Team Members</span>.
          </p>
        </div>
        {editingId === null && (
          <Button size="sm" onClick={startNew} className="gap-1.5">
            <Plus size={14} /> New role
          </Button>
        )}
      </div>

      {/* Built-in presets — reference only */}
      {catalogue && (
        <div className="border border-border/60 rounded-sm bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Built-in roles ({catalogue.builtinRoles.length}) · not editable
            </p>
          </div>
          <ul className="divide-y divide-border/40">
            {catalogue.builtinRoles.map((b) => (
              <li key={b.key} className="flex items-center gap-3 px-4 py-2.5">
                <Shield size={13} className="text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-sm font-medium text-foreground">{b.label}</span>
                <span className="text-[12px] text-muted-foreground">
                  {b.permissions.length} permissions · {b.modules.length} modules
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Editor */}
      {editingId !== null && (
        <div className="border border-primary/40 rounded-sm bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-primary">
              {editingId ? 'Edit role' : 'New role'}
            </p>
            <button
              onClick={closeEditor}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close editor"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
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
                      'w-6 h-6 rounded-full border-2 transition-transform ' +
                      (draft.color === c ? 'scale-110 border-foreground' : 'border-transparent')
                    }
                    style={{ background: c }}
                  />
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

          {/* Start from a preset */}
          {catalogue && catalogue.builtinRoles.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold flex items-center gap-1.5">
                <Copy size={12} /> Start from
              </span>
              {catalogue.builtinRoles.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => cloneFromPreset(b.key)}
                  className="text-[12px] px-2 py-1 rounded-full border border-input text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}

          {/* Modules */}
          <div className="space-y-2">
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-foreground">
              Modules this role can open
              <span className="ml-2 font-medium text-muted-foreground/60">
                {draft.modules.length} selected
              </span>
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {moduleGroups.map(([section, mods]) => (
                <CheckGroup
                  key={section}
                  title={section}
                  ids={mods.map((m) => m.id)}
                  selected={draft.modules}
                  onToggleAll={toggleAll('modules')}
                >
                  {mods.map((m) => (
                    <CheckRow
                      key={m.id}
                      checked={draft.modules.includes(m.id)}
                      onChange={() => toggle('modules', m.id)}
                      label={m.label}
                    />
                  ))}
                </CheckGroup>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div className="space-y-2">
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-foreground">
              Permissions
              <span className="ml-2 font-medium text-muted-foreground/60">
                {draft.permissions.length} selected
              </span>
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {permissionGroups.map(([group, perms]) => (
                <CheckGroup
                  key={group}
                  title={group}
                  ids={perms.map((p) => p.id)}
                  selected={draft.permissions}
                  onToggleAll={toggleAll('permissions')}
                >
                  {perms.map((p) => (
                    <CheckRow
                      key={p.id}
                      checked={draft.permissions.includes(p.id)}
                      onChange={() => toggle('permissions', p.id)}
                      label={p.label}
                      hint={p.description}
                    />
                  ))}
                </CheckGroup>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={onSave} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editingId ? 'Save changes' : 'Create role'}
            </Button>
            <Button size="sm" variant="outline" onClick={closeEditor} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Custom role list */}
      {loading && !loaded ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading roles…</p>
      ) : roles.length === 0 ? (
        <EmptyState
          icon={Shield}
          heading="No custom roles yet."
          description="Create a role to give a team member a tailored set of modules and permissions on top of their staff role."
        />
      ) : (
        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Custom roles ({roles.length})
            </p>
          </div>
          <ul className="divide-y divide-border/40">
            {roles.map((role) => (
              <li key={role.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: role.color ?? 'hsl(var(--muted-foreground))' }}
                />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground truncate">{role.label}</span>
                  <span className="block text-[12px] text-muted-foreground truncate">
                    {role.permissions.length} permissions · {role.modules.length} modules
                    {role.description ? ` · ${role.description}` : ''}
                  </span>
                </div>
                <span className="text-[12px] text-muted-foreground flex items-center gap-1 flex-shrink-0">
                  <Users size={12} /> {role.assigneeCount ?? 0}
                </span>
                <Button size="sm" variant="outline" onClick={() => startEdit(role)} disabled={busy}>
                  Edit
                </Button>
                <button
                  onClick={() => onDelete(role)}
                  disabled={busy}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Delete ${role.label}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
