import { z } from 'zod';

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB');

export const FirmwareEffectName = z.enum([
  'fw-static',
  'fw-rainbow',
  'fw-snake',
  'fw-sine-wave',
  'fw-star-twinkle',
  'fw-rainbow-blossom',
  'fw-waterfall',
  'fw-wheel',
]);

export const FirmwareEffectParams = z.object({
  speed: z.number().int().min(0).max(255).optional(),
  brightness: z.number().int().min(0).max(255).optional(),
  direction: z.enum(['forward', 'reverse']).optional(),
  color: HexColor.optional(),
  density: z.number().int().min(0).max(255).optional(),
});

export const EffectDescriptor = z.object({
  name: FirmwareEffectName,
  description: z.string(),
});

export const Profile = z.object({
  name: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  effect: z.object({
    name: FirmwareEffectName,
    params: FirmwareEffectParams,
  }),
});

export const DeviceStatus = z.object({
  connected: z.boolean(),
  vid: z.number().int(),
  pid: z.number().int(),
  serial: z.string().optional(),
  firmware: z.string().optional(),
});

export const RpcMethods = {
  'device.status': {
    params: z.object({}).strict(),
    result: DeviceStatus,
  },
  'effect.list': {
    params: z.object({}).strict(),
    result: z.array(EffectDescriptor),
  },
  'effect.run': {
    params: z.object({ name: FirmwareEffectName, params: FirmwareEffectParams.default({}) }),
    result: z.object({ ok: z.literal(true) }),
  },
  'effect.stop': {
    params: z.object({}).strict(),
    result: z.object({ ok: z.literal(true) }),
  },
  'effect.current': {
    params: z.object({}).strict(),
    result: z.object({
      name: FirmwareEffectName,
      params: FirmwareEffectParams,
      startedAt: z.string().datetime(),
    }).nullable(),
  },
  'solid.set': {
    params: z.object({ color: HexColor }),
    result: z.object({ ok: z.literal(true) }),
  },
  'profile.list': {
    params: z.object({}).strict(),
    result: z.array(Profile),
  },
  'profile.activate': {
    params: z.object({ name: z.string() }),
    result: z.object({ ok: z.literal(true) }),
  },
  'profile.save': {
    params: z.object({ name: z.string(), profile: Profile.omit({ createdAt: true }) }),
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
