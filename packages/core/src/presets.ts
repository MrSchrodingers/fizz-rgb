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

// Vertical stripes: color each key by Math.floor(col) % 2.
function _verticalStripes(): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const k of _layout.keys) {
    const color = Math.floor(k.col) % 2 === 0 ? '#ff44aa' : '#221122';
    entries.push([k.name, color]);
  }
  return buildKeys(entries);
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
    id: 'shape-frame',
    name: 'Frame',
    description: 'Apenas as teclas do perímetro em ciano, piscando devagar — moldura hollow',
    category: 'shape',
    pattern: {
      keys: buildKeys(
        uniform([
          'Escape', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Minus', 'Equal', 'Backspace',
          'Tab', 'Backslash',
          'CapsLock', 'Enter',
          'LShift', 'RShift',
          'LCtrl', 'LSuper', 'LAlt', 'Space', 'RAlt', 'Fn', 'Menu', 'RCtrl',
        ], '#00ffff'),
      ),
      animType: 'blink',
      animSpeed: 0.2,
    },
  },
  {
    id: 'zone-modifiers',
    name: 'Modificadores',
    description: 'Todas as teclas modificadoras em laranja — referência visual para power users',
    category: 'shape',
    pattern: {
      keys: buildKeys(
        uniform([
          'Escape', 'Tab', 'CapsLock', 'LShift', 'RShift',
          'LCtrl', 'RCtrl', 'LAlt', 'RAlt', 'LSuper', 'Fn', 'Menu',
          'Backspace', 'Enter', 'Space',
        ], '#ff7700'),
      ),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'zone-typing-row',
    name: 'Home Row',
    description: 'Home row destacada para treino muscular — A/S/D/F/J/K/L/; verde, G/H verde escuro',
    category: 'shape',
    pattern: {
      keys: buildKeys([
        ...uniform(['A', 'S', 'D', 'F', 'J', 'K', 'L', 'Semicolon'], '#00ff44'),
        ...uniform(['G', 'H'], '#004422'),
      ]),
      animType: 'blink',
      animSpeed: 0.15,
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
    id: 'pattern-vertical-stripes',
    name: 'Faixas (colunas)',
    description: 'Colunas alternadas pink/escuro — zebra vertical',
    category: 'pattern',
    pattern: {
      keys: _verticalStripes(),
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
  {
    id: 'zone-left-right',
    name: 'Esquerda / Direita',
    description: 'Metade esquerda magenta, metade direita ciano',
    category: 'pattern',
    pattern: {
      keys: buildKeys([
        // Left half: Escape, 1-5, Tab, Q-T, CapsLock, A-G, LShift, Z-B, LCtrl, LSuper, LAlt
        ...uniform(['Escape', '1', '2', '3', '4', '5'], '#ff00aa'),
        ...uniform(['Tab', 'Q', 'W', 'E', 'R', 'T'], '#ff00aa'),
        ...uniform(['CapsLock', 'A', 'S', 'D', 'F', 'G'], '#ff00aa'),
        ...uniform(['LShift', 'Z', 'X', 'C', 'V', 'B'], '#ff00aa'),
        ...uniform(['LCtrl', 'LSuper', 'LAlt'], '#ff00aa'),
        // Right half: 6-0, Minus, Equal, Backspace, Y-P, LBracket, RBracket, Backslash,
        //             H-L, Semicolon, Quote, Enter, N-M, Comma, Period, Slash, RShift,
        //             Space, RAlt, Fn, Menu, RCtrl
        ...uniform(['6', '7', '8', '9', '0', 'Minus', 'Equal', 'Backspace'], '#00aaff'),
        ...uniform(['Y', 'U', 'I', 'O', 'P', 'LBracket', 'RBracket', 'Backslash'], '#00aaff'),
        ...uniform(['H', 'J', 'K', 'L', 'Semicolon', 'Quote', 'Enter'], '#00aaff'),
        ...uniform(['N', 'M', 'Comma', 'Period', 'Slash', 'RShift'], '#00aaff'),
        ...uniform(['Space', 'RAlt', 'Fn', 'Menu', 'RCtrl'], '#00aaff'),
      ]),
      animType: 'solid',
      animSpeed: 0.5,
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
    description: 'Bandeira: verde base, losango amarelo, círculo azul no centro — animado flag-wave',
    category: 'theme',
    pattern: {
      keys: buildKeys([
        // Green background — all keys not in rhombus or center
        ...uniform(
          ALL_KEYS_NAMES.filter(
            (n) => !['6', '5', '7', 'R', 'T', 'Y', 'U', 'F', 'G', 'H', 'J', 'V', 'B', 'N'].includes(n),
          ),
          '#009c3b',
        ),
        // Yellow rhombus (diamond outline + fill, centered around G/H)
        ['5', '#ffdf00'], ['6', '#ffdf00'], ['7', '#ffdf00'],
        ['R', '#ffdf00'], ['T', '#ffdf00'], ['Y', '#ffdf00'], ['U', '#ffdf00'],
        ['F', '#ffdf00'], ['J', '#ffdf00'],
        ['V', '#ffdf00'], ['N', '#ffdf00'],
        ['B', '#ffdf00'],
        // Blue center circle (overrides yellow at T/Y/G/H — 2×2 square)
        ['T', '#002776'], ['Y', '#002776'], ['G', '#002776'], ['H', '#002776'],
      ]),
      animType: 'flag-wave',
      animSpeed: 0.3,
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
  {
    id: 'theme-cyber',
    name: 'Cyber',
    description: 'Base roxa profunda + ciano nos números + verde em WASD — look cyberpunk gaming',
    category: 'theme',
    pattern: {
      keys: buildKeys([
        // Deep purple base on all keys
        ...uniform(ALL_KEYS_NAMES, '#3a0066'),
        // Cyan accent on number row
        ...uniform(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Minus', 'Equal'], '#00ddff'),
        // Bright green on WASD
        ...uniform(['W', 'A', 'S', 'D'], '#00ff44'),
      ]),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'theme-fire',
    name: 'Fogo',
    description: 'Gradiente de fogo — amarelo no topo, vermelho escuro na base — animado flag-wave',
    category: 'theme',
    pattern: {
      keys: buildKeys([
        // Row 0 (top): yellow
        ...uniform(['Escape', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Minus', 'Equal', 'Backspace'], '#ffaa00'),
        // Row 1: orange
        ...uniform(['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'LBracket', 'RBracket', 'Backslash'], '#ff7700'),
        // Row 2: red-orange
        ...uniform(['CapsLock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Semicolon', 'Quote', 'Enter'], '#ff4400'),
        // Row 3: red
        ...uniform(['LShift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Comma', 'Period', 'Slash', 'RShift'], '#dd0000'),
        // Row 4 (bottom): dark red
        ...uniform(['LCtrl', 'LSuper', 'LAlt', 'Space', 'RAlt', 'Fn', 'Menu', 'RCtrl'], '#880000'),
      ]),
      animType: 'flag-wave',
      animSpeed: 0.5,
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
