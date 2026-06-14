// ---------------------------------------------------------------------------
// Inline entry point to the Stablehand assistant. Drop this anywhere ("Ask
// about this horse", "Summarise this article", "Help me complete my profile").
// It opens the global chat and seeds the question; the widget auto-attaches the
// current page as context, so prompts like "this horse" resolve correctly.
//
// Two looks so it fits both UI worlds:
//   - "pill"   the clean Tailwind/shadcn surfaces (default)
//   - "ornate" the parchment/forest "racing almanac" pages
// ---------------------------------------------------------------------------

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentUi } from '@/stores/agentUiStore';

interface AskAgentButtonProps {
  prompt: string;
  label?: string;
  variant?: 'pill' | 'ornate';
  className?: string;
}

export function AskAgentButton({
  prompt,
  label = 'Ask the Stablehand',
  variant = 'pill',
  className,
}: AskAgentButtonProps) {
  const ask = useAgentUi((s) => s.ask);

  if (variant === 'ornate') {
    return (
      <button
        type="button"
        onClick={() => ask(prompt)}
        title={label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontWeight: 700,
          color: 'var(--gold-bright)',
          background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-deep) 100%)',
          border: '1px solid var(--gold-mid)',
          borderRadius: 4,
          padding: '6px 12px',
          cursor: 'pointer',
          fontFamily: "'IM Fell English', Georgia, serif",
        }}
      >
        <Sparkles size={12} style={{ color: 'var(--gold-bright)' }} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => ask(prompt)}
      title={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary transition-colors hover:bg-primary/5',
        className,
      )}
      style={{ borderColor: 'hsl(var(--brand-accent) / 0.45)' }}
    >
      <Sparkles size={13} style={{ color: 'hsl(var(--brand-accent))' }} />
      {label}
    </button>
  );
}
