import type { FirmwareEffectName } from '@fizz/core';

export interface EffectMeta {
  name: FirmwareEffectName;
  label: string;
  description: string;
  acceptsColor: boolean;
  acceptsSpeed: boolean;
  acceptsBrightness: boolean;
  acceptsDirection: boolean;
  acceptsDensity: boolean;
}

export const EFFECT_META: Record<FirmwareEffectName, EffectMeta> = {
  'fw-static':           { name: 'fw-static',           label: 'Static',           description: 'Solid color',          acceptsColor: true,  acceptsSpeed: false, acceptsBrightness: true,  acceptsDirection: false, acceptsDensity: false },
  'fw-rainbow':          { name: 'fw-rainbow',          label: 'Rainbow',          description: 'Rainbow gradient',     acceptsColor: false, acceptsSpeed: true,  acceptsBrightness: true,  acceptsDirection: true,  acceptsDensity: false },
  'fw-snake':            { name: 'fw-snake',            label: 'Snake',            description: 'Snake trail',          acceptsColor: true,  acceptsSpeed: true,  acceptsBrightness: true,  acceptsDirection: false, acceptsDensity: false },
  'fw-sine-wave':        { name: 'fw-sine-wave',        label: 'Sine Wave',        description: 'Sine wave RGB',        acceptsColor: false, acceptsSpeed: true,  acceptsBrightness: true,  acceptsDirection: false, acceptsDensity: false },
  'fw-star-twinkle':     { name: 'fw-star-twinkle',     label: 'Star Twinkle',     description: 'Twinkling stars',      acceptsColor: true,  acceptsSpeed: true,  acceptsBrightness: true,  acceptsDirection: false, acceptsDensity: true  },
  'fw-rainbow-blossom':  { name: 'fw-rainbow-blossom',  label: 'Rainbow Blossom',  description: 'Blossoming rainbow',   acceptsColor: false, acceptsSpeed: true,  acceptsBrightness: true,  acceptsDirection: false, acceptsDensity: false },
  'fw-waterfall':        { name: 'fw-waterfall',        label: 'Waterfall',        description: 'Falling colors',       acceptsColor: true,  acceptsSpeed: true,  acceptsBrightness: true,  acceptsDirection: false, acceptsDensity: false },
  'fw-wheel':            { name: 'fw-wheel',            label: 'Wheel',            description: 'Spinning wheel',       acceptsColor: false, acceptsSpeed: true,  acceptsBrightness: true,  acceptsDirection: true,  acceptsDensity: false },
};

export const EFFECT_ORDER: FirmwareEffectName[] = [
  'fw-rainbow', 'fw-rainbow-blossom', 'fw-snake', 'fw-sine-wave',
  'fw-star-twinkle', 'fw-waterfall', 'fw-wheel', 'fw-static',
];
