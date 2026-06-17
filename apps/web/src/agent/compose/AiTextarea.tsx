// A drop-in replacement for the shared <Textarea> that adds the ✨ AI compose
// affordance at the bottom-right. Same textarea props (value/onChange/rows/…)
// plus the field meta the composer needs. onAccept commits the drafted text.

import { forwardRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AiComposeButton } from './AiComposeButton';

interface AiTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Field label shown in the composer, e.g. "Summary". */
  aiLabel: string;
  aiKey?: string;
  /** "article" | "horse" | "party" | "media" … */
  entityKind: string;
  /** Facts the form holds, read fresh at click time, to ground the draft. */
  getContext: () => Record<string, unknown>;
  /** Commit the accepted draft into the field. */
  onAccept: (text: string) => void;
}

export const AiTextarea = forwardRef<HTMLTextAreaElement, AiTextareaProps>(function AiTextarea(
  { aiLabel, aiKey, entityKind, getContext, onAccept, className, value, ...props },
  ref,
) {
  return (
    <div className="relative">
      <Textarea ref={ref} value={value} className={cn('pb-9', className)} {...props} />
      <div className="absolute bottom-1.5 right-1.5">
        <AiComposeButton
          label={aiLabel}
          fieldKey={aiKey}
          entityKind={entityKind}
          getContext={getContext}
          getCurrentValue={() => (value == null ? '' : String(value))}
          onAccept={onAccept}
        />
      </div>
    </div>
  );
});
