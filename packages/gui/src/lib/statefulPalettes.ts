/**
 * Per-animType palette declarations for stateful daemon-side animations
 * (Minecraft, DOOM, Aquarium, games, etc.). Each entry lists the editable
 * color slots the engine recognises, with friendly labels for the UI and
 * default hex values that match the engine defaults.
 *
 * The GUI's PresetEditor surfaces these swatches when the active preset
 * is stateful; edits are sent to the daemon via pattern.colorOverrides.
 */

export interface PaletteSlot {
  slot: string;
  label: string;
  default: string;
}

export const STATEFUL_PALETTES: Record<string, PaletteSlot[]> = {
  'minecraft-clouds': [
    { slot: 'sky-top',    label: 'Céu (topo)',  default: '#0028b4' },
    { slot: 'sky-bottom', label: 'Céu (meio)',  default: '#0064dc' },
    { slot: 'cloud',      label: 'Nuvem',       default: '#ffffff' },
    { slot: 'sun',        label: 'Sol',         default: '#ff3c00' },
    { slot: 'grass',      label: 'Grama',       default: '#00ff00' },
    { slot: 'dirt',       label: 'Terra',       default: '#b44600' },
  ],
};

/** Quick check for the PresetEditor: does this animType have editable
 *  palette slots? */
export function hasStatefulPalette(animType: string): boolean {
  return Object.prototype.hasOwnProperty.call(STATEFUL_PALETTES, animType);
}
