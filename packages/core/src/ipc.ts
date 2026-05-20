import { z } from 'zod';

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB');
export type HexColor = z.infer<typeof HexColorSchema>;

export const FirmwareEffectNameSchema = z.enum([
  'fw-static',
  'fw-rainbow',
  'fw-snake',
  'fw-sine-wave',
  'fw-star-twinkle',
  'fw-rainbow-blossom',
  'fw-waterfall',
  'fw-wheel',
]);
export type FirmwareEffectName = z.infer<typeof FirmwareEffectNameSchema>;

export const FirmwareEffectParamsSchema = z.object({
  speed: z.number().int().min(0).max(255).optional(),
  brightness: z.number().int().min(0).max(255).optional(),
  direction: z.enum(['forward', 'reverse']).optional(),
  color: HexColorSchema.optional(),
  density: z.number().int().min(0).max(255).optional(),
});
export type FirmwareEffectParams = z.infer<typeof FirmwareEffectParamsSchema>;

export const EffectDescriptorSchema = z.object({
  name: FirmwareEffectNameSchema,
  description: z.string(),
});
export type EffectDescriptor = z.infer<typeof EffectDescriptorSchema>;

export const ProfileSchema = z.object({
  name: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  effect: z.object({
    name: FirmwareEffectNameSchema,
    params: FirmwareEffectParamsSchema,
  }),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const DeviceStatusSchema = z.object({
  connected: z.boolean(),
  vid: z.number().int(),
  pid: z.number().int(),
  serial: z.string().optional(),
  firmware: z.string().optional(),
});
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

export const ALL_ANIM_TYPES = [
  'solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave',
  'pong', 'snake', 'tetris', 'matrix-rain', 'breakout',
  'fireworks', 'dvd', 'heart-rate', 'equalizer', 'rule30',
  'cpu-thermal', 'minecraft-day', 'aquarium', 'pong-interactive',
  'pong-multiplayer', 'snake-interactive', 'breakout-interactive', 'pacman',
  'doom', 'minecraft-clouds', 'space-invaders', 'mario', 'genius',
  'ripple', 'spark', 'binary-clock', 'doom-fire',
  'whac-a-mole', 'bullet-hell', 'drag-race', 'frogger', 'wordle',
  'keyboard-crawl', 'cursed',
] as const;
export const AnimTypeSchema = z.enum(ALL_ANIM_TYPES);
/** Single source of truth for animation type names — derived from the Zod
 *  schema so adding a new type only requires editing ALL_ANIM_TYPES. */
export type AnimType = z.infer<typeof AnimTypeSchema>;

// K617 has 61 keys with ledIndex 0..60. Reject keys outside that range so a
// rogue client can't corrupt the per-key Map with bogus indexes. We validate
// the record's keys via superRefine because zod 3's z.record() does not
// validate keys against a refined schema directly.
function validateLedIndexKeys(rec: Record<string, unknown>, ctx: z.RefinementCtx): void {
  for (const k of Object.keys(rec)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 0 || n > 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message: `ledIndex key must be an integer in [0, 60], got "${k}"`,
      });
    }
  }
}

export const KeysSchema = z.record(HexColorSchema).superRefine((rec, ctx) => {
  validateLedIndexKeys(rec, ctx);
});

export const PatternSchema = z.object({
  keys: KeysSchema,
  animType: AnimTypeSchema,
  animSpeed: z.number().min(0).max(1),
  sequence: z.array(z.number().int().min(0).max(60)).optional(),
  /** 0.4..2.0, default 1. Daemon-side vibrancy multiplier applied to every
   *  rendered color. Lets stateful animations (Minecraft, Aquarium, games)
   *  honour the global tonality slider that already affects color-bearing
   *  presets via client-side transformation. */
  vibrancy: z.number().min(0.1).max(3).optional(),
  /** Per-palette-slot color overrides for stateful animations. Each engine
   *  defines its own slot names (e.g. minecraft-clouds: 'sky-top',
   *  'sky-bottom', 'grass', 'dirt', 'sun', 'cloud'). Values that aren't
   *  present fall back to engine defaults. */
  colorOverrides: z.record(z.string(), HexColorSchema).optional(),
});
export type Pattern = z.infer<typeof PatternSchema>;
/** @deprecated use Pattern */
export type IpcPattern = Pattern;

export const RpcMethods = {
  'device.status': {
    params: z.object({}).strict(),
    result: DeviceStatusSchema,
  },
  'effect.list': {
    params: z.object({}).strict(),
    result: z.array(EffectDescriptorSchema),
  },
  'effect.run': {
    params: z.object({ name: FirmwareEffectNameSchema, params: FirmwareEffectParamsSchema.default({}) }),
    result: z.object({ ok: z.literal(true) }),
  },
  'effect.stop': {
    params: z.object({}).strict(),
    result: z.object({ ok: z.literal(true) }),
  },
  'effect.current': {
    params: z.object({}).strict(),
    result: z.object({
      name: FirmwareEffectNameSchema,
      params: FirmwareEffectParamsSchema,
      startedAt: z.string().datetime(),
    }).nullable(),
  },
  'solid.set': {
    params: z.object({ color: HexColorSchema }),
    result: z.object({ ok: z.literal(true) }),
  },
  'profile.list': {
    params: z.object({}).strict(),
    result: z.array(ProfileSchema),
  },
  'profile.activate': {
    params: z.object({ name: z.string() }),
    result: z.object({ ok: z.literal(true) }),
  },
  'profile.save': {
    params: z.object({ name: z.string(), profile: ProfileSchema.omit({ createdAt: true }) }),
    result: z.object({ ok: z.literal(true) }),
  },
  'profile.delete': {
    params: z.object({ name: z.string() }),
    result: z.object({ ok: z.literal(true) }),
  },
  'daemon.version': {
    params: z.object({}).strict(),
    result: z.object({ version: z.string(), buildHash: z.string() }),
  },
  'daemon.shutdown': {
    params: z.object({}).strict(),
    result: z.object({ ok: z.literal(true) }),
  },
  'perkey.set': {
    params: z.object({
      // ledIndex (as string) → #RRGGBB hex color. Keys validated to be 0..60.
      colors: KeysSchema,
    }),
    result: z.object({ ok: z.literal(true) }),
  },
  'perkey.startPattern': {
    params: PatternSchema,
    result: z.object({ ok: z.literal(true) }),
  },
  'perkey.stopPattern': {
    params: z.object({}).strict(),
    result: z.object({ ok: z.literal(true) }),
  },
  /**
   * Send a game input to whatever interactive engine is currently streaming.
   * Right now only pong-interactive cares — slot 0..3 maps to the player's
   * paddle Y position (top to bottom on the left edge of the K617:
   * Tab=0, Caps=1, LShift=2, LCtrl=3).
   */
  'perkey.gameInput': {
    params: z.object({
      paddleSlot: z.number().int().min(0).max(3).optional(),
    }),
    result: z.object({ ok: z.literal(true) }),
  },
  'perkey.current': {
    params: z.object({}).strict(),
    result: z.union([
      z.object({ mode: z.literal('off') }),
      z.object({
        mode: z.literal('static'),
        colors: KeysSchema,
      }),
      z.object({
        mode: z.literal('pattern'),
        pattern: PatternSchema,
      }),
    ]),
  },
} as const;

export type RpcMethodName = keyof typeof RpcMethods;
export type RpcParams<M extends RpcMethodName> = z.infer<(typeof RpcMethods)[M]['params']>;
export type RpcResult<M extends RpcMethodName> = z.infer<(typeof RpcMethods)[M]['result']>;

export const RpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.unknown().optional(),
});

export const RpcResponseSuccess = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.unknown(),
});

export const RpcResponseError = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).nullable(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});

export const RpcResponse = z.union([RpcResponseSuccess, RpcResponseError]);

export const RpcNotification = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.unknown().optional(),
});

export const RPC_ERR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export function socketPath(): string {
  const runtime = process.env['XDG_RUNTIME_DIR'];
  if (runtime && runtime.length > 0) return `${runtime}/fizz.sock`;
  const uid = process.getuid ? process.getuid() : 1000;
  return `/run/user/${uid}/fizz.sock`;
}
