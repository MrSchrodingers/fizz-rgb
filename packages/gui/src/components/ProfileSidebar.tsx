import { Download, Plus, Trash2, Upload, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useProfileStore } from '../stores/profileStore.js';
import { cn } from '../lib/classnames.js';

export function ProfileSidebar({
  onActivate,
  onSaveNew,
  onDelete,
  onExport,
  onImport,
}: {
  onActivate: (name: string) => void;
  onSaveNew: () => void;
  onDelete: (name: string) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const profiles = useProfileStore((s) => s.profiles);
  const active = useProfileStore((s) => s.active);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.name.toLowerCase().includes(q));
  }, [profiles, query]);

  return (
    <aside className="flex flex-col gap-1 w-56 px-3 py-4 border-r border-zinc-800 border-t overflow-hidden">
      <h2 className="text-xs uppercase tracking-wider text-zinc-400 px-2 mb-1">Profiles</h2>
      {profiles.length > 4 && (
        <div className="relative px-2 mb-1">
          <Search className="w-3 h-3 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search profiles"
            className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded pl-7 pr-2 py-1 focus:outline-none focus:border-fuchsia-500"
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto -mx-1 px-1 flex flex-col gap-1">
        {filtered.length === 0 && profiles.length > 0 && (
          <p className="text-xs text-zinc-500 px-2 py-2">No match.</p>
        )}
        {profiles.length === 0 && (
          <p className="text-xs text-zinc-500 px-2 py-3 leading-relaxed">
            No profiles yet. Save the current effect to create one.
          </p>
        )}
        {filtered.map((p) => {
          const isActive = active === p.name;
          return (
            <div key={p.name} className="group flex items-center">
              <button
                type="button"
                onClick={() => onActivate(p.name)}
                className={cn(
                  'flex-1 text-left px-3 py-2 rounded-lg text-sm transition truncate',
                  isActive ? 'bg-emerald-500/15 text-emerald-200' : 'text-zinc-300 hover:bg-zinc-800/60',
                )}
                title={p.name}
              >
                {p.name}
              </button>
              <button
                type="button"
                onClick={() => onDelete(p.name)}
                aria-label={`Delete ${p.name}`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded hover:bg-red-500/15 text-zinc-500 hover:text-red-400 transition"
                title="Delete profile"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSaveNew}
        className="flex items-center gap-2 px-3 py-2 mt-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/60 transition"
      >
        <Plus className="w-4 h-4" />
        Save current as profile
      </button>
      <div className="flex gap-1 mt-1">
        <button
          type="button"
          onClick={onExport}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 transition"
          title="Export all profiles & patterns to file"
        >
          <Download className="w-3 h-3" /> Export
        </button>
        <button
          type="button"
          onClick={onImport}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 transition"
          title="Import profiles & patterns from file"
        >
          <Upload className="w-3 h-3" /> Import
        </button>
      </div>
    </aside>
  );
}
