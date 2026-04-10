import WebSocket from 'ws';

const PROTOCOL_VERSION = 1;

export function encodeTermData(data: Buffer): string {
  return JSON.stringify({
    ch: 'term',
    data: data.toString('base64'),
    ts: Date.now(),
  });
}

export function encodeMetaEvent(event: Record<string, unknown>): string {
  return JSON.stringify({
    ch: 'meta',
    ...event,
    ts: Date.now(),
  });
}

export function encodeStreamStart(opts: {
  title?: string;
  agent?: string;
  cols: number;
  rows: number;
}): string {
  return JSON.stringify({
    type: 'stream_start',
    title: opts.title ?? '',
    agent: opts.agent ?? 'unknown',
    cols: opts.cols,
    rows: opts.rows,
    protocol_version: PROTOCOL_VERSION,
  });
}

export function encodeStreamEnd(exitCode: number, durationS: number): string {
  return JSON.stringify({
    type: 'stream_end',
    reason: 'exit',
    exit_code: exitCode,
    duration_s: durationS,
  });
}

export function encodeResize(cols: number, rows: number): string {
  return JSON.stringify({
    ch: 'term',
    type: 'resize',
    cols,
    rows,
    ts: Date.now(),
  });
}

const BATCH_INTERVAL_MS = 16; // ~60fps
const MAX_BUFFER_BYTES = 1024 * 1024; // 1MB

export class StreamClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private buffer: Buffer[] = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnects = 3;
  private streamUrl: string | null = null;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  async connect(startOpts: { title?: string; agent?: string; cols: number; rows: number }): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startBatching();
        // Send stream_start immediately on open so server can respond with stream_started
        this.sendRaw(encodeStreamStart(startOpts));
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'stream_started' && msg.url) {
            this.streamUrl = msg.url;
            resolve(msg.url);
          }
        } catch {}
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.stopBatching();
        this.attemptReconnect();
      });

      this.ws.on('error', (err) => {
        if (!this.connected) {
          reject(err);
        }
      });

      // Timeout if server never responds with stream_started
      setTimeout(() => {
        if (!this.streamUrl) resolve(null);
      }, 5000);
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnects) {
      process.stderr.write('\x1b[33m[clawcast] Lost connection. Continuing without streaming.\x1b[0m\n');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
    process.stderr.write(`\x1b[33m[clawcast] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnects})...\x1b[0m\n`);
    setTimeout(() => {
      if (this.connected) return;
      this.ws = new WebSocket(this.url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startBatching();
        process.stderr.write('\x1b[32m[clawcast] Reconnected!\x1b[0m\n');
      });
      this.ws.on('close', () => {
        this.connected = false;
        this.stopBatching();
        this.attemptReconnect();
      });
      this.ws.on('error', () => {});
    }, delay);
  }

  sendStreamEnd(exitCode: number, durationS: number): void {
    this.flush();
    this.sendRaw(encodeStreamEnd(exitCode, durationS));
  }

  sendResize(cols: number, rows: number): void {
    this.sendRaw(encodeResize(cols, rows));
  }

  queueTermData(data: Buffer): void {
    const bufferSize = this.buffer.reduce((sum, b) => sum + b.length, 0);
    if (bufferSize > MAX_BUFFER_BYTES) {
      process.stderr.write('\x1b[33m[clawcast] Warning: dropping frames (backpressure)\x1b[0m\n');
      this.buffer = [];
      return;
    }
    this.buffer.push(data);
  }

  sendMetaEvent(event: Record<string, unknown>): void {
    this.sendRaw(encodeMetaEvent(event));
  }

  private startBatching(): void {
    this.batchTimer = setInterval(() => this.flush(), BATCH_INTERVAL_MS);
  }

  private stopBatching(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  private flush(): void {
    if (this.buffer.length === 0 || !this.connected) return;
    const combined = Buffer.concat(this.buffer);
    this.buffer = [];
    this.sendRaw(encodeTermData(combined));
  }

  private sendRaw(msg: string): void {
    if (this.ws && this.connected) {
      this.ws.send(msg);
    }
  }

  close(): void {
    this.stopBatching();
    this.flush();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
