import { Upload, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';

export function MyAssetsView() {
  return (
    <div className="space-y-6">
      <div
        className="border-2 border-dashed border-border/60 rounded-sm p-8 flex flex-col items-center justify-center gap-4 hover:border-primary/40 transition-colors cursor-pointer bg-card"
        onClick={() => {}}
        role="button"
        tabIndex={0}
        aria-label="Upload media asset"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
      >
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Upload size={20} className="text-primary" />
        </div>
        <div className="text-center">
          <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground mb-1">
            Upload a media file
          </p>
          <p className="text-sm text-muted-foreground">
            Images, graphics, and supporting media for your stories. Files live here and can be referenced in your drafts.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-sm" disabled>
          <Upload size={12} />
          Choose File
        </Button>
        <p className="text-[12px] text-muted-foreground/50 italic">
          Media asset storage connects to your storage provider in production.
        </p>
      </div>

      <div className="border border-border/60 rounded-sm p-6 bg-card">
        <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-4">
          Your Uploaded Assets
        </p>
        <EmptyState
          icon={Image}
          heading="No assets uploaded yet."
          description="Upload photos, graphics, and supporting images here. They will be available to attach to your drafts and submissions."
          ctaLabel="Upload Your First Asset"
          onCta={() => {}}
        />
      </div>
    </div>
  );
}
