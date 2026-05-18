import { useState, useEffect, useRef } from 'react';

interface Props {
  title: string;
  defaultValue?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function NamePromptModal({ title, defaultValue = '', onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-3">{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) { onConfirm(value.trim()); }
            else if (e.key === 'Escape') { onCancel(); }
          }}
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm focus:outline-none focus:border-fuchsia-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded hover:bg-zinc-800 text-zinc-400">Cancelar</button>
          <button onClick={() => value.trim() && onConfirm(value.trim())} disabled={!value.trim()} className="px-3 py-1.5 text-sm rounded bg-fuchsia-500 hover:bg-fuchsia-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-medium">OK</button>
        </div>
      </div>
    </div>
  );
}
