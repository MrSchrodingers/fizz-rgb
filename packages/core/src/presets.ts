import type { Pattern } from './animations.js';
import { keyByName, K617_LAYOUT } from './layout.js';

export interface Preset {
  id: string;
  name: string;
  description: string;
  category: 'shape' | 'pattern' | 'gradient' | 'theme' | 'game' | 'word';
  pattern: Pattern;
}

// Helper: build a key-color map from a list of (keyName, hex) tuples.
function buildKeys(entries: Array<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, hex] of entries) {
    const k = keyByName(name);
    if (k) out[String(k.ledIndex)] = hex;
  }
  return out;
}

// Helper: same color for all listed keys.
function uniform(keys: string[], color: string): Array<[string, string]> {
  return keys.map((k) => [k, color]);
}

// Helper: ledIndex sequence from key names (for ordered animations).
function seqFromNames(names: string[]): number[] {
  const out: number[] = [];
  for (const name of names) {
    const k = keyByName(name);
    if (k) out.push(k.ledIndex);
  }
  return out;
}

const ALL_KEYS_NAMES = [
  'Escape', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Minus', 'Equal', 'Backspace',
  'Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'LBracket', 'RBracket', 'Backslash',
  'CapsLock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Semicolon', 'Quote', 'Enter',
  'LShift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Comma', 'Period', 'Slash', 'RShift',
  'LCtrl', 'LSuper', 'LAlt', 'Space', 'RAlt', 'Fn', 'Menu', 'RCtrl',
];

// Pre-compute gradient data at module load (no runtime require).
const _layout = K617_LAYOUT;
const _maxCol = Math.max(..._layout.keys.map((k) => k.col + k.width));
const _maxRow = 4;

function _gradientHorizontal(): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const k of _layout.keys) {
    const t = (k.col + k.width / 2) / _maxCol;
    const r = Math.round(255 * (1 - t));
    const b = Math.round(255 * t);
    const hex = '#' + ((r << 16) | (0 << 8) | b).toString(16).padStart(6, '0');
    entries.push([k.name, hex]);
  }
  return buildKeys(entries);
}

function _gradientVertical(): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const k of _layout.keys) {
    const t = k.row / _maxRow;
    const r = Math.round(255 * t);
    const g = Math.round(255 * (1 - t));
    const b = Math.round(128 * t);
    const hex = '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    entries.push([k.name, hex]);
  }
  return buildKeys(entries);
}

function _rainbowKeys(): Record<string, string> {
  return buildKeys(
    ALL_KEYS_NAMES.map((n, i) => {
      const hue = (i / ALL_KEYS_NAMES.length) * 360;
      const c = 1;
      const x = 1 - Math.abs(((hue / 60) % 2) - 1);
      let r1 = 0, g1 = 0, b1 = 0;
      if (hue < 60)       { r1 = c; g1 = x; }
      else if (hue < 120) { r1 = x; g1 = c; }
      else if (hue < 180) { g1 = c; b1 = x; }
      else if (hue < 240) { g1 = x; b1 = c; }
      else if (hue < 300) { r1 = x; b1 = c; }
      else                { r1 = c; b1 = x; }
      const hex =
        '#' +
        ((Math.round(r1 * 255) << 16) | (Math.round(g1 * 255) << 8) | Math.round(b1 * 255))
          .toString(16)
          .padStart(6, '0');
      return [n, hex] as [string, string];
    }),
  );
}

export const BUILTIN_PRESETS: Preset[] = [
  // === Words ===
  {
    id: 'word-debt',
    name: 'DEBT',
    description: 'Letras D-E-B-T destacadas em fúcsia',
    category: 'word',
    pattern: {
      keys: buildKeys(uniform(['D', 'E', 'B', 'T'], '#ff00aa')),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'word-debt-typewriter',
    name: 'DEBT (typewriter)',
    description: 'D, depois E, depois B, depois T aparecendo em loop',
    category: 'word',
    pattern: {
      keys: buildKeys(uniform(['D', 'E', 'B', 'T'], '#ff00aa')),
      animType: 'typewriter',
      animSpeed: 0.4,
      sequence: seqFromNames(['D', 'E', 'B', 'T']),
    },
  },
  {
    id: 'word-fizz-marquee',
    name: 'FIZZ (marquee)',
    description: 'F-I-Z-Z rolando pelo teclado',
    category: 'word',
    pattern: {
      keys: buildKeys(uniform(['F', 'I', 'Z'], '#00ddff')),
      animType: 'marquee',
      animSpeed: 0.5,
      sequence: seqFromNames(['F', 'I', 'Z', 'Z']),
    },
  },

  // === Shapes ===
  {
    id: 'shape-wasd-diamond',
    name: 'WASD',
    description: 'W/A/S/D em diamante (clássico gamer)',
    category: 'shape',
    pattern: {
      keys: buildKeys([
        ['W', '#00ff00'], ['A', '#00ff00'], ['S', '#00ff00'], ['D', '#00ff00'],
      ]),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'shape-plus',
    name: 'Cruz (Plus)',
    description: 'G central + cruz com T/F/H/B',
    category: 'shape',
    pattern: {
      keys: buildKeys([
        ['G', '#ffff00'], ['T', '#ffff00'], ['F', '#ffff00'], ['H', '#ffff00'], ['B', '#ffff00'],
      ]),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'shape-heart',
    name: 'Coração',
    description: 'Forma de coração ao redor das teclas do meio',
    category: 'shape',
    pattern: {
      keys: buildKeys([
        ['R', '#ff0044'], ['Y', '#ff0044'],
        ['T', '#ff2266'],
        ['D', '#ff0044'], ['F', '#ff2266'], ['G', '#ff2266'], ['H', '#ff2266'], ['J', '#ff0044'],
        ['C', '#ff2266'], ['V', '#ff2266'], ['B', '#ff2266'], ['N', '#ff2266'],
        ['Space', '#ff0044'],
      ]),
      animType: 'blink',
      animSpeed: 0.2,
    },
  },
  {
    id: 'shape-x-diagonal',
    name: 'X diagonal',
    description: 'Duas diagonais formando X',
    category: 'shape',
    pattern: {
      keys: buildKeys([
        ['Escape', '#ffaa00'], ['2', '#ffaa00'], ['W', '#ffaa00'], ['D', '#ffaa00'], ['V', '#ffaa00'],
        ['Backspace', '#00aaff'], ['RBracket', '#00aaff'], ['O', '#00aaff'], ['K', '#00aaff'], ['Period', '#00aaff'],
      ]),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'shape-border',
    name: 'Borda',
    description: 'Apenas as teclas do perímetro',
    category: 'shape',
    pattern: {
      keys: buildKeys(
        uniform([
          'Escape', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Minus', 'Equal', 'Backspace',
          'Tab', 'Backslash',
          'CapsLock', 'Enter',
          'LShift', 'RShift',
          'LCtrl', 'LSuper', 'LAlt', 'Space', 'RAlt', 'Fn', 'Menu', 'RCtrl',
        ], '#aa00ff'),
      ),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },

  // === Patterns ===
  {
    id: 'pattern-checkerboard',
    name: 'Xadrez',
    description: 'Padrão alternado roxo/escuro',
    category: 'pattern',
    pattern: {
      keys: buildKeys(
        ALL_KEYS_NAMES.map((n, i) => [n, i % 2 === 0 ? '#cc44ff' : '#220022'] as [string, string]),
      ),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'pattern-row-stripes',
    name: 'Faixas (linhas)',
    description: 'Cada linha do teclado uma cor',
    category: 'pattern',
    pattern: {
      keys: buildKeys([
        ...uniform(['Escape', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Minus', 'Equal', 'Backspace'], '#ff0000'),
        ...uniform(['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'LBracket', 'RBracket', 'Backslash'], '#ff8800'),
        ...uniform(['CapsLock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Semicolon', 'Quote', 'Enter'], '#ffff00'),
        ...uniform(['LShift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Comma', 'Period', 'Slash', 'RShift'], '#00ff44'),
        ...uniform(['LCtrl', 'LSuper', 'LAlt', 'Space', 'RAlt', 'Fn', 'Menu', 'RCtrl'], '#0088ff'),
      ]),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'pattern-blink-all',
    name: 'Pisca-pisca',
    description: 'Todo o teclado piscando branco',
    category: 'pattern',
    pattern: {
      keys: buildKeys(uniform(ALL_KEYS_NAMES, '#ffffff')),
      animType: 'blink',
      animSpeed: 0.3,
    },
  },
  {
    id: 'pattern-chase-rainbow',
    name: 'Chase arco-íris',
    description: 'Cabeçote correndo por todas teclas em arco-íris',
    category: 'pattern',
    pattern: {
      keys: _rainbowKeys(),
      animType: 'chase',
      animSpeed: 0.5,
      sequence: seqFromNames(ALL_KEYS_NAMES),
    },
  },

  // === Gradients ===
  {
    id: 'gradient-horizontal',
    name: 'Gradiente horizontal',
    description: 'Vermelho → azul da esquerda pra direita',
    category: 'gradient',
    pattern: {
      keys: _gradientHorizontal(),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'gradient-vertical',
    name: 'Gradiente vertical',
    description: 'Verde → roxo de cima pra baixo',
    category: 'gradient',
    pattern: {
      keys: _gradientVertical(),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },

  // === Themes ===
  {
    id: 'theme-brazil',
    name: 'Brasil',
    description: 'Verde base, amarelo diamante no centro, azul no Space',
    category: 'theme',
    pattern: {
      keys: buildKeys([
        ...uniform(ALL_KEYS_NAMES.filter((n) => n !== 'Space'), '#00aa00'),
        ['T', '#ffdd00'], ['Y', '#ffdd00'], ['G', '#ffdd00'], ['H', '#ffdd00'],
        ['F', '#ffdd00'], ['J', '#ffdd00'], ['V', '#ffdd00'], ['B', '#ffdd00'], ['N', '#ffdd00'],
        ['Space', '#0033aa'],
      ]),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'theme-rainbow-rows',
    name: 'Arco-íris (wave)',
    description: 'Cada linha uma cor do arco-íris, animado wave',
    category: 'theme',
    pattern: {
      keys: buildKeys([
        ...uniform(['Escape', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Minus', 'Equal', 'Backspace'], '#ff0000'),
        ...uniform(['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'LBracket', 'RBracket', 'Backslash'], '#ff7700'),
        ...uniform(['CapsLock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Semicolon', 'Quote', 'Enter'], '#ffff00'),
        ...uniform(['LShift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Comma', 'Period', 'Slash', 'RShift'], '#00ff00'),
        ...uniform(['LCtrl', 'LSuper', 'LAlt', 'Space', 'RAlt', 'Fn', 'Menu', 'RCtrl'], '#0066ff'),
      ]),
      animType: 'wave',
      animSpeed: 0.3,
    },
  },

  // === Game ===
  {
    id: 'game-fps',
    name: 'FPS Gamer',
    description: 'WASD verde, Space vermelho, Shift azul, R/E/Q amarelo',
    category: 'game',
    pattern: {
      keys: buildKeys([
        ...uniform(['W', 'A', 'S', 'D'], '#00ff00'),
        ['Space', '#ff0000'],
        ['LShift', '#0066ff'], ['LCtrl', '#0066ff'],
        ['R', '#ffaa00'], ['E', '#ffaa00'], ['Q', '#ffaa00'],
        ...uniform(['1', '2', '3', '4', '5'], '#00ffff'),
      ]),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'game-mmo',
    name: 'MMO hotkeys',
    description: '1-9 e Q/E/R/F com cores distintas',
    category: 'game',
    pattern: {
      keys: buildKeys([
        ['1', '#ff0000'], ['2', '#ff8800'], ['3', '#ffff00'], ['4', '#00ff00'], ['5', '#00ffff'],
        ['6', '#0088ff'], ['7', '#8800ff'], ['8', '#ff00ff'], ['9', '#ff0088'],
        ['Q', '#aaaaaa'], ['E', '#aaaaaa'], ['R', '#aaaaaa'], ['F', '#aaaaaa'],
      ]),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
];

export function getPresetById(id: string): Preset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}
