/**
 * RoleSelect — the role picker on the Team screen, in the site's own clothes.
 *
 * It replaces two native <select>s. A native select hands its option list to the
 * operating system, which draws it in system blue on white with system type —
 * the one part of a cream-and-forest screen that looked borrowed from somewhere
 * else, and the part you look at every time you change someone's access.
 *
 * Two looks, one behaviour:
 *   - 'pill'  — the coloured role chip on a roster row. The chip IS the picker.
 *   - 'field' — a form control beside the invite email input.
 *
 * The list is PORTALLED to <body> with fixed positioning. The roster card it sits
 * in is `overflow-hidden` (for its rounded corners), so an absolutely-positioned
 * list was clipped on the last rows — exactly the rows a long team scrolls to. It
 * flips above the trigger when there is no room below, and follows the trigger on
 * scroll/resize rather than detaching from it.
 *
 * Keyboard: the ARIA listbox pattern — ↑/↓ move, Home/End jump, Enter/Space pick,
 * Esc closes and returns focus, typing a letter jumps to the next role starting
 * with it.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { roleIcon } from '@/lib/roleDisplay';
import { stablehandReserve } from '@/lib/stablehandDock';
import { cn } from '@/lib/utils';

export interface RoleOption {
  name: string;
  label: string;
  description?: string;
  color?: string;
  icon?: string;
}

interface RoleSelectProps {
  /** The selected role's slug ('' = none). */
  value: string;
  roles: RoleOption[];
  onChange: (slug: string) => void;
  /** Accessible name for the trigger, e.g. "Role for Jane Doe". */
  ariaLabel: string;
  variant?: 'pill' | 'field';
  disabled?: boolean;
  /** Shows a spinner in the trigger while a change is being saved. */
  busy?: boolean;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  /**
   * What the trigger shows when `value` isn't in `roles` — a member's role arrives
   * resolved from the server and can be one the console hasn't loaded yet.
   */
  fallback?: RoleOption;
  className?: string;
  /**
   * Operator anchor (data-agent-id) for the trigger. Each option is anchored as
   * `<agentId>.option-<slug>`, so the Stablehand Operator can open the list and
   * pick a role the same way a person does.
   */
  agentId?: string;
}

const NEUTRAL = 'hsl(var(--muted-foreground))';
const GUTTER = 12; // keep the list this far from the viewport edge
const GAP = 6; // between trigger and list
const MIN_WIDTH = 264;

/**
 * A translucent version of a role colour. Role colours are stored as #rrggbb, so
 * appending an alpha byte is the cheap path — but a role with no colour falls back
 * to an `hsl(var(...))` string, where appending hex would produce an invalid value
 * and the pill would silently lose its border and fill.
 */
function tint(c: string, alpha: number): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c + Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `color-mix(in srgb, ${c} ${Math.round(alpha * 100)}%, transparent)`;
}

export function RoleSelect({
  value,
  roles,
  onChange,
  ariaLabel,
  variant = 'pill',
  disabled,
  busy,
  placeholder = 'Choose a role',
  fallback,
  className,
  agentId,
}: RoleSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ buf: string; at: number }>({ buf: '', at: 0 });
  const listId = useId();

  const selected = roles.find((r) => r.name === value) ?? (value && fallback?.name === value ? fallback : undefined);
  const color = selected?.color || NEUTRAL;

  // ── Positioning ───────────────────────────────────────────────────────────
  const place = useCallback(() => {
    const t = triggerRef.current;
    const list = listRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    // Trigger scrolled out of sight: close rather than leave a list floating over
    // content it no longer belongs to.
    if (r.bottom < 0 || r.top > window.innerHeight) {
      setOpen(false);
      return;
    }
    // The site's right edge: The Stable Hand may be docked beside it.
    const viewW = window.innerWidth - stablehandReserve();
    const width = Math.min(Math.max(r.width, MIN_WIDTH), viewW - GUTTER * 2);
    const height = list?.offsetHeight ?? 0;
    const roomBelow = window.innerHeight - r.bottom - GAP - GUTTER;
    const roomAbove = r.top - GAP - GUTTER;
    const above = height > roomBelow && roomAbove > roomBelow;
    const left = Math.min(Math.max(GUTTER, r.left), viewW - width - GUTTER);
    const top = above ? Math.max(GUTTER, r.top - GAP - height) : r.bottom + GAP;
    setPos({ top, left, width, above });
  }, []);

  // Measure after the list mounts (its height decides whether it flips), then
  // keep it glued to the trigger while anything scrolls or the window resizes.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place, roles.length]);

  // ── Open / close ──────────────────────────────────────────────────────────
  const openList = () => {
    if (disabled || busy || roles.length === 0) return;
    const i = roles.findIndex((r) => r.name === value);
    setActive(i >= 0 ? i : 0);
    setPos(null);
    setOpen(true);
  };

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Focus moves into the list so the arrow keys land there — once it is PLACED.
  // Before its first measurement the list is `visibility: hidden`, and a hidden
  // element cannot take focus: the call silently did nothing, keys went to the
  // page, and End scrolled the whole document instead of the list.
  const placed = pos !== null;
  useEffect(() => {
    if (open && placed) listRef.current?.focus({ preventScroll: true });
  }, [open, placed]);

  // Click anywhere else closes it. Checked against BOTH nodes because the list is
  // portalled out of the trigger's subtree.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (triggerRef.current?.contains(n) || listRef.current?.contains(n)) return;
      close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  // Keep the highlighted row in view inside a long list — by moving the LIST's own
  // scrollTop, never scrollIntoView. scrollIntoView scrolls every scrollable
  // ancestor too, the window included, so pressing End on a long list scrolled the
  // whole page, carried the trigger off-screen and dragged the list after it.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !row) return;
    const top = row.offsetTop - 4; // the list is position:fixed, so it is the offsetParent
    const bottom = row.offsetTop + row.offsetHeight + 4;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [open, active]);

  const pick = (slug: string) => {
    close(true);
    if (slug !== value) onChange(slug);
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const last = roles.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => (i >= last ? 0 : i + 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => (i <= 0 ? last : i - 1));
        return;
      case 'Home':
        e.preventDefault();
        setActive(0);
        return;
      case 'End':
        e.preventDefault();
        setActive(last);
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (roles[active]) pick(roles[active]!.name);
        return;
      case 'Escape':
        e.preventDefault();
        close(true);
        return;
      case 'Tab':
        close(false);
        return;
    }
    // Type-ahead: letters typed within ~half a second build a prefix.
    if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const t = typeahead.current;
      t.buf = now - t.at > 600 ? e.key.toLowerCase() : t.buf + e.key.toLowerCase();
      t.at = now;
      const order = [...roles.slice(active + 1), ...roles.slice(0, active + 1)];
      const hit = order.find((r) => r.label.toLowerCase().startsWith(t.buf));
      if (hit) setActive(roles.indexOf(hit));
    }
  };

  // ── Trigger ───────────────────────────────────────────────────────────────
  const triggerLabel = selected?.label ?? placeholder;
  const trigger =
    variant === 'pill' ? (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKey}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        data-agent-id={agentId}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-full border py-[3px] pl-2 pr-1.5 text-[12px] font-semibold transition-[box-shadow,background-color] ',
          'hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_2px_8px_-2px_rgba(26,51,34,0.18)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-60',
          busy && 'cursor-wait',
          className,
        )}
        style={
          selected
            ? { borderColor: tint(color, 0.4), background: tint(color, open ? 0.14 : 0.08), color }
            : { borderColor: 'hsl(var(--border))', color: NEUTRAL }
        }
      >
        {selected ? roleIcon(selected.icon, 11) : null}
        {/* Roles are named by whoever creates them, so a name can be long. Wide
            enough for typical names; the tooltip carries the rest. */}
        <span className="max-w-[28ch] truncate" title={triggerLabel}>{triggerLabel}</span>
        {busy ? (
          <Loader2 size={12} className="animate-spin opacity-80" />
        ) : (
          <ChevronDown size={12} className={cn('opacity-70 transition-transform duration-150', open && 'rotate-180')} />
        )}
      </button>
    ) : (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKey}
        disabled={disabled || roles.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        data-agent-id={agentId}
        className={cn(
          'flex min-w-[13rem] items-center gap-2 rounded-sm border border-input bg-background px-3 py-2 text-left text-sm transition-colors',
          'hover:border-primary/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-60',
          open && 'border-primary/60 ring-1 ring-ring',
          className,
        )}
      >
        {selected ? (
          <span
            className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full"
            style={{ background: tint(color, 0.12), color }}
          >
            {roleIcon(selected.icon, 11)}
          </span>
        ) : null}
        <span
          className={cn('flex-1 truncate', selected ? 'font-medium text-foreground' : 'text-muted-foreground')}
          title={selected?.label}
        >
          {roles.length === 0 ? 'No roles defined' : triggerLabel}
        </span>
        <ChevronDown
          size={14}
          className={cn('flex-shrink-0 text-muted-foreground transition-transform duration-150', open && 'rotate-180')}
        />
      </button>
    );

  // ── List ──────────────────────────────────────────────────────────────────
  const list = open
    ? createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-opt-${active}`}
          onKeyDown={onListKey}
          className={cn(
            'fixed z-[100] max-h-[min(22rem,70vh)] overflow-y-auto overscroll-contain rounded-md border border-border/80 bg-popover p-1 text-popover-foreground focus:outline-none',
            'shadow-[0_18px_40px_-12px_rgba(26,51,34,0.35),0_2px_6px_rgba(26,51,34,0.08)]',
            'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95',
          )}
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: pos?.width ?? MIN_WIDTH,
            // Hidden for the one frame before it is measured, so it never flashes
            // in the wrong place.
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {/* A gold rule and a small-caps label — the masthead treatment the site
              uses on its section headers, at popover scale. */}
          <li role="presentation" aria-hidden className="px-2.5 pb-1.5 pt-1.5">
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <span className="h-px w-3 bg-[hsl(var(--brand-accent))]" />
              Assign a role
              <span className="h-px flex-1 bg-border/70" />
            </span>
          </li>
          {roles.map((r, i) => {
            const isSel = r.name === value;
            const isActive = i === active;
            const c = r.color || NEUTRAL;
            return (
              <li
                key={r.name}
                id={`${listId}-opt-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSel}
                data-agent-id={agentId ? `${agentId}.option-${r.name}` : undefined}
                data-agent-label={agentId ? r.label : undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault() /* keep focus in the list */}
                onClick={() => pick(r.name)}
                className={cn(
                  'relative flex cursor-pointer select-none items-start gap-2.5 rounded-sm py-2 pl-2.5 pr-2 transition-colors',
                  isActive ? 'bg-muted' : 'bg-transparent',
                )}
              >
                {/* Selected = a gold bar down the left edge, not just a tick. */}
                {isSel && (
                  <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-full bg-[hsl(var(--brand-accent))]" />
                )}
                <span
                  className="mt-px grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border"
                  style={{ background: tint(c, 0.08), borderColor: tint(c, 0.25), color: c }}
                >
                  {roleIcon(r.icon, 12)}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    // The list has room the pill does not: a long role name wraps to two
                    // lines here rather than being cut to a dozen characters.
                    className={cn('line-clamp-2 break-words text-[13px] leading-5', isSel ? 'font-semibold' : 'font-medium')}
                    style={{ color: isSel ? c : undefined }}
                    title={r.label}
                  >
                    {r.label}
                  </span>
                  {r.description ? (
                    // No `block` here: line-clamp works by making the span a -webkit-box,
                    // and a `block` beside it overrode that display, so the clamp silently
                    // never applied and long descriptions ran to four lines.
                    <span className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">{r.description}</span>
                  ) : null}
                </span>
                <Check
                  size={14}
                  aria-hidden
                  className={cn('mt-1 flex-shrink-0 text-primary', isSel ? 'opacity-100' : 'opacity-0')}
                />
              </li>
            );
          })}
        </ul>,
        document.body,
      )
    : null;

  return (
    <>
      {trigger}
      {list}
    </>
  );
}
