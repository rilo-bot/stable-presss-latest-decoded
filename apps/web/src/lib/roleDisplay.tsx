/**
 * Role presentation — label, colour and icon for the roles a user actually holds.
 *
 * This replaces the static `ROLES: RoleConfig[]` table. Roles are database rows
 * now, so their label/colour/icon arrive on the session payload. The old table
 * also fell back to `ROLES[0]` for anything it didn't recognise, which meant a
 * role it had never heard of silently rendered as "Contributor".
 *
 * Icons cross the wire as lucide NAMES (components can't be serialized), so the
 * registry below maps a name to a component.
 */
import type { ReactNode } from 'react';
import {
  CheckSquare, Edit, FileText, Mic, Send, Shield, ShieldCheck, Star, User, Users,
  BarChart2, BookOpen, Eye, Flag, Image, Layers, Settings,
} from 'lucide-react';
import { useAuthStore, type AssignedRole } from '@/stores/authStore';

/** Icon names a role may reference. Unknown names fall back to a neutral shield. */
const ICONS: Record<string, (size: number) => ReactNode> = {
  CheckSquare: (s) => <CheckSquare size={s} />,
  Edit: (s) => <Edit size={s} />,
  FileText: (s) => <FileText size={s} />,
  Mic: (s) => <Mic size={s} />,
  Send: (s) => <Send size={s} />,
  Shield: (s) => <Shield size={s} />,
  ShieldCheck: (s) => <ShieldCheck size={s} />,
  Star: (s) => <Star size={s} />,
  User: (s) => <User size={s} />,
  Users: (s) => <Users size={s} />,
  BarChart2: (s) => <BarChart2 size={s} />,
  BookOpen: (s) => <BookOpen size={s} />,
  Eye: (s) => <Eye size={s} />,
  Flag: (s) => <Flag size={s} />,
  Image: (s) => <Image size={s} />,
  Layers: (s) => <Layers size={s} />,
  Settings: (s) => <Settings size={s} />,
};

/** The list of icon names a superadmin can pick from in the Roles screen. */
export const ROLE_ICON_NAMES = Object.keys(ICONS);

export function roleIcon(name: string | undefined, size = 14): ReactNode {
  return (ICONS[name ?? ''] ?? ICONS.Shield)(size);
}

const NEUTRAL = 'hsl(var(--muted-foreground))';

export function roleColor(role: AssignedRole | undefined): string {
  return role?.color || NEUTRAL;
}

/** Every role the signed-in user holds, in server order. */
export function useAssignedRoles(): AssignedRole[] {
  return useAuthStore((s) => s.currentUser?.access?.roles ?? []);
}

/**
 * The role used for chrome that only has room for one (avatar tint, top-bar
 * chip). The FIRST assigned role, not a "highest-ranked" one — ranking is
 * meaningless once roles are user-defined. Undefined when the user holds none.
 */
export function usePrimaryAssignedRole(): AssignedRole | undefined {
  return useAssignedRoles()[0];
}

/** A short summary line, e.g. "Editor · Contributor". */
export function roleSummary(roles: AssignedRole[]): string {
  return roles.map((r) => r.label).join(' · ');
}
