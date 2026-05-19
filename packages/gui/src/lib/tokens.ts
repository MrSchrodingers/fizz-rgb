/**
 * Semantic design tokens — class-name strings, not raw values, so Tailwind's
 * JIT actually emits them. Use these instead of ad-hoc bg-fuchsia-500/20.
 *
 * Naming: <role>.<state>
 *   - accent   → the brand action (primary, "do the thing")
 *   - success  → completed / save / OK
 *   - warning  → reversible danger (reset, disconnect)
 *   - danger   → destructive (delete profile, force overwrite)
 *   - neutral  → secondary controls, filters
 *   - ghost    → tertiary (toolbar buttons, icon affordances)
 */

export const tone = {
  accent: {
    solid: 'bg-fuchsia-500 hover:bg-fuchsia-400 text-zinc-950',
    soft: 'bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200',
    ring: 'ring-1 ring-fuchsia-500/60',
    text: 'text-fuchsia-300',
  },
  success: {
    solid: 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950',
    soft: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300',
    text: 'text-emerald-300',
  },
  warning: {
    soft: 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200',
    text: 'text-amber-200',
  },
  danger: {
    solid: 'bg-red-500 hover:bg-red-400 text-zinc-50',
    soft: 'bg-red-500/15 hover:bg-red-500/25 text-red-300',
    text: 'text-red-300',
  },
  neutral: {
    soft: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100',
    ghost: 'hover:bg-zinc-800 text-zinc-300',
    text: 'text-zinc-300',
  },
} as const;

/** Common interactive base — focus rings + transitions + cursor. */
export const baseInteractive =
  'transition outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

export const sizes = {
  xs: 'px-2 py-1 text-xs rounded-md',
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-5 py-2.5 text-base rounded-lg',
} as const;

export type Tone = keyof typeof tone;
export type Size = keyof typeof sizes;
