/**
 * Shared form primitives for the tools rail and the create form.
 *
 * Extracted so the rail and the form look identical — when each screen rolled
 * its own label/input/segment markup they drifted within a day.
 *
 * `Field` also carries the editor's AI chrome, for the same reason: give it a
 * registry `field` id and it gains the ✨ composer and becomes the assistant's
 * focus when the author touches it. Doing that here rather than at each call site
 * is what stops half the inputs having AI and half not.
 */
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AiComposeButton } from '@/agent/compose/AiComposeButton';
import { applySetField } from '@/agent/blog/blogEditorBridge';
import { blogComposeContext } from '@/agent/blog/composeContext';
import { blogFieldDef, readBlogField } from '@/agent/blog/blogFields';
import { useComposerStore } from './composerStore';

export const inputCls =
  'w-full rounded-sm border border-border/60 bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none';

/**
 * The ✨ composer for one registry field, standalone.
 *
 * `Field` uses this, and so do the two inputs that are NOT rail fields — the
 * headline and the standfirst live in the writing column with their own type
 * scale. Same wiring, same bridge, so a value composed anywhere is length-checked
 * and undoable in the same way.
 *
 * Renders nothing when there is no post open or the id isn't a writable registry
 * field: a typo then shows up as a missing button rather than one that fails.
 */
export function FieldAi({ field, className }: { field: string; className?: string }) {
  const blog = useComposerStore((s) => s.blog);
  const def = blog ? blogFieldDef(blog, field) : undefined;
  if (!blog || !def?.writable) return null;

  return (
    <AiComposeButton
      label={def.name}
      fieldKey={field}
      entityKind="blog post"
      getContext={() => blogComposeContext(blog, field)}
      getCurrentValue={() => readBlogField(blog, field)}
      onAccept={(text) => {
        const result = applySetField(blog.id, field, text);
        if (!result.ok) toast.error(result.error);
      }}
      className={className}
    />
  );
}

export function Field({
  label,
  children,
  hint,
  className,
  field,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
  /**
   * Registry field id (see agent/blog/blogFields.ts). With it, this input gets a
   * ✨ composer and becomes what the studio means by "this". Without it the field
   * renders exactly as before — the create form and the block-settings panels pass
   * nothing, because there is no post in the composer to write to.
   */
  field?: string;
}) {
  const blog = useComposerStore((s) => s.blog);
  const selectedFieldId = useComposerStore((s) => s.selectedFieldId);
  const selectField = useComposerStore((s) => s.selectField);

  // Only fields the registry knows AND can write get the chrome. A typo in a
  // `field` prop then shows up as a missing ✨ rather than as a button that fails.
  const def = field && blog ? blogFieldDef(blog, field) : undefined;
  const aiReady = !!def?.writable;
  const selected = aiReady && selectedFieldId === field;

  return (
    <div className={cn('mb-3.5', className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </label>
        {/* Through the same bridge the assistant uses, so a composed value is
            length-checked, undoable, and saved by the same autosave. */}
        {aiReady && <FieldAi field={field!} className="-mr-0.5" />}
      </div>
      <div
        // Focus IS the selection: the input you are typing in is what you mean by
        // "this", so aiming the assistant costs no extra click.
        //
        // Scoped to the INPUT, deliberately not the whole field. With it on the
        // outer element, focusing the ✨ also changed the selection — which
        // unmounts the block-settings card above in the rail, so everything jumped
        // between mousedown and mouseup and the browser cancelled the click. The
        // button simply didn't work while a block was selected.
        onFocusCapture={aiReady ? () => selectField(field!) : undefined}
        className={cn(
          'rounded-sm transition-shadow',
          // Purple, not the primary green: the green ring means "this block is
          // selected for editing" in the body, and two different meanings on one
          // colour would be worse than an extra colour.
          selected && 'ring-2 ring-purple-500/70 ring-offset-2 ring-offset-background',
        )}
      >
        {children}
      </div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

/**
 * A settings card beside the body.
 *
 * Was a flush section in a full-height rail with its own scrollbar. As a card in
 * the page flow it matches the newsroom's other editors, and the page scrolls
 * once instead of the rail and the document scrolling separately.
 */
export function RailSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-sm border border-border/60 bg-background p-4 last:mb-0">
      <p className="font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-[0.1em] text-foreground">
        {title}
      </p>
      {hint && <p className="mt-0.5 mb-3 text-[11px] leading-snug text-muted-foreground/70">{hint}</p>}
      <div className={hint ? undefined : 'mt-3'}>{children}</div>
    </section>
  );
}

/** A row of mutually exclusive choices. Wraps rather than scrolls. */
export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode; title?: string }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title ?? o.label}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] transition-colors',
            value === o.value
              ? 'border-primary/40 bg-primary/10 font-semibold text-primary'
              : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  type = 'text',
  onCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  type?: string;
  /**
   * Fired on Enter, comma, and blur. For inputs that ADD something (a tag)
   * rather than edit it — committing on blur as well means a typed value is
   * never silently lost by clicking away.
   */
  onCommit?: () => void;
}) {
  return (
    <input
      type={type}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={
        onCommit
          ? (e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                onCommit();
              }
            }
          : undefined
      }
      className={inputCls}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, 'resize-y')}
    />
  );
}
