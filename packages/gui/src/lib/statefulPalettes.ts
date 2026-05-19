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
  // DOOM raycaster: walls + enemies are tinted by distance fade in the
  // engine, so these are the base colors at fade=1 (closest).
  'doom': [
    { slot: 'wall',         label: 'Parede',         default: '#6e6ea0' },
    { slot: 'enemy',        label: 'Inimigo',        default: '#ff0050' },
    { slot: 'floor',        label: 'Chão',           default: '#3c1e05' },
    { slot: 'ammo',         label: 'Munição',        default: '#ffdc00' },
    { slot: 'kill',         label: 'Kills',          default: '#00ff1e' },
    { slot: 'weapon-ready', label: 'Arma pronta',    default: '#00ffff' },
    { slot: 'muzzle',       label: 'Fogo do tiro',   default: '#ffffff' },
  ],
  // Pacman: maze + entities. ghost-fright is the shared "blue" color when
  // a power pellet is active.
  'pacman': [
    { slot: 'pacman',       label: 'Pacman',          default: '#ffdc00' },
    { slot: 'dot',          label: 'Pontos',          default: '#3c3723' },
    { slot: 'pellet',       label: 'Power pellet',    default: '#ffc8b4' },
    { slot: 'wall',         label: 'Parede',          default: '#0e0e5a' },
    { slot: 'ghost-1',      label: 'Blinky (caça)',   default: '#ff003c' },
    { slot: 'ghost-2',      label: 'Pinky (embosca)', default: '#ff78c8' },
    { slot: 'ghost-3',      label: 'Inky (aleatório)',default: '#00dcff' },
    { slot: 'ghost-fright', label: 'Fantasma azul',   default: '#1e3cff' },
  ],
  // Space Invaders.
  'space-invaders': [
    { slot: 'alien',         label: 'Alienígena',  default: '#00ff64' },
    { slot: 'ship',          label: 'Nave',        default: '#64c8ff' },
    { slot: 'player-bullet', label: 'Tiro (você)', default: '#ffffff' },
    { slot: 'alien-bullet',  label: 'Tiro (alien)',default: '#ff5018' },
  ],
  // Super Mario.
  'mario': [
    { slot: 'mario',    label: 'Mario',     default: '#ff1e00' },
    { slot: 'ground',   label: 'Chão',      default: '#823c0a' },
    { slot: 'platform', label: 'Plataforma',default: '#6e5028' },
    { slot: 'coin',     label: 'Moeda',     default: '#ffdc00' },
    { slot: 'goomba',   label: 'Goomba',    default: '#a05000' },
    { slot: 'flag',     label: 'Bandeira',  default: '#00ff32' },
    { slot: 'sky',      label: 'Céu',       default: '#000000' },
  ],
};

/** Quick check for the PresetEditor: does this animType have editable
 *  palette slots? */
export function hasStatefulPalette(animType: string): boolean {
  return Object.prototype.hasOwnProperty.call(STATEFUL_PALETTES, animType);
}
