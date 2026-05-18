import { createConnection, type Socket } from 'node:net';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type NotificationHandler = (params: unknown) => void;

export class DaemonClient {
  private id = 0;
  private sock: Socket | null = null;
  private buf = '';
  private pending = new Map<number, Pending>();
  private notifHandlers = new Map<string, Set<NotificationHandler>>();
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionListeners = new Set<(connected: boolean) => void>();

  constructor(private readonly socketPath: string) {}

  onConnectionChange(handler: (connected: boolean) => void): () => void {
    this.connectionListeners.add(handler);
    return () => this.connectionListeners.delete(handler);
  }

  async connect(): Promise<void> {
    if (this.sock && !this.sock.destroyed) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const sock = createConnection(this.socketPath);
      sock.once('connect', () => {
        this.sock = sock;
        sock.on('data', (chunk) => this.onData(chunk.toString('utf8')));
        sock.on('close', () => {
          this.failAll(new Error('socket closed'));
          this.scheduleReconnect();
          for (const h of this.connectionListeners) h(false);
        });
        sock.on('error', (err) => this.failAll(err));
        this.connectPromise = null;
        for (const h of this.connectionListeners) h(true);
        resolve();
      });
      sock.once('error', (err) => {
        this.connectPromise = null;
        this.scheduleReconnect();
        reject(err);
      });
    });
    return this.connectPromise;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => { /* will retry on next scheduleReconnect */ });
    }, 2000);
  }

  on(method: string, handler: NotificationHandler): () => void {
    if (!this.notifHandlers.has(method)) this.notifHandlers.set(method, new Set());
    this.notifHandlers.get(method)!.add(handler);
    return () => {
      this.notifHandlers.get(method)?.delete(handler);
    };
  }

  private onData(text: string) {
    this.buf += text;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: any;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id as number);
        if (!p) continue;
        this.pending.delete(msg.id as number);
        if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else p.resolve(msg.result);
      } else if (msg.method && typeof msg.method === 'string') {
        const handlers = this.notifHandlers.get(msg.method as string);
        if (handlers) for (const h of handlers) h(msg.params);
      }
    }
  }

  private failAll(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    if (this.sock) { try { this.sock.destroy(); } catch { /* ignore */ } }
    this.sock = null;
  }

  async call(method: string, params: unknown): Promise<unknown> {
    await this.connect();
    const id = ++this.id;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sock!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  close(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.failAll(new Error('client closed'));
  }
}
