/**
 * READ-ONLY, and honest about it. There is no settings endpoint — nothing here is
 * stored or editable, so `settings.manage` was removed from the permission
 * catalogue rather than left as a checkbox that governed nothing. Re-add it in the
 * same commit as the endpoint that enforces it. See
 * docs/CRM-MODULES-PERMISSIONS-REVIEW.md §4.3.
 *
 * The two workflow rows were also factually wrong: they still described the
 * retired twelve-status pipeline with a legal-review gate, which has been five
 * stages and one approval step since the workflow rebuild.
 */
export function SettingsView() {
  return (
    <div className="max-w-lg space-y-5">
      {[
        { label: 'Publication Name', value: 'Stable Press', desc: 'Displayed across all editorial output' },
        { label: 'Default Category', value: 'Race Report', desc: 'Applied to new stories without a category' },
        { label: 'Approval Steps', value: '1', desc: 'One approval before a story may be scheduled or published' },
        { label: 'Workflow Stages', value: '5', desc: 'Draft · Submitted · Approved · Scheduled · Published' },
      ].map((setting) => (
        <div key={setting.label} className="p-4 border border-border/60 rounded-sm bg-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-foreground">{setting.label}</span>
            <span
              className="text-sm font-medium px-2 py-0.5 rounded-sm"
              style={{ background: 'hsl(var(--brand-accent) / 0.12)', color: 'hsl(var(--brand-accent))' }}
            >
              {setting.value}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{setting.desc}</p>
        </div>
      ))}
    </div>
  );
}
