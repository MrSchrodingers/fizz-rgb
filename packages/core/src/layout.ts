export interface KeyDef {
  name: string;
  row: number;
  col: number;
  width: number;
  ledIndex: number;
}

const ROW_0 = [
  { name: 'Escape', w: 1 }, { name: '1', w: 1 }, { name: '2', w: 1 }, { name: '3', w: 1 },
  { name: '4', w: 1 }, { name: '5', w: 1 }, { name: '6', w: 1 }, { name: '7', w: 1 },
  { name: '8', w: 1 }, { name: '9', w: 1 }, { name: '0', w: 1 }, { name: 'Minus', w: 1 },
  { name: 'Equal', w: 1 }, { name: 'Backspace', w: 2 },
];
const ROW_1 = [
  { name: 'Tab', w: 1.5 }, { name: 'Q', w: 1 }, { name: 'W', w: 1 }, { name: 'E', w: 1 },
  { name: 'R', w: 1 }, { name: 'T', w: 1 }, { name: 'Y', w: 1 }, { name: 'U', w: 1 },
  { name: 'I', w: 1 }, { name: 'O', w: 1 }, { name: 'P', w: 1 }, { name: 'LBracket', w: 1 },
  { name: 'RBracket', w: 1 }, { name: 'Backslash', w: 1.5 },
];
const ROW_2 = [
  { name: 'CapsLock', w: 1.75 }, { name: 'A', w: 1 }, { name: 'S', w: 1 }, { name: 'D', w: 1 },
  { name: 'F', w: 1 }, { name: 'G', w: 1 }, { name: 'H', w: 1 }, { name: 'J', w: 1 },
  { name: 'K', w: 1 }, { name: 'L', w: 1 }, { name: 'Semicolon', w: 1 }, { name: 'Quote', w: 1 },
  { name: 'Enter', w: 2.25 },
];
const ROW_3 = [
  { name: 'LShift', w: 2.25 }, { name: 'Z', w: 1 }, { name: 'X', w: 1 }, { name: 'C', w: 1 },
  { name: 'V', w: 1 }, { name: 'B', w: 1 }, { name: 'N', w: 1 }, { name: 'M', w: 1 },
  { name: 'Comma', w: 1 }, { name: 'Period', w: 1 }, { name: 'Slash', w: 1 }, { name: 'RShift', w: 2.75 },
];
const ROW_4 = [
  { name: 'LCtrl', w: 1.25 }, { name: 'LSuper', w: 1.25 }, { name: 'LAlt', w: 1.25 },
  { name: 'Space', w: 6.25 },
  { name: 'RAlt', w: 1.25 }, { name: 'Fn', w: 1.25 }, { name: 'Menu', w: 1.25 }, { name: 'RCtrl', w: 1.25 },
];

const ROWS = [ROW_0, ROW_1, ROW_2, ROW_3, ROW_4];

function buildKeys(): KeyDef[] {
  const result: KeyDef[] = [];
  let ledIndex = 0;
  for (let row = 0; row < ROWS.length; row++) {
    let col = 0;
    for (const k of ROWS[row]!) {
      result.push({ name: k.name, row, col, width: k.w, ledIndex });
      col += k.w;
      ledIndex++;
    }
  }
  return result;
}

const keys = buildKeys();

export const K617_LAYOUT = { rows: ROWS.length, keys } as const;
export const ledCount = keys.length;

const byName = new Map(keys.map((k) => [k.name, k]));
export function keyByName(name: string): KeyDef | undefined {
  return byName.get(name);
}

// ---------------------------------------------------------------------------
// ISO-IT (62-key) layout & hardware LED matrix indices (Redragon K617IT)
// ---------------------------------------------------------------------------

const ISO_IT_ROW_0 = [
  { name: 'Escape', w: 1 }, { name: '1', w: 1 }, { name: '2', w: 1 }, { name: '3', w: 1 },
  { name: '4', w: 1 }, { name: '5', w: 1 }, { name: '6', w: 1 }, { name: '7', w: 1 },
  { name: '8', w: 1 }, { name: '9', w: 1 }, { name: '0', w: 1 }, { name: 'Quote', w: 1 },
  { name: 'Igrave', w: 1 }, { name: 'Backspace', w: 2 },
];
const ISO_IT_ROW_1 = [
  { name: 'Tab', w: 1.5 }, { name: 'Q', w: 1 }, { name: 'W', w: 1 }, { name: 'E', w: 1 },
  { name: 'R', w: 1 }, { name: 'T', w: 1 }, { name: 'Y', w: 1 }, { name: 'U', w: 1 },
  { name: 'I', w: 1 }, { name: 'O', w: 1 }, { name: 'P', w: 1 }, { name: 'Egrave', w: 1 },
  { name: 'Plus', w: 1 },
];
const ISO_IT_ROW_2 = [
  { name: 'CapsLock', w: 1.75 }, { name: 'A', w: 1 }, { name: 'S', w: 1 }, { name: 'D', w: 1 },
  { name: 'F', w: 1 }, { name: 'G', w: 1 }, { name: 'H', w: 1 }, { name: 'J', w: 1 },
  { name: 'K', w: 1 }, { name: 'L', w: 1 }, { name: 'Ograve', w: 1 }, { name: 'Agrave', w: 1 },
  { name: 'Ugrave', w: 1 }, { name: 'Enter', w: 1.25 },
];
const ISO_IT_ROW_3 = [
  { name: 'LShift', w: 1.25 }, { name: 'IntlBackslash', w: 1 }, { name: 'Z', w: 1 }, { name: 'X', w: 1 },
  { name: 'C', w: 1 }, { name: 'V', w: 1 }, { name: 'B', w: 1 }, { name: 'N', w: 1 },
  { name: 'M', w: 1 }, { name: 'Comma', w: 1 }, { name: 'Period', w: 1 }, { name: 'Minus', w: 1 },
  { name: 'RShift', w: 2.75 },
];
const ISO_IT_ROW_4 = ROW_4;

const ISO_IT_ROWS = [ISO_IT_ROW_0, ISO_IT_ROW_1, ISO_IT_ROW_2, ISO_IT_ROW_3, ISO_IT_ROW_4];

function buildIsoItKeys(): KeyDef[] {
  const result: KeyDef[] = [];
  let ledIndex = 0;
  for (let row = 0; row < ISO_IT_ROWS.length; row++) {
    let col = 0;
    for (const k of ISO_IT_ROWS[row]!) {
      result.push({ name: k.name, row, col, width: k.w, ledIndex });
      col += k.w;
      ledIndex++;
    }
  }
  return result;
}

export const K617_ISO_IT_LAYOUT = { rows: ISO_IT_ROWS.length, keys: buildIsoItKeys() } as const;

/**
 * Hardware LED matrix indices for Redragon Fizz K617 ISO-IT (62 keys),
 * verified via USBPcap capture from the official K617IT software.
 */
export const K617_ISO_IT_MATRIX: Record<string, number> = {
  // Row 0
  Escape: 0x15, '1': 0x16, '2': 0x17, '3': 0x18, '4': 0x19, '5': 0x1a,
  '6': 0x1b, '7': 0x1c, '8': 0x1d, '9': 0x1e, '0': 0x1f, Quote: 0x20,
  Igrave: 0x21, Backspace: 0x22,
  // Row 1
  Tab: 0x2a, Q: 0x2b, W: 0x2c, E: 0x2d, R: 0x2e, T: 0x2f, Y: 0x30,
  U: 0x31, I: 0x32, O: 0x33, P: 0x34, Egrave: 0x35, Plus: 0x36,
  // Row 2
  CapsLock: 0x3f, A: 0x40, S: 0x41, D: 0x42, F: 0x43, G: 0x44, H: 0x45,
  J: 0x46, K: 0x47, L: 0x48, Ograve: 0x49, Agrave: 0x4a, Ugrave: 0x4b,
  Enter: 0x4c,
  // Row 3
  LShift: 0x54, IntlBackslash: 0x55, Z: 0x56, X: 0x57, C: 0x58, V: 0x59,
  B: 0x5a, N: 0x5b, M: 0x5c, Comma: 0x5d, Period: 0x5e, Minus: 0x5f,
  RShift: 0x61,
  // Row 4
  LCtrl: 0x69, LSuper: 0x6a, LAlt: 0x6b, Space: 0x6e, RAlt: 0x71,
  Fn: 0x72, Menu: 0x75, RCtrl: 0x76,
};