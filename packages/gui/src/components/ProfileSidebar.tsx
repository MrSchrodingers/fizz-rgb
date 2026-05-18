import { Plus, Trash2 } from 'lucide-react';
import { useProfileStore } from '../stores/profileStore.js';
import { cn } from '../lib/classnames.js';

export function ProfileSidebar({
  onActivate,
  onSaveNew,
  onDelete,
}: {
  onActivate: (name: string) => void;
  onSaveNew: () => void;
  onDelete: (name: string) => void;
}) {
  const profiles = useProfileStore((s) => s.profiles);
  const active = useProfileStore((s) => s.active);

  return (
    <aside className="flex flex-col gap-1 w-56 px-3 py-4 border-r border-zinc-800 border-t">
      <h2 className="text-xs uppercase tracking-wider text-zinc-500 px-2 mb-2">Profiles</h2>
      {profiles.length === 0 && (
        <p className="text-xs text-zinc-600 px-2 py-3">
          No profiles yet. Save the current effect to create one.
        </p>
      )}
      {profiles.map((p) => {
        const isActive = active === p.name;
        return (
          <div key={p.name} className="group flex items-center">
            <button
              type="button"
              onClick={() => onActivate(p.name)}
              className={cn(
                'flex-1 text-left px-3 py-2 rounded-lg text-sm transition',
                isActive ? 'bg-emerald-500/15 text-emerald-200' : 'text-zinc-300 hover:bg-zinc-800/60',
              )}
            >
              {p.name}
            </button>
            <button
              type="button"
              onClick={() => onDelete(p.name)}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/15 text-zinc-500 hover:text-red-400 transition"
              title="Delete profile"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onSaveNew}
        className="flex items-center gap-2 px-3 py-2 mt-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/60 transition"
      >
        <Plus className="w-4 h-4" />
        Save current as profile
      </button>
    </aside>
  );
}
