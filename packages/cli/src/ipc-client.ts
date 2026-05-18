import { createConnection, type Socket } from 'node:net';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class IpcClient {
  private id = 0;
  private sock: Socket | null = null;
  private buf = '';
  private pending = new Map<number, Pending>();
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly socketPath: string) {}

  private async ensureConnected(): Promise<void> {
    if (this.sock && !this.sock.destroyed) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const sock = createConnection(this.socketPath);
      sock.on('connect', () => {
        this.sock = sock;
        sock.on('data', (chunk) => this.onData(chunk.toString('utf8')));
        sock.on('close', () => this.failAll(new Error('socket closed')));
        sock.on('error', (err) => this.failAll(err));
        this.connectPromise = null;
        resolve();
      });
      sock.on('error', (err) => {
        this.connectPromise = null;
        reject(err);
      });
    });
    return this.connectPromise;
  }

  private onData(text: string): void {
    this.buf += text;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: { id?: number; result?: unknown; error?: { code: number; message: string } };
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id === undefined) continue; // notification: ignore
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      else p.resolve(msg.result);
    }
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    if (this.sock) { try { this.sock.destroy(); } catch { /* ignore */ } }
    this.sock = null;
  }

  async call(method: string, params: unknown): Promise<unknown> {
    await this.ensureConnected();
    const id = ++this.id;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sock!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  close(): void { this.failAll(new Error('client closed')); }
}
