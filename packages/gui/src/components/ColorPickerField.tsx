import { HexColorPicker } from 'react-colorful';

interface Props {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPickerField({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <HexColorPicker color={value} onChange={onChange} />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
            onChange(v.startsWith('#') ? v : '#' + v);
          }
        }}
        className="font-mono text-sm bg-zinc-900 border border-zinc-800 rounded px-2 py-1 focus:outline-none focus:border-fuchsia-500"
      />
    </div>
  );
}
