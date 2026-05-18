import { createServer, type Server, type Socket } from 'node:net';
import { existsSync, unlinkSync, chmodSync } from 'node:fs';
import {
  RpcMethods,
  RPC_ERR,
  type RpcMethodName,
  type FirmwareEffectName,
  type FirmwareEffectParams,
  type Profile,
} from '@fizz/core';
import type { EffectEngine } from './engine.js';
import type { ProfileManager } from './profiles.js';
import type { HidController } from './hid.js';
import { log } from './log.js';

export interface IpcServerOpts {
  socketPath: string;
  engine: EffectEngine;
  profiles: ProfileManager;
  hid: HidController;
}

export class IpcServer {
  private srv: Server | null = null;
  private clients = new Set<Socket>();

  constructor(private readonly opts: IpcServerOpts) {}

  async start(): Promise<void> {
    if (existsSync(this.opts.socketPath)) unlinkSync(this.opts.socketPath);
    this.srv = createServer((sock) => this.handleClient(sock));
    await new Promise<void>((resolve, reject) => {
      this.srv!.once('error', reject);
      this.srv!.listen(this.opts.socketPath, () => {
        chmodSync(this.opts.socketPath, 0o600);
        log.info({ path: this.opts.socketPath }, 'IPC server listening');
        resolve();
      });
    });
    this.opts.engine.onChange((cur) => setImmediate(() => this.broadcast('effect.changed', cur)));
    this.opts.hid.on('connect', () => setImmediate(() => this.broadcast('device.changed', { connected: true })));
    this.opts.hid.on('disconnect', () => setImmediate(() => this.broadcast('device.changed', { connected: false })));
  }

  async stop(): Promise<void> {
    for (const c of this.clients) c.end();
    if (this.srv) {
      await new Promise<void>((resolve) => this.srv!.close(() => resolve()));
      this.srv = null;
    }
    if (existsSync(this.opts.socketPath)) {
      try { unlinkSync(this.opts.socketPath); } catch { /* ignore */ }
    }
  }

  private handleClient(sock: Socket): void {
    this.clients.add(sock);
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        this.handleLine(sock, line).catch((err) => log.error({ err }, 'rpc handler error'));
      }
    });
    sock.on('close', () => this.clients.delete(sock));
    sock.on('error', (err) => { log.warn({ err }, 'client error'); this.clients.delete(sock); });
  }

  private async handleLine(sock: Socket, line: string): Promise<void> {
    if (!line.trim()) return;
    let req: { id?: unknown; method?: string; params?: unknown };
    try { req = JSON.parse(line) as typeof req; }
    catch { this.writeError(sock, null, RPC_ERR.PARSE_ERROR, 'parse error'); return; }

    const id = (req.id ?? null) as string | number | null;
    const method = req.method;
    if (!method || typeof method !== 'string') {
      this.writeError(sock, id, RPC_ERR.INVALID_REQUEST, 'missing method');
      return;
    }
    if (!(method in RpcMethods)) {
      this.writeError(sock, id, RPC_ERR.METHOD_NOT_FOUND, `unknown method: ${method}`);
      return;
    }
    const spec = (RpcMethods as Record<string, typeof RpcMethods[RpcMethodName]>)[method];
    if (!spec) {
      this.writeError(sock, id, RPC_ERR.METHOD_NOT_FOUND, `unknown method: ${method}`);
      return;
    }
    const parsed = spec.params.safeParse(req.params ?? {});
    if (!parsed.success) {
      this.writeError(sock, id, RPC_ERR.INVALID_PARAMS, parsed.error.message);
      return;
    }
    try {
      const result = await this.dispatch(method as RpcMethodName, parsed.data);
      this.writeResult(sock, id, result);
    } catch (err) {
      log.error({ err, method }, 'handler threw');
      this.writeError(sock, id, RPC_ERR.INTERNAL_ERROR, (err as Error).message);
    }
  }

  private async dispatch(method: RpcMethodName, params: unknown): Promise<unknown> {
    const { engine, profiles, hid } = this.opts;
    switch (method) {
      case 'device.status':
        return { connected: hid.isConnected(), vid: 0x258a, pid: 0x0049 };
      case 'effect.list':
        return [
          { name: 'fw-static', description: 'Solid firmware color (limited palette)' },
          { name: 'fw-rainbow', description: 'Rainbow gradient (firmware)' },
          { name: 'fw-snake', description: 'Snake (firmware)' },
          { name: 'fw-sine-wave', description: 'Sine wave RGB (firmware)' },
          { name: 'fw-star-twinkle', description: 'Star twinkle (firmware)' },
          { name: 'fw-rainbow-blossom', description: 'Rainbow blossom (firmware)' },
          { name: 'fw-waterfall', description: 'Waterfall (firmware)' },
          { name: 'fw-wheel', description: 'Wheel (firmware)' },
        ];
      case 'effect.run': {
        const p = params as { name: FirmwareEffectName; params: FirmwareEffectParams };
        await engine.runEffect(p.name, p.params);
        return { ok: true };
      }
      case 'effect.stop':
        engine.stop();
        return { ok: true };
      case 'effect.current':
        return engine.current();
      case 'solid.set': {
        const p = params as { color: string };
        await engine.runEffect('fw-static', { color: p.color });
        return { ok: true };
      }
      case 'profile.list':
        return profiles.list();
      case 'profile.activate': {
        const p = params as { name: string };
        await profiles.activate(p.name);
        const prof = profiles.get(p.name);
        if (prof) await engine.runEffect(prof.effect.name, prof.effect.params);
        return { ok: true };
      }
      case 'profile.save': {
        const p = params as { name: string; profile: Omit<Profile, 'createdAt'> };
        await profiles.save(p.name, p.profile);
        return { ok: true };
      }
      case 'profile.delete': {
        const p = params as { name: string };
        await profiles.delete(p.name);
        return { ok: true };
      }
      case 'daemon.version':
        return { version: '0.1.0', buildHash: process.env['FIZZ_BUILD_HASH'] ?? 'dev' };
      case 'daemon.shutdown':
        setTimeout(() => process.exit(0), 50);
        return { ok: true };
    }
  }

  private writeResult(sock: Socket, id: string | number | null, result: unknown): void {
    sock.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  }

  private writeError(sock: Socket, id: string | number | null, code: number, message: string): void {
    sock.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
  }

  private broadcast(method: string, params: unknown): void {
    const line = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    for (const c of this.clients) { try { c.write(line); } catch { /* ignore */ } }
  }
}
