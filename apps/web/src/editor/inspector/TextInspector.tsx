import type { TextContent, TextStyle } from '@/types/magazine';
import { useMagazineStore } from '@/stores/magazineStore';
import { Section, Stepper, Segmented, ColorControl, FontFamilyMenu } from './controls';
import { DeleteRegionButton } from './DeleteRegionButton';
import { Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';

export function TextInspector({
  magazineId,
  pageId,
  regionId,
  content,
}: {
  magazineId: string;
  pageId: string;
  regionId: string;
  content: TextContent;
}) {
  const setTextStyle = useMagazineStore((s) => s.setTextStyle);
  const s = content.style;
  const patch = (p: Partial<TextStyle>) => setTextStyle(magazineId, pageId, regionId, p);

  return (
    <div>
      <Section title="Font">
        <FontFamilyMenu value={s.fontFamily} onChange={(id) => patch({ fontFamily: id })} />
      </Section>

      <Section title="Size & weight">
        <div className="grid grid-cols-2 gap-2">
          <Stepper value={s.fontSize} min={6} max={160} suffix="px" onChange={(v) => patch({ fontSize: v })} />
          <Segmented<number>
            value={s.fontWeight >= 700 ? 700 : s.fontWeight >= 600 ? 600 : 400}
            options={[
              { value: 400, label: 'Reg' },
              { value: 600, label: 'Semi' },
              { value: 700, label: 'Bold' },
            ]}
            onChange={(v) => patch({ fontWeight: v })}
          />
        </div>
      </Section>

      {/* Weight lives solely in "Size & weight" above; this row is italic/underline
          only, so the two controls can't disagree on fontWeight. */}
      <Section title="Style">
        <div className="flex gap-2">
          <Segmented<number>
            value={s.italic ? 1 : 0}
            options={[{ value: 1, label: <Italic size={13} />, title: 'Italic' }]}
            onChange={() => patch({ italic: !s.italic })}
          />
          <Segmented<number>
            value={s.underline ? 1 : 0}
            options={[{ value: 1, label: <Underline size={13} />, title: 'Underline' }]}
            onChange={() => patch({ underline: !s.underline })}
          />
        </div>
      </Section>

      <Section title="Alignment">
        <Segmented<TextStyle['align']>
          value={s.align}
          options={[
            { value: 'left', label: <AlignLeft size={13} /> },
            { value: 'center', label: <AlignCenter size={13} /> },
            { value: 'right', label: <AlignRight size={13} /> },
            { value: 'justify', label: <AlignJustify size={13} /> },
          ]}
          onChange={(v) => patch({ align: v })}
        />
      </Section>

      <Section title="Colour">
        <ColorControl value={s.color} onChange={(c) => patch({ color: c })} />
      </Section>

      <Section title="Spacing">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[10px] text-white/40">Line height</p>
            <Stepper
              value={Math.round((s.lineHeight ?? 1.35) * 100)}
              min={80}
              max={250}
              step={5}
              suffix="%"
              onChange={(v) => patch({ lineHeight: v / 100 })}
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] text-white/40">Letter spacing</p>
            <Stepper
              value={s.letterSpacing ?? 0}
              min={-2}
              max={20}
              suffix="px"
              onChange={(v) => patch({ letterSpacing: v })}
            />
          </div>
        </div>
      </Section>

      <Section title="Case">
        <Segmented<NonNullable<TextStyle['textTransform']>>
          value={s.textTransform ?? 'none'}
          options={[
            { value: 'none', label: 'Aa' },
            { value: 'uppercase', label: 'AA' },
            { value: 'capitalize', label: 'Ab' },
            { value: 'lowercase', label: 'aa' },
          ]}
          onChange={(v) => patch({ textTransform: v })}
        />
      </Section>

      <DeleteRegionButton magazineId={magazineId} pageId={pageId} regionId={regionId} label="text" />
    </div>
  );
}
