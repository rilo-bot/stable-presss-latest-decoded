import { Check } from 'lucide-react';

interface StepCompleteProps {
  message?: string;
}

/**
 * Completion screen. In the current signup flow a successful final step
 * navigates the user away (to /dashboard, /studio/:id or /orgs/:id) rather
 * than rendering a standalone "done" screen, so this component is the
 * presentational endpoint kept available for that terminal state.
 */
export default function StepComplete({ message }: StepCompleteProps) {
  return (
    <>
      <div className="mb-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
          <Check size={22} />
        </span>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1">
          You&rsquo;re all set
        </h2>
        <div className="h-px w-full bg-foreground/10 mt-3 mb-4" />
        <p className="text-sm text-muted-foreground">
          {message ?? 'Your account is ready. Welcome to Stable Press.'}
        </p>
      </div>
    </>
  );
}
