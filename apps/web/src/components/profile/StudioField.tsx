/**
 * StudioField — makes a profile data-box clickable while the Stable Studio
 * assistant is open: a click focuses it (purple ring + label tag) and tells the
 * assistant to act on it. Mirrors the article page's SelectableField.
 *
 * When the assistant is closed (or the profile isn't editable), it renders its
 * children untouched, so normal inline editing and the public view are
 * unchanged. While active it intercepts clicks in the CAPTURE phase, so a click
 * focuses the whole box for the AI rather than opening an inner inline editor.
 */
import { useProfileAgentUi } from '@/stores/profileAgentUiStore';

interface Props {
  /** Box key from PROFILE_BOXES (e.g. 'photo', 'basics', 'pedigree', 'racing'). */
  fieldId: string;
  label: string;
  /** Only selectable when true (i.e. the member can edit this profile). */
  enabled?: boolean;
  children: React.ReactNode;
}

export function StudioField({ fieldId, label, enabled, children }: Props) {
  const open = useProfileAgentUi((s) => s.open);
  const selected = useProfileAgentUi((s) => s.selectedFieldId === fieldId);
  const select = useProfileAgentUi((s) => s.select);

  // Inactive → transparent pass-through (no layout/behaviour change).
  if (!enabled || !open) return <>{children}</>;

  const focus = () => select(fieldId);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Focus ${label} for the Stable Studio assistant`}
      // Capture phase so the whole box is selected before any inner editor opens.
      onClickCapture={(e) => {
        e.stopPropagation();
        e.preventDefault();
        focus();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          focus();
        }
      }}
      style={{ position: 'relative', cursor: 'pointer', borderRadius: 5 }}
      className={selected ? 'studio-focus-ring studio-focus-ring--on' : 'studio-focus-ring'}
    >
      {selected && (
        <span
          style={{
            position: 'absolute', top: -9, left: 8, zIndex: 20, pointerEvents: 'none',
            background: '#9333ea', color: '#fff', borderRadius: 999, padding: '1px 8px',
            fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
