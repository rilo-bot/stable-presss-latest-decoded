export function SettingsView() {
  return (
    <div className="max-w-lg space-y-5">
      {[
        { label: 'Publication Name', value: 'Stable Press', desc: 'Displayed across all editorial output' },
        { label: 'Default Category', value: 'Race Report', desc: 'Applied to new stories without a category' },
        { label: 'Legal Review Required', value: 'Yes', desc: 'All stories pass through legal before scheduling' },
        { label: 'Workflow Stages', value: '12', desc: 'From Draft through Bulletin Inclusion' },
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
