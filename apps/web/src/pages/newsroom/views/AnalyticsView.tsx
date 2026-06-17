interface AnalyticsViewProps {
  publishedCount: number;
  scheduledCount: number;
  totalStories: number;
  pendingReview: number;
}

export function AnalyticsView({ publishedCount, scheduledCount, totalStories, pendingReview }: AnalyticsViewProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Published', value: publishedCount, color: 'hsl(var(--primary))' },
          { label: 'Scheduled', value: scheduledCount, color: 'hsl(var(--chart-1))' },
          { label: 'Total Stories', value: totalStories, color: 'hsl(var(--brand-accent))' },
          { label: 'In Pipeline', value: pendingReview, color: 'hsl(var(--chart-3))' },
        ].map((s) => (
          <div key={s.label} className="p-4 border border-border/60 rounded-sm bg-card text-center">
            <span className="block font-[family-name:var(--font-display)] text-3xl font-bold" style={{ color: s.color }}>
              {s.value}
            </span>
            <span className="block text-[12px] uppercase tracking-[0.1em] text-muted-foreground mt-1">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="border border-border/60 rounded-sm p-5 bg-card">
        <p className="text-sm text-muted-foreground text-center py-8 font-[family-name:var(--font-display)] italic">
          Full analytics dashboard — connects to your analytics provider in production.
        </p>
      </div>
    </div>
  );
}
