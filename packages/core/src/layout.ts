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
