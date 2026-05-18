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

export const AnimTypeSchema = z.enum(['solid', 'blink', 'chase', 'wave', 'typewriter', 'marquee', 'flag-wave', 'pong', 'snake', 'tetris', 'matrix-rain', 'breakout', 'fireworks', 'dvd', 'heart-rate', 'equalizer', 'rule30']);

export const PatternSchema = z.object({
  keys: z.record(z.string(), HexColorSchema),
  animType: AnimTypeSchema,
  animSpeed: z.number().min(0).max(1),
  sequence: z.array(z.number().int().min(0).max(60)).optional(),
});
// IpcPattern is the Zod-validated shape of a Pattern over the wire.
// The canonical Pattern interface lives in animations.ts.
export type IpcPattern = z.infer<typeof PatternSchema>;

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
      // ledIndex (as string) → #RRGGBB hex color
      colors: z.record(z.string(), HexColorSchema),
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
