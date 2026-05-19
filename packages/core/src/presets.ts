import type { Pattern } from './animations.js';
import { keyByName, K617_LAYOUT } from './layout.js';

export interface Preset {
  id: string;
  name: string;
  description: string;
  category: 'shape' | 'pattern' | 'gradient' | 'theme' | 'game' | 'word' | 'brasil' | 'productivity';
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
    name: 'Plus Sign',
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
    name: 'Modifiers',
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
    name: 'Checkerboard',
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
    name: 'Row Stripes',
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
    name: 'Column Stripes',
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
    name: 'Blink',
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
    name: 'Rainbow Chase',
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
    name: 'Left / Right Split',
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
    name: 'Horizontal Gradient',
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
    name: 'Vertical Gradient',
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
    name: 'Brazil',
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
    name: 'Rainbow Wave',
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
    name: 'Cyber Grid',
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
    name: 'Fire',
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
  {
    id: 'game-pong',
    name: 'Pong',
    description: 'Pong rodando de verdade — paddles e bola correndo no teclado',
    category: 'game',
    pattern: {
      keys: {},
      animType: 'pong',
      animSpeed: 0.5,
    },
  },
  {
    id: 'game-snake',
    name: 'Snake',
    description: 'Cobrinha AI come comida pulsante e cresce',
    category: 'game',
    pattern: {
      keys: {},
      animType: 'snake',
      animSpeed: 0.5,
    },
  },
  {
    id: 'game-tetris',
    name: 'Tetris',
    description: 'Tetris sideways — peças entram pela direita, linhas verticais somem',
    category: 'game',
    pattern: {
      keys: {},
      animType: 'tetris',
      animSpeed: 0.5,
    },
  },
  {
    id: 'game-matrix-rain',
    name: 'Matrix Rain',
    description: 'Chuva verde caindo do topo — estilo Matrix',
    category: 'game',
    pattern: { keys: {}, animType: 'matrix-rain', animSpeed: 0.5 },
  },
  {
    id: 'game-breakout',
    name: 'Breakout',
    description: 'Paddle bate bola, quebra tijolos. AI joga sozinho',
    category: 'game',
    pattern: { keys: {}, animType: 'breakout', animSpeed: 0.5 },
  },
  {
    id: 'game-fireworks',
    name: 'Fireworks',
    description: 'Explosões coloridas de partículas em loop',
    category: 'game',
    pattern: { keys: {}, animType: 'fireworks', animSpeed: 0.5 },
  },
  {
    id: 'game-dvd',
    name: 'DVD Bouncer',
    description: 'Tecla brilhante quica nos cantos, mudando de cor',
    category: 'game',
    pattern: { keys: {}, animType: 'dvd', animSpeed: 0.5 },
  },
  {
    id: 'game-heart-rate',
    name: 'Heart Rate',
    description: 'Linha de ECG correndo pelo teclado, com spike QRS',
    category: 'game',
    pattern: { keys: {}, animType: 'heart-rate', animSpeed: 0.5 },
  },
  {
    id: 'game-equalizer',
    name: 'Equalizer',
    description: 'Barras verticais subindo/descendo como visualizer de música',
    category: 'game',
    pattern: { keys: {}, animType: 'equalizer', animSpeed: 0.5 },
  },
  {
    id: 'game-rule30',
    name: 'Rule 30',
    description: 'Autômato 1D de Wolfram — padrões caóticos a partir de uma semente',
    category: 'game',
    pattern: { keys: {}, animType: 'rule30', animSpeed: 0.5 },
  },

  // ── Cinematic / cultural themes ──────────────────────────────────────────
  {
    id: 'theme-cyberpunk',
    name: 'Cyberpunk',
    description: 'Letras ciano, números magenta, modifiers amarelo — Night City',
    category: 'theme',
    pattern: {
      // Layout-aware split: top function/number row magenta, alphanumeric
      // letters ciano, modifiers (Tab/Caps/Shift/Ctrl/Alt/Space) yellow.
      // Slow wave gives the neon a breathing glow instead of strobing.
      keys: (() => {
        const entries: Array<[string, string]> = [];
        const MAGENTA = '#ff2bd6';
        const CYAN = '#00f0ff';
        const YELLOW = '#fcee0a';
        const MODIFIERS = new Set([
          'Escape', 'Tab', 'CapsLock', 'LShift', 'RShift', 'LCtrl', 'RCtrl',
          'LAlt', 'RAlt', 'LSuper', 'Fn', 'Menu', 'Space', 'Enter', 'Backspace',
        ]);
        for (const k of _layout.keys) {
          if (MODIFIERS.has(k.name)) entries.push([k.name, YELLOW]);
          else if (k.row === 0) entries.push([k.name, MAGENTA]);
          else entries.push([k.name, CYAN]);
        }
        return buildKeys(entries);
      })(),
      animType: 'wave',
      animSpeed: 0.18,
    },
  },
  {
    id: 'theme-vaporwave',
    name: 'Vaporwave',
    description: 'Pink + roxo + ciano saturados — A E S T H E T I C',
    category: 'theme',
    pattern: {
      keys: (() => {
        const entries: Array<[string, string]> = [];
        // Stripes by row to give a horizon feel instead of random checker.
        const palette = ['#ff00d4', '#b400ff', '#00d4ff', '#00ff95', '#ffff00'];
        for (const k of _layout.keys) {
          entries.push([k.name, palette[k.row % palette.length]!]);
        }
        return buildKeys(entries);
      })(),
      animType: 'wave',
      animSpeed: 0.3,
    },
  },
  {
    id: 'theme-synthwave',
    name: 'Synthwave',
    description: 'Gradient sunset saturado: roxo→rosa→laranja→amarelo',
    category: 'theme',
    pattern: {
      keys: (() => {
        const entries: Array<[string, string]> = [];
        // Top=céu roxo, descendo até amarelo-laranja no horizonte.
        const palette = ['#2400ff', '#a000ff', '#ff0080', '#ff5e00', '#ffd400'];
        for (const k of _layout.keys) {
          const idx = Math.min(palette.length - 1, Math.floor((k.row / _maxRow) * palette.length));
          entries.push([k.name, palette[idx]!]);
        }
        return buildKeys(entries);
      })(),
      animType: 'wave',
      animSpeed: 0.4,
    },
  },
  {
    id: 'theme-tron',
    name: 'Tron Grid',
    description: 'Ciano com linha branca correndo — light cycle trail',
    category: 'theme',
    pattern: {
      // Ciano base + faixa branca a cada 3 colunas pro chase ter contraste
      // (sem isso vira chuva monocromática).
      keys: (() => {
        const entries: Array<[string, string]> = [];
        for (const k of _layout.keys) {
          entries.push([k.name, Math.floor(k.col) % 3 === 0 ? '#ffffff' : '#00f0ff']);
        }
        return buildKeys(entries);
      })(),
      animType: 'chase',
      animSpeed: 0.55,
      sequence: (() => {
        const seq: number[] = [];
        for (let r = 0; r < 5; r++) {
          const row = _layout.keys.filter((k) => k.row === r);
          row.sort((a, b) => a.col - b.col);
          for (const k of row) seq.push(k.ledIndex);
        }
        return seq;
      })(),
    },
  },
  {
    id: 'theme-aurora',
    name: 'Aurora',
    description: 'Ondas verdes/teal/roxas — northern lights',
    category: 'theme',
    pattern: {
      keys: (() => {
        const entries: Array<[string, string]> = [];
        // Verdes e roxos vivos pra aurora ler bem mesmo dimm no wave.
        const palette = ['#00ff88', '#00ffd5', '#0099ff', '#a020f0', '#ff00d4'];
        for (const k of _layout.keys) {
          const idx = Math.abs(Math.floor(k.col) + Math.floor(k.row)) % palette.length;
          entries.push([k.name, palette[idx]!]);
        }
        return buildKeys(entries);
      })(),
      animType: 'wave',
      animSpeed: 0.25,
    },
  },
  {
    id: 'theme-forest-fire',
    name: 'Forest Fire',
    description: 'Chamas amarelo→laranja→vermelho subindo',
    category: 'theme',
    pattern: {
      keys: (() => {
        const entries: Array<[string, string]> = [];
        // Brasa quente: amarelo brilhante no topo (chama), vermelho profundo na base.
        const palette = ['#ffff00', '#ffaa00', '#ff5500', '#ff0000', '#990000'];
        for (const k of _layout.keys) {
          const heat = (_maxRow - k.row) / _maxRow;
          const idx = Math.min(palette.length - 1, Math.floor(heat * palette.length));
          entries.push([k.name, palette[idx]!]);
        }
        return buildKeys(entries);
      })(),
      animType: 'flag-wave',
      animSpeed: 0.55,
    },
  },

  // ── Brasil ───────────────────────────────────────────────────────────────
  {
    id: 'brasil-flag',
    name: 'Brazil Flag',
    description: 'Verde + amarelo (losango) + azul (círculo central)',
    category: 'brasil',
    pattern: {
      keys: (() => {
        const entries: Array<[string, string]> = [];
        for (const k of _layout.keys) {
          // Distance from center of keyboard for the "circle" inside the losango
          const cx = _maxCol / 2;
          const cy = _maxRow / 2;
          const dx = (k.col + k.width / 2) - cx;
          const dy = k.row - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Approximate diamond by max(|dx|, |dy|*aspect)
          const aspect = _maxCol / _maxRow / 2;
          const diamond = Math.max(Math.abs(dx) / aspect, Math.abs(dy)) <= 1.6;
          let color = '#009c3b'; // verde
          if (diamond) color = '#ffdf00'; // amarelo
          if (dist < 1.6) color = '#002776'; // azul
          entries.push([k.name, color]);
        }
        return buildKeys(entries);
      })(),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'brasil-carnaval',
    name: 'Carnival',
    description: 'Faixas coloridas em chase — cores caminham pelo teclado',
    category: 'brasil',
    pattern: {
      // Coluna define cor: cria faixas verticais que viajam horizontalmente
      // via animType=chase. Bem mais "samba" do que strobe.
      keys: (() => {
        const entries: Array<[string, string]> = [];
        const palette = ['#ff006e', '#ffbe0b', '#3a86ff', '#06ffa5', '#8338ec', '#fb5607', '#ff4081'];
        for (const k of _layout.keys) {
          entries.push([k.name, palette[Math.floor(k.col) % palette.length]!]);
        }
        return buildKeys(entries);
      })(),
      animType: 'chase',
      animSpeed: 0.6,
      sequence: (() => {
        // Snake order: row 0 L→R, row 1 R→L, etc. — chase ripples through
        // the whole keyboard like a samba line, not random ledIndex order.
        const seq: number[] = [];
        for (let r = 0; r < 5; r++) {
          const row = _layout.keys.filter((k) => k.row === r);
          row.sort((a, b) => r % 2 === 0 ? a.col - b.col : b.col - a.col);
          for (const k of row) seq.push(k.ledIndex);
        }
        return seq;
      })(),
    },
  },
  {
    id: 'brasil-festa-junina',
    name: 'June Festival',
    description: 'Chamas de fogueira: laranja embaixo, amarelo em cima, flag-wave',
    category: 'brasil',
    pattern: {
      // Fogueira ascendente: vermelho-laranja nas linhas baixas, amarelo
      // nas linhas altas. flag-wave faz o flicker horizontal lembrar chama.
      keys: (() => {
        const entries: Array<[string, string]> = [];
        const palette = ['#ffea5e', '#ffd23f', '#ff8a00', '#ff4d00', '#c41e00'];
        for (const k of _layout.keys) {
          // row 0 (top) = brasa amarela; row 4 = brasa vermelha
          const t = Math.min(palette.length - 1, k.row);
          entries.push([k.name, palette[t]!]);
        }
        return buildKeys(entries);
      })(),
      animType: 'flag-wave',
      animSpeed: 0.55,
    },
  },
  {
    id: 'brasil-independencia',
    name: 'Independence Day',
    description: 'Verde + amarelo em wave vertical patriótica',
    category: 'brasil',
    pattern: {
      keys: (() => {
        const entries: Array<[string, string]> = [];
        for (const k of _layout.keys) {
          entries.push([k.name, k.row % 2 === 0 ? '#009c3b' : '#ffdf00']);
        }
        return buildKeys(entries);
      })(),
      animType: 'wave',
      animSpeed: 0.4,
    },
  },
  {
    id: 'brasil-halloween',
    name: 'Halloween',
    description: 'Laranja em cima, roxo embaixo — drift fantasmagórico (wave lenta)',
    category: 'brasil',
    pattern: {
      // Gradient vertical: top rows = abóbora laranja, bottom = roxo místico.
      // wave lento dá um drift de fantasma sem strobe.
      keys: (() => {
        const entries: Array<[string, string]> = [];
        for (const k of _layout.keys) {
          const t = k.row / _maxRow; // 0 top → 1 bottom
          const palette = ['#ff8a17', '#ff6a00', '#ff2db5', '#9b2cff', '#3a0ca3'];
          const idx = Math.min(palette.length - 1, Math.floor(t * palette.length));
          entries.push([k.name, palette[idx]!]);
        }
        return buildKeys(entries);
      })(),
      animType: 'wave',
      animSpeed: 0.22,
    },
  },

  // ── Productivity / coding ────────────────────────────────────────────────
  {
    id: 'prod-vim',
    name: 'Vim Mode',
    description: 'HJKL + Esc + : destacados, resto dim',
    category: 'productivity',
    pattern: {
      keys: (() => {
        const dim: Array<[string, string]> = ALL_KEYS_NAMES.map((n) => [n, '#101015']);
        const highlight: Array<[string, string]> = [
          ['H', '#3ddc97'], ['J', '#3ddc97'], ['K', '#3ddc97'], ['L', '#3ddc97'],
          ['Escape', '#ff5c5c'],
          ['Semicolon', '#ffd60a'], // : key
          ['I', '#0a84ff'], // insert
          ['V', '#bf5af2'], // visual
        ];
        return buildKeys([...dim, ...highlight]);
      })(),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'prod-wasd',
    name: 'WASD Gaming',
    description: 'WASD vibrante, ESDF dim, Space red, Shift cyan',
    category: 'productivity',
    pattern: {
      keys: (() => {
        const dim: Array<[string, string]> = ALL_KEYS_NAMES.map((n) => [n, '#0a0a10']);
        const highlight: Array<[string, string]> = [
          ['W', '#ff006e'], ['A', '#ff006e'], ['S', '#ff006e'], ['D', '#ff006e'],
          ['Space', '#ff5c5c'],
          ['LShift', '#00f0ff'], ['LCtrl', '#00f0ff'],
          ['1', '#ffd60a'], ['2', '#ffd60a'], ['3', '#ffd60a'], ['4', '#ffd60a'], ['5', '#ffd60a'],
          ['Q', '#bf5af2'], ['E', '#bf5af2'], ['R', '#bf5af2'], ['F', '#bf5af2'],
        ];
        return buildKeys([...dim, ...highlight]);
      })(),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'prod-vscode',
    name: 'VS Code',
    description: 'Modifiers + shortcuts comuns iluminados',
    category: 'productivity',
    pattern: {
      keys: (() => {
        const dim: Array<[string, string]> = ALL_KEYS_NAMES.map((n) => [n, '#0a0a14']);
        const highlight: Array<[string, string]> = [
          ['LCtrl', '#0a84ff'], ['RCtrl', '#0a84ff'],
          ['LShift', '#0a84ff'], ['RShift', '#0a84ff'],
          ['LAlt', '#0a84ff'],
          ['P', '#34c759'], // Ctrl+P quick open
          ['S', '#34c759'], // Ctrl+S save
          ['F', '#34c759'], // Ctrl+F find
          ['T', '#34c759'], // Ctrl+T tab
          ['Slash', '#ffd60a'], // Ctrl+/ comment
          ['Escape', '#ff5c5c'],
        ];
        return buildKeys([...dim, ...highlight]);
      })(),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },
  {
    id: 'prod-touch-typing',
    name: 'Touch Typing',
    description: 'Home row verde · top yellow · bottom red',
    category: 'productivity',
    pattern: {
      keys: (() => {
        const entries: Array<[string, string]> = [];
        const homeRow = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Semicolon', 'Quote'];
        const topRow = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'LBracket', 'RBracket'];
        const bottomRow = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Comma', 'Period', 'Slash'];
        for (const n of homeRow) entries.push([n, '#34c759']);
        for (const n of topRow) entries.push([n, '#ffd60a']);
        for (const n of bottomRow) entries.push([n, '#ff5c5c']);
        // Index finger anchors brighter
        entries.push(['F', '#06ffa5']);
        entries.push(['J', '#06ffa5']);
        return buildKeys(entries);
      })(),
      animType: 'solid',
      animSpeed: 0.5,
    },
  },

  // ── Pattern visuals (host-streamed simple anims) ─────────────────────────
  {
    id: 'pattern-dna-helix',
    name: 'DNA Helix',
    description: 'Dupla hélice rotating em wave',
    category: 'pattern',
    pattern: {
      keys: (() => {
        const entries: Array<[string, string]> = [];
        for (const k of _layout.keys) {
          // Two helical strands phase-shifted: row+col parity controls which color
          const strand = ((k.col + k.row) % 2) === 0;
          entries.push([k.name, strand ? '#00f0ff' : '#ff006e']);
        }
        return buildKeys(entries);
      })(),
      animType: 'wave',
      animSpeed: 0.55,
    },
  },
  {
    id: 'pattern-plasma',
    name: 'Plasma Fluid',
    description: 'Blob colorido fluindo entre as teclas',
    category: 'pattern',
    pattern: {
      keys: (() => {
        const entries: Array<[string, string]> = [];
        // Plasma elétrico com saturação alta.
        const palette = ['#5500ff', '#a000ff', '#ff00ff', '#ff0066', '#ff3399'];
        for (const k of _layout.keys) {
          const idx = Math.abs(Math.floor(k.col) + Math.floor(k.row) * 3) % palette.length;
          entries.push([k.name, palette[idx]!]);
        }
        return buildKeys(entries);
      })(),
      animType: 'wave',
      animSpeed: 0.35,
    },
  },
  {
    id: 'pattern-heart-pulse',
    name: 'Heart Pulse',
    description: 'Vermelho profundo nas bordas, rosa quente no centro — pulso suave',
    category: 'pattern',
    pattern: {
      // Gradient radial-ish: keys do centro vermelho vivo, bordas vermelho
      // escuro. wave em velocidade baixa dá pulso de coração sem strobe.
      keys: (() => {
        const entries: Array<[string, string]> = [];
        const cx = _maxCol / 2;
        const cy = _maxRow / 2;
        const maxDist = Math.sqrt(cx * cx + cy * cy);
        for (const k of _layout.keys) {
          const dx = (k.col + k.width / 2) - cx;
          const dy = k.row - cy;
          const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / maxDist);
          // Center #ff5b8e, edges #6b0024
          const hot: [number, number, number] = [0xff, 0x5b, 0x8e];
          const dark: [number, number, number] = [0x6b, 0x00, 0x24];
          const r = Math.round(hot[0] + (dark[0] - hot[0]) * t);
          const g = Math.round(hot[1] + (dark[1] - hot[1]) * t);
          const b = Math.round(hot[2] + (dark[2] - hot[2]) * t);
          entries.push([k.name, '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')]);
        }
        return buildKeys(entries);
      })(),
      animType: 'wave',
      animSpeed: 0.15,
    },
  },
  {
    id: 'pattern-typewriter-hello',
    name: '"Hello" typewriter',
    description: 'H-E-L-L-O aparece letra por letra em loop',
    category: 'pattern',
    pattern: {
      keys: buildKeys([['H', '#ff5e9f'], ['E', '#5eaaff'], ['L', '#5effb1'], ['O', '#ffea5e']]),
      animType: 'typewriter',
      animSpeed: 0.4,
      sequence: seqFromNames(['H', 'E', 'L', 'L', 'O']),
    },
  },

  // ── System / live data ───────────────────────────────────────────────────
  {
    id: 'game-cpu-thermal',
    name: 'CPU Thermal',
    description: 'Heatmap em tempo real lendo /sys/class/thermal — azul=frio, vermelho=quente',
    category: 'game',
    pattern: { keys: {}, animType: 'cpu-thermal', animSpeed: 0.5 },
  },

  // ── Interactive games ────────────────────────────────────────────────────
  {
    id: 'game-pong-interactive',
    name: 'Pong (you vs AI)',
    description: 'Você joga no lado esquerdo (Tab/Caps/Shift/Ctrl). Placar na fileira 1-9. Vermelho = você, azul = AI',
    category: 'game',
    pattern: { keys: {}, animType: 'pong-interactive', animSpeed: 0.5 },
  },
  {
    id: 'game-pong-multiplayer',
    name: 'Pong (2 players)',
    description: 'P1 vermelho: Tab/Caps/Shift/Ctrl · P2 azul: Backslash/Enter/RShift/RCtrl · placar na fileira 1-9',
    category: 'game',
    pattern: { keys: {}, animType: 'pong-multiplayer', animSpeed: 0.5 },
  },
  {
    id: 'game-snake-interactive',
    name: 'Snake (WASD)',
    description: 'Cobrinha verde se move continuamente. WASD muda direção. Pega a comida vermelha pra crescer',
    category: 'game',
    pattern: { keys: {}, animType: 'snake-interactive', animSpeed: 0.5 },
  },
  {
    id: 'game-breakout-interactive',
    name: 'Breakout (A/D)',
    description: 'A/D move o paddle ciano. Quebra todos os blocos vermelhos+laranja sem deixar a bolinha cair',
    category: 'game',
    pattern: { keys: {}, animType: 'breakout-interactive', animSpeed: 0.5 },
  },
  {
    id: 'game-pacman',
    name: 'Pacman (WASD)',
    description: 'No início escolha a dificuldade 1-5 (teclas 1 a 5). WASD move o Pacman pelo labirinto. Coma os pontos, pegue os power pellets nas quinas pra deixar os fantasmas azuis (comíveis!). No fácil é só 1 fantasma; sobe até 3 no difícil. 5 fases, 3 vidas',
    category: 'game',
    pattern: { keys: {}, animType: 'pacman', animSpeed: 0.5 },
  },
  {
    id: 'game-doom',
    name: 'DOOM',
    description: 'FPS raycaster. W=frente, S=trás, A/D=girar, Space=atirar. Kills (verde) fileira 1-7. Ammo (amarelo) 0/-/=/Backspace. Imps vermelhos não atacam — apenas alvos',
    category: 'game',
    pattern: { keys: {}, animType: 'doom', animSpeed: 0.5 },
  },
  {
    id: 'game-space-invaders',
    name: 'Space Invaders',
    description: 'No início escolha a dificuldade 1-5 (teclas 1 a 5). A/D move a nave (fileira de baixo), Space atira. A formação desce devagar (mais devagar no fácil) — destrua todos antes que cheguem. 4 ondas, 3 vidas',
    category: 'game',
    pattern: { keys: {}, animType: 'space-invaders', animSpeed: 0.5 },
  },
  {
    id: 'game-mario',
    name: 'Super Mario',
    description: 'No início escolha a dificuldade 1-5 (teclas 1 a 5). A/D anda, Space pula (segura pra pular mais alto). Pule nos goombas pra esmagá-los, pegue moedas, evite os buracos e chegue na bandeira verde. 2 fases, 3 vidas',
    category: 'game',
    pattern: { keys: {}, animType: 'mario', animSpeed: 0.5 },
  },
  {
    id: 'game-genius',
    name: 'Genius (memória)',
    description: 'O clássico Genius/Simon, agora por teclas individuais. Escolha a dificuldade 1-5 (define a velocidade E quantas teclas entram em jogo — 6 no fácil, 20 no difícil). As teclas-pad acendem fraquinho com cores próprias; o jogo pisca uma sequência e você repete apertando exatamente essas teclas. Cada acerto aumenta a sequência; errar reinicia',
    category: 'game',
    pattern: { keys: {}, animType: 'genius', animSpeed: 0.5 },
  },

  // ── Themed cycles (host-streamed, layout-aware) ──────────────────────────
  {
    id: 'theme-minecraft',
    name: 'Minecraft Day/Night',
    description: 'Chão verde, céu azul, sol cruza o céu, nuvens brancas, depois noite com lua e estrelas',
    category: 'theme',
    pattern: { keys: {}, animType: 'minecraft-day', animSpeed: 0.5 },
  },
  {
    id: 'theme-minecraft-clouds',
    name: 'Minecraft Clouds',
    description: 'Dia eterno: céu azul, sol no centro, nuvens brancas drifting, grama + terra. Modo ambient calmo sem o ciclo noite',
    category: 'theme',
    pattern: { keys: {}, animType: 'minecraft-clouds', animSpeed: 0.5 },
  },
  {
    id: 'theme-aquarium',
    name: 'Aquarium',
    description: 'Água em gradient, bolhas subindo do fundo, peixinho cruzando',
    category: 'theme',
    pattern: { keys: {}, animType: 'aquarium', animSpeed: 0.5 },
  },
];

export function getPresetById(id: string): Preset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}
