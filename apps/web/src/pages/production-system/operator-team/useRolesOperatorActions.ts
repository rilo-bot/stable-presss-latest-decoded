// ---------------------------------------------------------------------------
// The Stable Hand Operator — ROLES pack (Production System → Roles & Permissions).
//
// Registered by RolesPermissionsView while it is mounted. Writes drive the grid
// the way a person does: click the role chip (which opens it for editing), type
// the name / description, tick or untick the screen×verb checkboxes, flip a
// row's Own / Everyone toggle, press Save — so roleStore makes the same
// /api/roles call (server-enforced `roles.*`) and the user sees every box move.
//
// Every write changes who may do what, so all of them define confirm().
// Permission ids are '<screen>.<verb>' (e.g. 'stories.edit'); `roles.catalog`
// lists the valid ones. "Module access" IS a screen's '.view' — the server
// derives a role's modules from them — so `modules: ['horses']` ticks
// 'horses.view'. Scopes (Own / Everyone) exist only on rows whose records have
// an author (`scoped` in roles.catalog), and only show once the row grants
// something.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/team.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import type { UiDriver } from '@/agent/operator/contracts';
import { useRoleStore, type Role, type RoleDraft, type ScreenMeta } from '@/stores/roleStore';
import { anchor, firstError, normKey, resolveOne, useLive, waitUntil, watchToasts } from './opUtils';
import { roleJson } from './useTeamOperatorActions';

interface RolesOperatorInput {
  canManageRoles: boolean;
  roles: Role[];
  screens: ScreenMeta[];
  selected: string | null;
  draft: RoleDraft | null;
  creating: boolean;
  saving: boolean;
}

type Scope = 'own' | 'all';

const NO_MANAGE = 'You can read roles but not change them — that needs the "Roles: create/edit/delete" permission.';
/** Mirrors DANGEROUS in RolesPermissionsView — named in the confirm card. */
const DANGEROUS = new Set(['roles.create', 'roles.edit', 'roles.delete', 'team.edit', 'team.delete']);

function resolveRole(query: string, roles: Role[]) {
  return resolveOne(query, roles, (r) => [r.name, r.label], 'role', (r) => `${r.label} (${r.name})`);
}

function resolveScreen(query: string, screens: ScreenMeta[]) {
  return resolveOne(query, screens, (s) => [s.id, s.label], 'screen', (s) => `${s.label} (${s.id})`);
}

/** Validate '<screen>.<verb>' ids against the catalogue the grid draws. */
function checkPermissions(ids: string[], screens: ScreenMeta[]): string | null {
  const bad = ids.filter((id) => {
    const dot = id.lastIndexOf('.');
    const screen = screens.find((s) => s.id === id.slice(0, dot));
    return !screen || !screen.verbs.includes(id.slice(dot + 1) as never);
  });
  if (!bad.length) return null;
  return `Unknown permission(s): ${bad.join(', ')}. Use '<screen>.<verb>' ids from roles.catalog.`;
}

const scopeArg = z.enum(['own', 'everyone', 'all']).transform((s): Scope => (s === 'own' ? 'own' : 'all'));
const scopeWord = (s: Scope) => (s === 'all' ? 'Everyone' : 'Own');

/**
 * Turn a { screen: scope } map from the model into screen ids, checking each
 * screen exists and HAS a scope toggle. `grants` = the permissions the role
 * will hold, since a toggle only shows on a row that grants something.
 */
function resolveScopes(
  raw: Record<string, Scope> | undefined,
  screens: ScreenMeta[],
  grants: string[] | null,
): { scopes: Array<[ScreenMeta, Scope]> } | { error: string } {
  const out: Array<[ScreenMeta, Scope]> = [];
  for (const [key, scope] of Object.entries(raw ?? {})) {
    const r = resolveScreen(key, screens);
    if (!r.hit) return { error: r.error };
    if (!r.hit.scoped) {
      const scoped = screens.filter((s) => s.scoped).map((s) => s.id);
      return { error: `${r.hit.label} has no Own/Everyone setting. Scoped screens: ${scoped.join(', ') || 'none'}.` };
    }
    if (grants && !grants.some((p) => p.startsWith(`${r.hit!.id}.`))) {
      return { error: `The role grants nothing on ${r.hit.label}, so it has no scope to set — grant a ${r.hit.id}.* permission first.` };
    }
    out.push([r.hit, scope]);
  }
  return { scopes: out };
}

/** `modules` (screen ids / labels) → their '.view' permission ids. */
function moduleViews(modules: string[], screens: ScreenMeta[]): { ids: string[] } | { error: string } {
  const ids: string[] = [];
  for (const m of modules) {
    const r = resolveScreen(m, screens);
    if (!r.hit) return { error: r.error };
    ids.push(`${r.hit.id}.view`);
  }
  return { ids };
}

const permBox = (id: string) => `roles.perm-${id}`;
const isTicked = (id: string) => !!(anchor(permBox(id)) as HTMLInputElement | null)?.checked;

/** Tick/untick one grid box so it ends in `want`, then wait for React. */
async function setBox(ui: UiDriver, id: string, want: boolean) {
  if (isTicked(id) === want) return;
  await ui.click(permBox(id), `${want ? 'Grant' : 'Remove'} ${id}`);
  await waitUntil(() => isTicked(id) === want, { timeoutMs: 1500, signal: ui.signal });
}

const roleDetail = (r: Role) => ({
  ...roleJson(r),
  permissions: [...r.permissions].sort(),
  modules: r.modules,
  scopes: r.scopes,
});

const scopeLine = (s: Array<[ScreenMeta, Scope]>) => s.map(([sc, v]) => `${sc.label}: ${scopeWord(v)}`).join(', ');

/** Revoking a '.view' clears its whole row in the grid — the full set of ids a
 *  revoke really removes (so the confirm card names what actually goes). */
function expandRevoke(revoke: string[], screens: ScreenMeta[]): Set<string> {
  const out = new Set(revoke);
  for (const id of revoke) {
    if (!id.endsWith('.view')) continue;
    const screen = screens.find((x) => `${x.id}.view` === id);
    for (const v of screen?.verbs ?? []) out.add(`${screen!.id}.${v}`);
  }
  return out;
}

/** Scope entries that differ from what the saved role already has. */
const changedScopes = (role: Role, scopes: Array<[ScreenMeta, Scope]>) =>
  scopes.filter(([x, v]) => ((role.scopes ?? {})[x.id] ?? 'own') !== v);

/**
 * True when the grid holds edits the user has not saved (a role being created,
 * or an open draft that differs from its saved role). Clicking a role chip
 * resets the draft, so a READ action (roles.open, no confirm card) must not
 * click while this is true — it would silently throw the user's work away.
 */
function hasUnsavedEdits(s: RolesOperatorInput): boolean {
  const d = s.draft;
  if (!d) return false;
  if (s.creating) return !!d.label.trim() || !!d.description?.trim() || d.permissions.length > 0;
  const saved = s.roles.find((r) => r.name === s.selected);
  if (!saved) return false;
  const list = (x: string[]) => [...x].sort().join('|');
  const scopes = (m: Record<string, string>) =>
    JSON.stringify(Object.entries(m).filter(([, v]) => v !== 'own').sort());
  return (
    d.label !== saved.label ||
    (d.description ?? '') !== (saved.description ?? '') ||
    (d.icon ?? 'Shield') !== (saved.icon ?? 'Shield') ||
    list(d.permissions ?? []) !== list(saved.permissions ?? []) ||
    scopes(d.scopes ?? {}) !== scopes(saved.scopes ?? {})
  );
}

export function useRolesOperatorActions(input: RolesOperatorInput): void {
  const live = useLive(input);

  /** Every write opens a role (or New role), which resets the grid — say so on
   *  the confirm card when the user has unsaved edits there. */
  const noteDiscard = (q: string): string =>
    hasUnsavedEdits(live.current) ? `${q} (Your unsaved edits on the Roles screen will be discarded.)` : q;

  /** Press Save and wait for the draft to close (success) or an error toast. */
  async function save(ui: UiDriver): Promise<void> {
    const toasts = watchToasts();
    await ui.click('roles.save', 'Save');
    const ok = await waitUntil(
      () => (!live.current.saving && live.current.draft === null) || toasts.collect().some((t) => t.type === 'error'),
      { timeoutMs: 30_000, signal: ui.signal },
    );
    const err = firstError(toasts.collect());
    if (err) throw new Error(err);
    if (!ok) throw new Error('Saving the role is taking too long — check the screen.');
  }

  /** Click the role's chip — it opens straight into an editable draft of the
   *  SAVED role (any half-made, unsaved edits on screen are dropped). */
  async function openForEdit(ui: UiDriver, role: Role): Promise<void> {
    await ui.click(`roles.role-${role.name}`, role.label);
    const opened = await waitUntil(
      () => live.current.selected === role.name && live.current.draft !== null,
      { timeoutMs: 3000, signal: ui.signal },
    );
    if (!opened) throw new Error('Could not open the role for editing.');
  }

  /** Flip a row's Own / Everyone toggle (the row must already grant something). */
  async function setScopeToggle(ui: UiDriver, screen: ScreenMeta, scope: Scope): Promise<void> {
    const id = `roles.scope-${screen.id}-${scope === 'all' ? 'everyone' : 'own'}`;
    const current = () => (live.current.draft?.scopes[screen.id] ?? 'own') as Scope;
    if (current() === scope) return;
    await waitUntil(() => anchor(id) !== null, { timeoutMs: 1500, signal: ui.signal });
    if (!anchor(id)) throw new Error(`${screen.label} shows no Own/Everyone toggle — the role must grant something on that row first.`);
    await ui.click(id, `${screen.label}: ${scopeWord(scope)}`);
    await waitUntil(() => live.current.draft?.scopes[screen.id] === scope, { timeoutMs: 1500, signal: ui.signal });
  }

  useAgentAction({
    name: 'roles.list',
    description: 'List every role (slug, label, description, assignees, permission count).',
    args: z.object({}),
    run: async () => ({ canManage: live.current.canManageRoles, roles: live.current.roles.map(roleJson) }),
  });

  useAgentAction({
    name: 'roles.catalog',
    description: "List the grantable permissions: each screen with the verbs it supports ('<screen>.<verb>').",
    args: z.object({}),
    run: async () => ({
      screens: live.current.screens.map((s) => ({
        screen: s.id,
        label: s.label,
        section: s.section,
        permissions: s.verbs.map((v) => `${s.id}.${v}`),
        ...(s.scoped ? { scoped: true } : {}),
      })),
      note:
        "Granting any verb also grants that screen's .view (= module access). Revoking .view clears the whole row. " +
        'Scoped screens take an Own/Everyone scope (default Own) once the row grants something.',
    }),
  });

  const roleArg = z.object({ role: z.string().min(1).describe('Role slug or label') });
  useAgentAction<z.infer<typeof roleArg>>({
    name: 'roles.open',
    description: 'Open a role in the grid and return its exact permissions.',
    args: roleArg,
    run: async (a, ui) => {
      const r = resolveRole(a.role, live.current.roles);
      if (!r.hit) throw new Error(r.error);
      // Clicking a chip resets the open draft — never discard unsaved edits
      // from a read. Answer from the store and leave the screen as it is.
      if (hasUnsavedEdits(live.current)) {
        return {
          ...roleDetail(r.hit),
          openedOnScreen: false,
          note: 'Not opened in the grid: the user has unsaved role edits open, and opening another role would discard them.',
        };
      }
      await ui.click(`roles.role-${r.hit.name}`, r.hit.label);
      await waitUntil(() => live.current.selected === r.hit!.name, { timeoutMs: 2000, signal: ui.signal });
      return roleDetail(r.hit);
    },
  });

  // ── Create ─────────────────────────────────────────────────────────────────
  const createArgs = z.object({
    label: z.string().trim().min(1).max(60),
    description: z.string().max(300).optional(),
    permissions: z.array(z.string()).default([]).describe("'<screen>.<verb>' ids"),
    modules: z.array(z.string()).default([]).describe('screens to open (their .view)'),
    scopes: z.record(z.string(), scopeArg).optional(),
  });
  type CreateArgs = z.infer<typeof createArgs>;

  /** The full permission list + scopes a create call asks for, or an error. */
  function plan(a: CreateArgs): { perms: string[]; scopes: Array<[ScreenMeta, Scope]> } | { error: string } {
    const s = live.current;
    const mv = moduleViews(a.modules, s.screens);
    if ('error' in mv) return mv;
    const perms = [...new Set([...a.permissions, ...mv.ids])];
    const bad = checkPermissions(perms, s.screens);
    if (bad) return { error: bad };
    const sc = resolveScopes(a.scopes, s.screens, perms);
    if ('error' in sc) return sc;
    return { perms, scopes: sc.scopes };
  }

  useAgentAction<CreateArgs>({
    name: 'roles.create',
    description: 'Create a new role: name, description, permissions, module access and Own/Everyone scopes.',
    args: createArgs,
    confirm: (a) => {
      const s = live.current;
      if (!s.canManageRoles) return null;
      const p = plan(a);
      if ('error' in p) return null;
      // A duplicate name is refused by run() — no card for an illegal move.
      if (s.roles.some((r) => normKey(r.label) === normKey(a.label))) return null;
      const danger = p.perms.filter((x) => DANGEROUS.has(x));
      return noteDiscard(
        `Create the role "${a.label}" with ${p.perms.length} permission(s)` +
        (p.perms.length ? `: ${p.perms.join(', ')}` : '') +
        (p.scopes.length ? `; scope ${scopeLine(p.scopes)}` : '') +
        (danger.length ? `. Warning: ${danger.join(', ')} lets holders change who works here.` : '') +
        '?',
      );
    },
    run: async (a, ui) => {
      const s = live.current;
      if (!s.canManageRoles) throw new Error(NO_MANAGE);
      const p = plan(a);
      if ('error' in p) throw new Error(p.error);
      if (s.roles.some((r) => normKey(r.label) === normKey(a.label))) {
        throw new Error(`A role called "${a.label}" already exists — use roles.editPermissions / roles.setScope instead.`);
      }
      ui.step(`Creating the "${a.label}" role`);
      await ui.click('roles.new', 'New role');
      await ui.waitFor('roles.label', 4000);
      await ui.type('roles.label', a.label, { clear: true });
      if (a.description) await ui.type('roles.description', a.description, { clear: true });
      // Verbs first, then the bare '.view's: ticking a verb ticks (and locks)
      // its View, and clicking a locked View would toggle the whole row.
      const order = [...p.perms].sort((x, y) => Number(x.endsWith('.view')) - Number(y.endsWith('.view')));
      for (const id of order) await setBox(ui, id, true);
      for (const [screen, scope] of p.scopes) await setScopeToggle(ui, screen, scope);
      await save(ui);
      const created = useRoleStore.getState().roles.find((r) => normKey(r.label) === normKey(a.label));
      if (!created) throw new Error('The role was saved but is not in the list yet — reload Roles & Permissions.');
      ui.flash(`roles.role-${created.name}`);
      return { ok: true, role: roleDetail(created) };
    },
  });

  // ── Edit permissions ───────────────────────────────────────────────────────
  const editArgs = z.object({
    role: z.string().min(1).describe('Role slug or label'),
    grant: z.array(z.string()).default([]).describe("'<screen>.<verb>' ids to add"),
    revoke: z.array(z.string()).default([]).describe("'<screen>.<verb>' ids to remove"),
  });
  useAgentAction<z.infer<typeof editArgs>>({
    name: 'roles.editPermissions',
    description: 'Grant and/or revoke permissions on an existing role, then save.',
    args: editArgs,
    confirm: (a) => {
      const s = live.current;
      if (!s.canManageRoles) return null;
      const r = resolveRole(a.role, s.roles);
      if (!r.hit || r.hit.isImmutable || checkPermissions([...a.grant, ...a.revoke], s.screens)) return null;
      // Name what REALLY changes: grants not yet held, and every held id the
      // revoke clears (a '.view' takes its whole row). Nothing → no card.
      const held = new Set(r.hit.permissions);
      const adds = a.grant.filter((p) => !held.has(p));
      const removes = [...expandRevoke(a.revoke, s.screens)].filter((p) => held.has(p));
      if (!adds.length && !removes.length) return null;
      const bits = [
        adds.length && `grant ${adds.join(', ')}`,
        removes.length && `revoke ${removes.join(', ')}`,
      ].filter(Boolean);
      const danger = adds.filter((p) => DANGEROUS.has(p));
      return noteDiscard(
        `Change the "${r.hit.label}" role (${r.hit.assigneeCount ?? 0} holder(s)): ${bits.join('; ')}` +
        (danger.length ? `. Warning: ${danger.join(', ')} lets holders change who works here.` : '') +
        '?',
      );
    },
    run: async (a, ui) => {
      const s = live.current;
      if (!s.canManageRoles) throw new Error(NO_MANAGE);
      const r = resolveRole(a.role, s.roles);
      if (!r.hit) throw new Error(r.error);
      if (r.hit.isImmutable) throw new Error(`"${r.hit.label}" is locked and cannot be edited.`);
      const bad = checkPermissions([...a.grant, ...a.revoke], s.screens);
      if (bad) throw new Error(bad);
      const role = r.hit;
      // A .view that other verbs on its row depend on is LOCKED: clicking it
      // toggles the whole row, which GRANTS the row when it is incomplete. So
      // revoking a .view first clears that row's other verbs, then the view.
      const revoke = expandRevoke(a.revoke, s.screens);
      // Nothing to change (confirm showed no card): don't open + re-save it.
      const held0 = new Set(role.permissions);
      if (a.grant.every((p) => held0.has(p)) && ![...revoke].some((p) => held0.has(p))) {
        return { ok: true, unchanged: true, role: roleDetail(role) };
      }

      ui.step(`Editing the "${role.label}" role`);
      await openForEdit(ui, role);

      for (const id of a.grant) await setBox(ui, id, true);
      const order = [...revoke].sort((x, y) => Number(x.endsWith('.view')) - Number(y.endsWith('.view')));
      for (const id of order) await setBox(ui, id, false);

      await save(ui);
      const after = useRoleStore.getState().roles.find((x) => x.name === role.name);
      if (!after) throw new Error('The role is no longer in the list.');
      const held = new Set(after.permissions);
      return {
        ok: true,
        role: roleDetail(after),
        notGranted: a.grant.filter((p) => !held.has(p)),
        stillHeld: a.revoke.filter((p) => held.has(p)),
      };
    },
  });

  // ── Scope (Own / Everyone) ─────────────────────────────────────────────────
  const scopeArgs = z.object({
    role: z.string().min(1).describe('Role slug or label'),
    scopes: z.record(z.string(), scopeArg).refine((m) => Object.keys(m).length > 0, 'Name at least one screen.'),
  });
  useAgentAction<z.infer<typeof scopeArgs>>({
    name: 'roles.setScope',
    description: "Set how far a role's verbs reach per screen: Own (their records) or Everyone's.",
    args: scopeArgs,
    confirm: (a) => {
      const s = live.current;
      if (!s.canManageRoles) return null;
      const r = resolveRole(a.role, s.roles);
      if (!r.hit || r.hit.isImmutable) return null;
      const sc = resolveScopes(a.scopes, s.screens, r.hit.permissions);
      if ('error' in sc) return null;
      // Only the scopes that actually change; all already set → no card.
      const changed = changedScopes(r.hit, sc.scopes);
      if (!changed.length) return null;
      const widen = changed.filter(([, v]) => v === 'all').map(([x]) => x.label);
      return noteDiscard(
        `Change the "${r.hit.label}" role (${r.hit.assigneeCount ?? 0} holder(s)) — ${scopeLine(changed)}?` +
        (widen.length ? ` Everyone lets holders edit/delete other people's ${widen.join(', ')} records.` : ''),
      );
    },
    run: async (a, ui) => {
      const s = live.current;
      if (!s.canManageRoles) throw new Error(NO_MANAGE);
      const r = resolveRole(a.role, s.roles);
      if (!r.hit) throw new Error(r.error);
      if (r.hit.isImmutable) throw new Error(`"${r.hit.label}" is locked and cannot be edited.`);
      const sc = resolveScopes(a.scopes, s.screens, r.hit.permissions);
      if ('error' in sc) throw new Error(sc.error);
      const role = r.hit;
      // Already as asked (confirm showed no card): don't open + re-save it.
      if (!changedScopes(role, sc.scopes).length) return { ok: true, unchanged: true, role: roleDetail(role) };
      ui.step(`Setting scopes on "${role.label}"`);
      await openForEdit(ui, role);
      for (const [screen, scope] of sc.scopes) await setScopeToggle(ui, screen, scope);
      await save(ui);
      const after = useRoleStore.getState().roles.find((x) => x.name === role.name);
      if (!after) throw new Error('The role is no longer in the list.');
      const missed = sc.scopes.filter(([x, v]) => (after.scopes[x.id] ?? 'own') !== v).map(([x]) => x.id);
      return { ok: true, role: roleDetail(after), ...(missed.length ? { notApplied: missed } : {}) };
    },
  });

  // ── Rename / describe ──────────────────────────────────────────────────────
  const renameArgs = z
    .object({
      role: z.string().min(1).describe('Role slug or label'),
      label: z.string().trim().min(1).max(60).optional(),
      description: z.string().max(300).optional(),
    })
    .refine((a) => a.label !== undefined || a.description !== undefined, 'Pass a new label and/or description.');
  useAgentAction<z.infer<typeof renameArgs>>({
    name: 'roles.rename',
    description: "Change a role's display name and/or description (its slug and permissions stay).",
    args: renameArgs,
    confirm: (a) => {
      const s = live.current;
      if (!s.canManageRoles) return null;
      const r = resolveRole(a.role, s.roles);
      if (!r.hit || r.hit.isImmutable) return null;
      const bits = [
        a.label !== undefined && a.label !== r.hit.label && `rename it to "${a.label}"`,
        a.description !== undefined &&
          a.description !== (r.hit.description ?? '') &&
          `set its description to "${a.description}"`,
      ].filter(Boolean);
      if (!bits.length) return null;
      // A name another role already has is refused by run() — no card.
      const hit = r.hit;
      if (a.label && s.roles.some((x) => x.name !== hit.name && normKey(x.label) === normKey(a.label))) return null;
      return noteDiscard(`Change the "${hit.label}" role: ${bits.join(' and ')}? Holders see the new name everywhere.`);
    },
    run: async (a, ui) => {
      const s = live.current;
      if (!s.canManageRoles) throw new Error(NO_MANAGE);
      const r = resolveRole(a.role, s.roles);
      if (!r.hit) throw new Error(r.error);
      if (r.hit.isImmutable) throw new Error(`"${r.hit.label}" is locked and cannot be edited.`);
      const role = r.hit;
      if (a.label && s.roles.some((x) => x.name !== role.name && normKey(x.label) === normKey(a.label))) {
        throw new Error(`Another role is already called "${a.label}".`);
      }
      // Same name and description (confirm showed no card): nothing to save.
      const sameLabel = a.label === undefined || a.label === role.label;
      const sameDesc = a.description === undefined || a.description === (role.description ?? '');
      if (sameLabel && sameDesc) return { ok: true, unchanged: true, role: roleJson(role) };
      await openForEdit(ui, role);
      if (a.label !== undefined) await ui.type('roles.label', a.label, { clear: true });
      if (a.description !== undefined) await ui.type('roles.description', a.description, { clear: true });
      await save(ui);
      const after = useRoleStore.getState().roles.find((x) => x.name === role.name);
      if (!after) throw new Error('The role is no longer in the list.');
      ui.flash(`roles.role-${after.name}`);
      return { ok: true, role: roleJson(after) };
    },
  });

  // ── Delete ─────────────────────────────────────────────────────────────────
  useAgentAction<z.infer<typeof roleArg>>({
    name: 'roles.delete',
    description: 'Delete a custom role (system roles cannot be deleted). Holders lose that access.',
    args: roleArg,
    confirm: (a) => {
      const s = live.current;
      if (!s.canManageRoles) return null;
      const r = resolveRole(a.role, s.roles);
      if (!r.hit || r.hit.isSystem || r.hit.isImmutable) return null;
      const n = r.hit.assigneeCount ?? 0;
      return noteDiscard(
        `Delete the "${r.hit.label}" role? ${n ? `${n} person(s) hold it and will lose that access.` : 'Nobody holds it.'} This cannot be undone.`,
      );
    },
    run: async (a, ui) => {
      const s = live.current;
      if (!s.canManageRoles) throw new Error(NO_MANAGE);
      const r = resolveRole(a.role, s.roles);
      if (!r.hit) throw new Error(r.error);
      if (r.hit.isSystem || r.hit.isImmutable) throw new Error(`"${r.hit.label}" is a built-in role and cannot be deleted.`);
      const role = r.hit;

      await ui.click(`roles.role-${role.name}`, role.label);
      // The chip opens an edit draft; Delete only shows outside edit mode.
      await ui.waitFor('roles.cancel', 3000);
      await ui.click('roles.cancel', 'Leave edit mode');
      await ui.waitFor('roles.delete', 3000);
      await ui.click('roles.delete', 'Delete');
      await ui.waitFor('roles.delete-confirm', 3000);
      const toasts = watchToasts();
      await ui.click('roles.delete-confirm', 'Delete it');
      const gone = await waitUntil(
        () => !useRoleStore.getState().roles.some((x) => x.name === role.name) || toasts.collect().some((t) => t.type === 'error'),
        { timeoutMs: 20_000, signal: ui.signal },
      );
      if (!gone || useRoleStore.getState().roles.some((x) => x.name === role.name)) {
        throw new Error(firstError(toasts.collect()) ?? 'The role was not deleted.');
      }
      return { ok: true, deleted: { role: role.name, label: role.label } };
    },
  });
}
