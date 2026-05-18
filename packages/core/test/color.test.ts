import { describe, it, expect } from 'vitest';
import { Color, parseHex, toHex, hsvToRgb } from '../src/color.ts';

describe('Color', () => {
  it('parseHex parses #RRGGBB', () => {
    expect(parseHex('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('parseHex parses without leading #', () => {
    expect(parseHex('ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('parseHex throws on invalid', () => {
    expect(() => parseHex('xyz')).toThrow();
  });
  it('toHex formats RGB to #RRGGBB', () => {
    expect(toHex({ r: 255, g: 136, b: 0 })).toBe('#ff8800');
  });
  it('toHex pads single hex digits', () => {
    expect(toHex({ r: 1, g: 2, b: 3 })).toBe('#010203');
  });
  it('hsvToRgb red', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual({ r: 255, g: 0, b: 0 });
  });
  it('hsvToRgb black when value=0', () => {
    expect(hsvToRgb(120, 1, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });
  it('Color.black is RGB 0,0,0', () => {
    expect(Color.black).toEqual({ r: 0, g: 0, b: 0 });
  });
});
