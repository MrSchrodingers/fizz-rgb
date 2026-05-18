import { useEffectStore } from '../stores/effectStore.js';
import { EFFECT_META } from '../lib/effectMetadata.js';
import { ColorPickerField } from './ColorPickerField.js';

export function ParametersPanel({ onApply }: { onApply: () => void }) {
  const selected = useEffectStore((s) => s.selected);
  const draft = useEffectStore((s) => s.draftParams);
  const setDraft = useEffectStore((s) => s.setDraftParams);
  const solidColor = useEffectStore((s) => s.solidColor);
  const setSolidColor = useEffectStore((s) => s.setSolidColor);

  if (selected === 'solid-color') {
    return (
      <section className="p-6 flex flex-col gap-4 min-w-[260px]">
        <h3 className="text-xs uppercase tracking-wider text-zinc-500">Solid Color</h3>
        <ColorPickerField value={solidColor} onChange={setSolidColor} />
        <button
          type="button"
          onClick={onApply}
          className="mt-2 px-4 py-2 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-zinc-950 font-medium transition"
        >
          Apply
        </button>
      </section>
    );
  }

  const meta = EFFECT_META[selected];
  return (
    <section className="p-6 flex flex-col gap-5 min-w-[260px]">
      <h3 className="text-xs uppercase tracking-wider text-zinc-500">{meta.label}</h3>
      <p className="text-sm text-zinc-400 -mt-3">{meta.description}</p>

      {meta.acceptsColor && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-zinc-400">Color</label>
          <ColorPickerField
            value={(draft.color as string) ?? '#ff0000'}
            onChange={(c) => setDraft({ ...draft, color: c })}
          />
        </div>
      )}

      {meta.acceptsSpeed && (
        <SliderField
          label="Speed"
          value={draft.speed ?? 2}
          min={1} max={4}
          onChange={(v) => setDraft({ ...draft, speed: v })}
        />
      )}

      {meta.acceptsBrightness && (
        <SliderField
          label="Brightness"
          value={draft.brightness ?? 3}
          min={0} max={4}
          onChange={(v) => setDraft({ ...draft, brightness: v })}
        />
      )}

      {meta.acceptsDirection && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-zinc-400">Direction</label>
          <div className="flex gap-2">
            {(['forward', 'reverse'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDraft({ ...draft, direction: d })}
                className={
                  (draft.direction ?? 'forward') === d
                    ? 'flex-1 px-3 py-2 rounded-lg bg-zinc-700 text-zinc-100 text-sm'
                    : 'flex-1 px-3 py-2 rounded-lg bg-zinc-900 text-zinc-400 text-sm hover:bg-zinc-800'
                }
              >
                {d === 'forward' ? '→ Forward' : '← Reverse'}
              </button>
            ))}
          </div>
        </div>
      )}

      {meta.acceptsDensity && (
        <SliderField
          label="Density"
          value={draft.density ?? 4}
          min={0} max={15}
          onChange={(v) => setDraft({ ...draft, density: v })}
        />
      )}

      <button
        type="button"
        onClick={onApply}
        className="mt-2 px-4 py-2 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-zinc-950 font-medium transition"
      >
        Apply
      </button>
    </section>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="font-mono text-zinc-500">{value}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-fuchsia-500"
      />
    </div>
  );
}
