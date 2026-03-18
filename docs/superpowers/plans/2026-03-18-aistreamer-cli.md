# aistreamer CLI Broadcaster — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that wraps any command in a PTY, captures terminal output, and streams it over WebSocket with optional structured metadata for Claude Code sessions.

**Architecture:** Thin PTY proxy using node-pty. Two-channel WebSocket protocol (raw terminal bytes + structured agent events). Claude Code adapter installs hooks that communicate via Unix socket IPC.

**Tech Stack:** TypeScript, node-pty, ws, commander, open

**Spec:** `docs/superpowers/specs/2026-03-18-aistreamer-cli-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Project config, scripts, dependencies |
| `tsconfig.json` | TypeScript config |
| `src/cli.ts` | Entry point, arg parsing, command dispatch |
| `src/pty.ts` | PTY spawn, capture, resize, batching |
| `src/stream.ts` | WebSocket client, two-channel protocol, reconnect |
| `src/auth.ts` | GitHub OAuth flow, token read/write |
| `src/ipc.ts` | Unix socket server, receives hook events |
| `src/adapters/base.ts` | Adapter interface |
| `src/adapters/claude-code.ts` | Hook install/cleanup, stale recovery |
| `src/hooks/claude-hook.js` | Script installed as Claude Code hook |
| `tests/pty.test.ts` | PTY spawn and capture tests |
| `tests/stream.test.ts` | WebSocket protocol tests |
| `tests/auth.test.ts` | Auth token storage tests |
| `tests/ipc.test.ts` | Unix socket IPC tests |
| `tests/adapters/claude-code.test.ts` | Hook install/cleanup tests |
| `tests/cli.test.ts` | CLI arg parsing and integration tests |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize project**

```bash
cd /Users/em/dev/aistreamer
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install node-pty ws commander open
npm install -D typescript tsx vitest @types/node @types/ws
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
.superpowers/
```

- [ ] **Step 5: Add scripts to package.json**

Add to package.json:
```json
{
  "type": "module",
  "bin": {
    "aistreamer": "./dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Create directory structure**

```bash
mkdir -p src/adapters src/hooks tests/adapters
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore package-lock.json
git commit -m "chore: scaffold aistreamer CLI project"
```

---

### Task 2: PTY Spawn & Capture

**Files:**
- Create: `src/pty.ts`
- Create: `tests/pty.test.ts`

- [ ] **Step 1: Write failing test — PTY spawns a command and captures output**

```typescript
// tests/pty.test.ts
import { describe, it, expect } from 'vitest';
import { PtyProcess } from '../src/pty.js';

describe('PtyProcess', () => {
  it('captures output from a spawned command', async () => {
    const chunks: Buffer[] = [];
    const pty = new PtyProcess('echo', ['hello']);
    pty.onData((data) => chunks.push(data));

    const exitCode = await pty.wait();

    expect(exitCode).toBe(0);
    const output = Buffer.concat(chunks).toString();
    expect(output).toContain('hello');
  });

  it('reports non-zero exit codes', async () => {
    const pty = new PtyProcess('bash', ['-c', 'exit 42']);
    const exitCode = await pty.wait();
    expect(exitCode).toBe(42);
  });

  it('forwards input to the PTY', async () => {
    const chunks: Buffer[] = [];
    const pty = new PtyProcess('cat', []);
    pty.onData((data) => chunks.push(data));

    pty.write('hello\n');
    // Give cat time to echo back
    await new Promise((r) => setTimeout(r, 200));
    pty.write('\x04'); // EOF (Ctrl+D)

    await pty.wait();
    const output = Buffer.concat(chunks).toString();
    expect(output).toContain('hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pty.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PtyProcess**

```typescript
// src/pty.ts
import * as pty from 'node-pty';

export type DataHandler = (data: Buffer) => void;

export class PtyProcess {
  private proc: pty.IPty;
  private dataHandlers: DataHandler[] = [];
  private exitPromise: Promise<number>;

  constructor(command: string, args: string[], cols = 80, rows = 24) {
    this.proc = pty.spawn(command, args, {
      name: process.env.TERM || 'xterm-256color',
      cols,
      rows,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.proc.onData((data) => {
      const buf = Buffer.from(data);
      for (const handler of this.dataHandlers) {
        handler(buf);
      }
    });

    this.exitPromise = new Promise((resolve) => {
      this.proc.onExit(({ exitCode }) => resolve(exitCode));
    });
  }

  onData(handler: DataHandler): void {
    this.dataHandlers.push(handler);
  }

  write(data: string): void {
    this.proc.write(data);
  }

  resize(cols: number, rows: number): void {
    this.proc.resize(cols, rows);
  }

  kill(signal?: string): void {
    this.proc.kill(signal);
  }

  wait(): Promise<number> {
    return this.exitPromise;
  }

  get pid(): number {
    return this.proc.pid;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pty.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pty.ts tests/pty.test.ts
git commit -m "feat: add PtyProcess for PTY spawn and capture"
```

---

### Task 3: WebSocket Stream Client

**Files:**
- Create: `src/stream.ts`
- Create: `tests/stream.test.ts`

- [ ] **Step 1: Write failing test — StreamClient encodes messages correctly**

```typescript
// tests/stream.test.ts
import { describe, it, expect } from 'vitest';
import { encodeTermData, encodeMetaEvent, encodeStreamStart, encodeStreamEnd, encodeResize } from '../src/stream.js';

describe('Stream protocol encoding', () => {
  it('encodes terminal data as base64', () => {
    const msg = encodeTermData(Buffer.from('hello'));
    const parsed = JSON.parse(msg);
    expect(parsed.ch).toBe('term');
    expect(Buffer.from(parsed.data, 'base64').toString()).toBe('hello');
    expect(parsed.ts).toBeTypeOf('number');
  });

  it('encodes meta events', () => {
    const msg = encodeMetaEvent({ event: 'tool_start', tool: 'Edit', file: 'app.ts' });
    const parsed = JSON.parse(msg);
    expect(parsed.ch).toBe('meta');
    expect(parsed.event).toBe('tool_start');
    expect(parsed.tool).toBe('Edit');
  });

  it('encodes stream_start', () => {
    const msg = encodeStreamStart({ title: 'test', agent: 'claude-code', cols: 120, rows: 40 });
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('stream_start');
    expect(parsed.protocol_version).toBe(1);
    expect(parsed.cols).toBe(120);
  });

  it('encodes stream_end', () => {
    const msg = encodeStreamEnd(0, 3600);
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('stream_end');
    expect(parsed.exit_code).toBe(0);
  });

  it('encodes resize events', () => {
    const msg = encodeResize(140, 50);
    const parsed = JSON.parse(msg);
    expect(parsed.ch).toBe('term');
    expect(parsed.type).toBe('resize');
    expect(parsed.cols).toBe(140);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stream.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement protocol encoding functions**

```typescript
// src/stream.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stream.test.ts`
Expected: PASS

- [ ] **Step 5: Add StreamClient class with batching and reconnect**

```typescript
// append to src/stream.ts

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
  private onStreamUrl: ((url: string) => void) | null = null;

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
      process.stderr.write('\x1b[33m[aistreamer] Lost connection. Continuing without streaming.\x1b[0m\n');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
    process.stderr.write(`\x1b[33m[aistreamer] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnects})...\x1b[0m\n`);
    setTimeout(() => {
      if (this.connected) return;
      this.ws = new WebSocket(this.url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startBatching();
        process.stderr.write('\x1b[32m[aistreamer] Reconnected!\x1b[0m\n');
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
      process.stderr.write('\x1b[33m[aistreamer] Warning: dropping frames (backpressure)\x1b[0m\n');
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
```

- [ ] **Step 6: Write test for batching behavior**

```typescript
// append to tests/stream.test.ts
import { StreamClient } from '../src/stream.js';
import { WebSocketServer } from 'ws';

describe('StreamClient batching', () => {
  it('batches multiple queueTermData calls into one send', async () => {
    const messages: string[] = [];
    const wss = new WebSocketServer({ port: 0 });
    const port = (wss.address() as { port: number }).port;

    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'stream_started', stream_id: 'test', url: 'http://test/s/test' }));
      ws.on('message', (data) => messages.push(data.toString()));
    });

    const client = new StreamClient(`ws://localhost:${port}`, 'test-token');
    await client.connect();

    // Queue multiple chunks rapidly
    client.queueTermData(Buffer.from('hello'));
    client.queueTermData(Buffer.from(' world'));

    // Wait for batch interval
    await new Promise((r) => setTimeout(r, 50));

    // Should have stream_start + one batched term message (not two)
    const termMessages = messages.filter((m) => JSON.parse(m).ch === 'term');
    expect(termMessages.length).toBe(1);

    const decoded = Buffer.from(JSON.parse(termMessages[0]).data, 'base64').toString();
    expect(decoded).toBe('hello world');

    client.close();
    wss.close();
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/stream.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/stream.ts tests/stream.test.ts
git commit -m "feat: add WebSocket stream client with batching and two-channel protocol"
```

---

### Task 4: Auth — Token Storage & OAuth Flow

**Files:**
- Create: `src/auth.ts`
- Create: `tests/auth.test.ts`

- [ ] **Step 1: Write failing test — token read/write**

```typescript
// tests/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readConfig, writeConfig, clearConfig, type AistreamerConfig } from '../src/auth.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Auth config', () => {
  let tmpDir: string;
  const origHome = process.env.HOME;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aistreamer-test-'));
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no config exists', () => {
    expect(readConfig()).toBeNull();
  });

  it('writes and reads config', () => {
    const config: AistreamerConfig = {
      token: 'test-jwt',
      user: { id: '123', github_username: 'em', avatar_url: '' },
      server: 'wss://aistreamer.dev',
    };
    writeConfig(config);
    const result = readConfig();
    expect(result).toEqual(config);
  });

  it('sets 0600 permissions on config file', () => {
    writeConfig({
      token: 'test',
      user: { id: '1', github_username: 'test', avatar_url: '' },
      server: 'wss://test',
    });
    const configPath = path.join(tmpDir, '.aistreamer', 'config.json');
    const stat = fs.statSync(configPath);
    // 0o600 = owner read/write only
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('clears config', () => {
    writeConfig({
      token: 'test',
      user: { id: '1', github_username: 'test', avatar_url: '' },
      server: 'wss://test',
    });
    clearConfig();
    expect(readConfig()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement auth module**

```typescript
// src/auth.ts
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

export interface AistreamerConfig {
  token: string;
  user: {
    id: string;
    github_username: string;
    avatar_url: string;
  };
  server: string;
}

function configDir(): string {
  return path.join(os.homedir(), '.aistreamer');
}

function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export function readConfig(): AistreamerConfig | null {
  try {
    const data = fs.readFileSync(configPath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function writeConfig(config: AistreamerConfig): void {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = configPath();
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function clearConfig(): void {
  try {
    fs.unlinkSync(configPath());
  } catch {}
}

export async function loginFlow(serverBaseUrl: string): Promise<AistreamerConfig> {
  const callbackPort = 9876;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${callbackPort}`);
      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const userId = url.searchParams.get('user_id');
        const username = url.searchParams.get('username');
        const avatar = url.searchParams.get('avatar_url') ?? '';

        if (!token || !userId || !username) {
          res.writeHead(400);
          res.end('Missing parameters');
          reject(new Error('OAuth callback missing parameters'));
          server.close();
          return;
        }

        const config: AistreamerConfig = {
          token,
          user: { id: userId, github_username: username, avatar_url: avatar },
          server: serverBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://'),
        };

        writeConfig(config);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Logged in! You can close this tab.</h1></body></html>');
        server.close();
        resolve(config);
      }
    });

    server.on('error', (err) => {
      reject(new Error(`Could not start callback server on port ${callbackPort}: ${err.message}`));
    });

    server.listen(callbackPort, '127.0.0.1', async () => {
      const authUrl = `${serverBaseUrl}/auth/github?callback_port=${callbackPort}`;
      const { default: open } = await import('open');
      await open(authUrl);
      console.error(`\x1b[36m[aistreamer]\x1b[0m Opening browser for GitHub login...`);
      console.error(`\x1b[36m[aistreamer]\x1b[0m If the browser didn't open, visit: ${authUrl}`);
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: add auth module with token storage and OAuth flow"
```

---

### Task 5: IPC — Unix Socket Server

**Files:**
- Create: `src/ipc.ts`
- Create: `tests/ipc.test.ts`

- [ ] **Step 1: Write failing test — IPC server receives events**

```typescript
// tests/ipc.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { IpcServer } from '../src/ipc.js';
import net from 'node:net';
import fs from 'node:fs';

describe('IpcServer', () => {
  let server: IpcServer;

  afterEach(async () => {
    if (server) await server.close();
  });

  it('receives JSON events over Unix socket', async () => {
    const events: Record<string, unknown>[] = [];
    server = new IpcServer(process.pid);
    server.onEvent((event) => events.push(event));
    await server.start();

    // Connect and send an event
    const client = net.createConnection(server.socketPath);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.write(JSON.stringify({ event: 'tool_start', tool: 'Edit' }) + '\n');
    await new Promise((r) => setTimeout(r, 100));
    client.end();

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('tool_start');
    expect(events[0].tool).toBe('Edit');
  });

  it('cleans up socket file on close', async () => {
    server = new IpcServer(process.pid);
    await server.start();
    const sockPath = server.socketPath;
    expect(fs.existsSync(sockPath)).toBe(true);

    await server.close();
    expect(fs.existsSync(sockPath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ipc.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement IpcServer**

```typescript
// src/ipc.ts
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type EventHandler = (event: Record<string, unknown>) => void;

export class IpcServer {
  private server: net.Server | null = null;
  private handlers: EventHandler[] = [];
  readonly socketPath: string;

  constructor(pid: number) {
    this.socketPath = path.join(os.tmpdir(), `aistreamer-${pid}.sock`);
  }

  onEvent(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    // Clean up stale socket
    try {
      fs.unlinkSync(this.socketPath);
    } catch {}

    this.server = net.createServer((conn) => {
      let buffer = '';
      conn.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop()!; // keep incomplete line in buffer
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            for (const handler of this.handlers) {
              handler(event);
            }
          } catch {}
        }
      });
    });

    // Set socket permissions
    return new Promise((resolve, reject) => {
      this.server!.on('error', reject);
      this.server!.listen(this.socketPath, () => {
        fs.chmodSync(this.socketPath, 0o600);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          try {
            fs.unlinkSync(this.socketPath);
          } catch {}
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  static cleanupStale(): void {
    const tmpDir = os.tmpdir();
    try {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        const match = file.match(/^aistreamer-(\d+)\.sock$/);
        if (match) {
          const pid = parseInt(match[1], 10);
          if (!isProcessAlive(pid)) {
            try {
              fs.unlinkSync(path.join(tmpDir, file));
            } catch {}
          }
        }
      }
    } catch {}
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ipc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ipc.ts tests/ipc.test.ts
git commit -m "feat: add IPC server for hook event communication via Unix socket"
```

---

### Task 6: Claude Code Adapter

**Files:**
- Create: `src/adapters/base.ts`
- Create: `src/adapters/claude-code.ts`
- Create: `src/hooks/claude-hook.js`
- Create: `tests/adapters/claude-code.test.ts`

- [ ] **Step 1: Create base adapter interface**

```typescript
// src/adapters/base.ts
export interface Adapter {
  /** Install hooks/listeners for the agent. Returns cleanup function. */
  install(socketPath: string, settingsDir?: string): Promise<() => Promise<void>>;
  /** Agent identifier string */
  readonly agentName: string;
}
```

- [ ] **Step 2: Write failing test — hook install/cleanup**

```typescript
// tests/adapters/claude-code.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeAdapter } from '../../src/adapters/claude-code.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ClaudeCodeAdapter', () => {
  let tmpDir: string;
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aistreamer-cc-test-'));
    adapter = new ClaudeCodeAdapter();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs hooks into settings.local.json', async () => {
    const settingsDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });

    const cleanup = await adapter.install('/tmp/test.sock', settingsDir);

    const settingsPath = path.join(settingsDir, 'settings.local.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();

    await cleanup();

    // After cleanup, hooks should be removed
    if (fs.existsSync(settingsPath)) {
      const cleaned = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const hasAistreamerHooks = JSON.stringify(cleaned).includes('aistreamer');
      expect(hasAistreamerHooks).toBe(false);
    }
  });

  it('preserves existing settings during install', async () => {
    const settingsDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'settings.local.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ existing: true }));

    const cleanup = await adapter.install('/tmp/test.sock', settingsDir);

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.existing).toBe(true);
    expect(settings.hooks).toBeDefined();

    await cleanup();

    const cleaned = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(cleaned.existing).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/adapters/claude-code.test.ts`
Expected: FAIL

- [ ] **Step 4: Create the hook script**

```javascript
#!/usr/bin/env node
// src/hooks/claude-hook.js
// Installed as a Claude Code hook. Reads hook data from stdin,
// sends structured events to aistreamer CLI via Unix socket.

const net = require('net');
const socketPath = process.env.AISTREAMER_SOCK;

if (!socketPath) {
  process.exit(0); // Silently exit if not in an aistreamer session
}

let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input);
    const events = [];

    if (hookData.hook_type === 'PreToolUse') {
      events.push({
        event: 'tool_start',
        tool: hookData.tool_name || 'unknown',
        ...(hookData.tool_input?.file_path ? { file: hookData.tool_input.file_path } : {}),
      });
    } else if (hookData.hook_type === 'PostToolUse') {
      events.push({
        event: 'tool_end',
        tool: hookData.tool_name || 'unknown',
        success: !hookData.error,
      });
      // Emit file_change for Edit/Write tools
      const tool = hookData.tool_name;
      if ((tool === 'Edit' || tool === 'Write') && hookData.tool_input?.file_path) {
        events.push({
          event: 'file_change',
          path: hookData.tool_input.file_path,
          action: tool === 'Edit' ? 'edit' : 'create',
        });
      }
    } else if (hookData.hook_type === 'Notification') {
      events.push({
        event: 'agent_message',
        role: hookData.role || 'assistant',
        summary: hookData.message || hookData.title || '',
      });
    }

    const client = net.createConnection(socketPath, () => {
      for (const event of events) {
        client.write(JSON.stringify(event) + '\n');
      }
      client.end();
    });

    client.on('error', () => {
      // Silently fail — don't break the agent session
      process.exit(0);
    });
  } catch {
    process.exit(0);
  }
});
```

- [ ] **Step 5: Implement ClaudeCodeAdapter**

```typescript
// src/adapters/claude-code.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Adapter } from './base.js';

const HOOK_TAG = 'aistreamer-hook';

export class ClaudeCodeAdapter implements Adapter {
  readonly agentName = 'claude-code';

  /** Remove hooks left behind by crashed aistreamer sessions */
  static cleanupStaleHooks(settingsDir?: string): void {
    const dir = settingsDir ?? path.join(process.cwd(), '.claude');
    const settingsPath = path.join(dir, 'settings.local.json');
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (!settings.hooks) return;
      let changed = false;
      for (const hookType of ['PreToolUse', 'PostToolUse', 'Notification']) {
        const hooks = settings.hooks[hookType];
        if (!Array.isArray(hooks)) continue;
        settings.hooks[hookType] = hooks.filter((h: Record<string, unknown>) => {
          if (h.type !== HOOK_TAG) return true;
          // Extract PID from socket path in command
          const match = String(h.command).match(/aistreamer-(\d+)\.sock/);
          if (!match) return false;
          const pid = parseInt(match[1], 10);
          try { process.kill(pid, 0); return true; } catch { changed = true; return false; }
        });
      }
      if (changed) {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
    } catch {}
  }

  async install(socketPath: string, settingsDir?: string): Promise<() => Promise<void>> {
    const dir = settingsDir ?? path.join(process.cwd(), '.claude');
    const settingsPath = path.join(dir, 'settings.local.json');
    const hookScriptPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../hooks/claude-hook.js'
    );

    // Read existing settings
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {}

    // Save original for restoration
    const originalContent = fs.existsSync(settingsPath)
      ? fs.readFileSync(settingsPath, 'utf-8')
      : null;

    // Build hook entries
    const hookEntry = {
      type: HOOK_TAG,
      command: `AISTREAMER_SOCK=${socketPath} node ${hookScriptPath}`,
    };

    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
    hooks.PreToolUse = [...(hooks.PreToolUse ?? []), hookEntry];
    hooks.PostToolUse = [...(hooks.PostToolUse ?? []), hookEntry];
    hooks.Notification = [...(hooks.Notification ?? []), hookEntry];
    settings.hooks = hooks;

    // Write updated settings
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Return cleanup function
    return async () => {
      try {
        if (originalContent === null) {
          // We created the file — check if we should remove it
          fs.unlinkSync(settingsPath);
        } else {
          // Restore original content
          fs.writeFileSync(settingsPath, originalContent);
        }
      } catch {}
    };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/adapters/claude-code.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/adapters/ src/hooks/ tests/adapters/
git commit -m "feat: add Claude Code adapter with hook install/cleanup"
```

---

### Task 7: CLI Entry Point

**Files:**
- Create: `src/cli.ts`
- Create: `tests/cli.test.ts`

- [ ] **Step 1: Write failing test — CLI arg parsing**

```typescript
// tests/cli.test.ts
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('CLI arg parsing', () => {
  it('parses bare command', () => {
    const result = parseArgs(['claude']);
    expect(result.command).toBe('claude');
    expect(result.args).toEqual([]);
  });

  it('parses command with title', () => {
    const result = parseArgs(['--title', 'Building auth', 'claude']);
    expect(result.command).toBe('claude');
    expect(result.title).toBe('Building auth');
  });

  it('parses -- separated command with args', () => {
    const result = parseArgs(['--', 'aider', '--model', 'sonnet']);
    expect(result.command).toBe('aider');
    expect(result.args).toEqual(['--model', 'sonnet']);
  });

  it('parses subcommands: login, logout, whoami', () => {
    expect(parseArgs(['login']).subcommand).toBe('login');
    expect(parseArgs(['logout']).subcommand).toBe('logout');
    expect(parseArgs(['whoami']).subcommand).toBe('whoami');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement CLI arg parsing**

```typescript
// src/cli.ts
import process from 'node:process';

const SUBCOMMANDS = ['login', 'logout', 'whoami'] as const;
type Subcommand = typeof SUBCOMMANDS[number];

export interface ParsedArgs {
  subcommand?: Subcommand;
  command?: string;
  args: string[];
  title?: string;
  server?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { args: [] };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--title' && i + 1 < argv.length) {
      result.title = argv[++i];
    } else if (arg === '--server' && i + 1 < argv.length) {
      result.server = argv[++i];
    } else if (arg === '--') {
      // Everything after -- is the command + args
      result.command = argv[i + 1];
      result.args = argv.slice(i + 2);
      break;
    } else if (SUBCOMMANDS.includes(arg as Subcommand)) {
      result.subcommand = arg as Subcommand;
    } else if (!arg.startsWith('-') && !result.command) {
      result.command = arg;
      result.args = argv.slice(i + 1);
      break;
    }
    i++;
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Implement main function that wires everything together**

```typescript
// append to src/cli.ts
import { PtyProcess } from './pty.js';
import { StreamClient } from './stream.js';
import { readConfig, loginFlow, clearConfig } from './auth.js';
import { IpcServer } from './ipc.js';

function detectAgent(command: string): string | null {
  const basename = command.split('/').pop() ?? command;
  if (basename === 'claude') return 'claude-code';
  return null;
}

async function runStream(parsed: ParsedArgs): Promise<void> {
  const config = readConfig();
  if (!config) {
    console.error('\x1b[31m[aistreamer]\x1b[0m Not logged in. Run: aistreamer login');
    process.exit(1);
  }

  if (!parsed.command) {
    console.error('\x1b[31m[aistreamer]\x1b[0m No command specified. Usage: aistreamer <command>');
    process.exit(1);
  }

  const agentType = detectAgent(parsed.command);
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  // Start IPC server for hook events
  const ipc = new IpcServer(process.pid);
  let adapterCleanup: (() => Promise<void>) | null = null;

  // Clean up stale sockets and hooks from previous crashes
  IpcServer.cleanupStale();
  const { ClaudeCodeAdapter } = await import('./adapters/claude-code.js');
  ClaudeCodeAdapter.cleanupStaleHooks();

  // Connect to backend — stream_start is sent inside connect() on open
  const wsUrl = `${config.server}/stream`;
  const stream = new StreamClient(wsUrl, config.token);

  let streamUrl: string | null = null;
  try {
    streamUrl = await stream.connect({
      title: parsed.title,
      agent: agentType ?? undefined,
      cols,
      rows,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      console.error('\x1b[31m[aistreamer]\x1b[0m Auth token expired. Run: aistreamer login');
      process.exit(1);
    }
    console.error(`\x1b[33m[aistreamer]\x1b[0m Could not connect to server. Running without streaming.`);
  }

  // Install adapter hooks if applicable
  if (agentType === 'claude-code') {
    try {
      await ipc.start();
      const adapter = new ClaudeCodeAdapter();
      adapterCleanup = await adapter.install(ipc.socketPath);

      // Track tool_start timestamps for duration_ms computation
      const toolStartTimes = new Map<string, number>();

      ipc.onEvent((event) => {
        if (event.event === 'tool_start') {
          toolStartTimes.set(event.tool as string, Date.now());
        } else if (event.event === 'tool_end') {
          const startTime = toolStartTimes.get(event.tool as string);
          if (startTime) {
            event.duration_ms = Date.now() - startTime;
            toolStartTimes.delete(event.tool as string);
          }
        }
        stream.sendMetaEvent(event);
      });
    } catch (err) {
      console.error(`\x1b[33m[aistreamer]\x1b[0m Could not install Claude Code hooks. Streaming raw only.`);
    }
  }

  // Print stream info
  if (streamUrl) {
    console.error(`\x1b[36m[aistreamer]\x1b[0m \x1b[1mLive at ${streamUrl}\x1b[0m`);
  }
  console.error(`\x1b[33m[aistreamer]\x1b[0m Warning: Your terminal output is being broadcast publicly.`);
  console.error('');

  // Spawn PTY
  const ptyProc = new PtyProcess(parsed.command, parsed.args, cols, rows);
  const startTime = Date.now();

  // Forward PTY output to terminal + stream
  ptyProc.onData((data) => {
    process.stdout.write(data);
    stream.queueTermData(data);
  });

  // Handle terminal resize
  process.stdout.on('resize', () => {
    const newCols = process.stdout.columns || 80;
    const newRows = process.stdout.rows || 24;
    ptyProc.resize(newCols, newRows);
    stream.sendResize(newCols, newRows);
  });

  // Forward stdin to PTY
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (data) => {
    ptyProc.write(data.toString());
  });

  // Cleanup on exit
  const cleanup = async (exitCode: number) => {
    const durationS = Math.round((Date.now() - startTime) / 1000);
    stream.sendStreamEnd(exitCode, durationS);

    if (adapterCleanup) await adapterCleanup();
    await ipc.close();
    stream.close();

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  };

  // Handle signals
  const signalHandler = async () => {
    ptyProc.kill('SIGTERM');
  };
  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

  // Wait for PTY to exit
  const exitCode = await ptyProc.wait();
  await cleanup(exitCode);
  process.exit(exitCode);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.subcommand === 'login') {
    const server = parsed.server ?? 'https://aistreamer.dev';
    await loginFlow(server);
    console.error('\x1b[32m[aistreamer]\x1b[0m Logged in successfully!');
    return;
  }

  if (parsed.subcommand === 'logout') {
    clearConfig();
    console.error('\x1b[32m[aistreamer]\x1b[0m Logged out.');
    return;
  }

  if (parsed.subcommand === 'whoami') {
    const config = readConfig();
    if (config) {
      console.error(`Logged in as @${config.user.github_username} (via GitHub)`);
    } else {
      console.error('Not logged in. Run: aistreamer login');
    }
    return;
  }

  await runStream(parsed);
}

main().catch((err) => {
  console.error(`\x1b[31m[aistreamer]\x1b[0m ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat: add CLI entry point wiring PTY, stream, auth, and adapters"
```

---

### Task 8: Integration Smoke Test

**Files:**
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Write integration test — full pipeline without backend**

```typescript
// tests/integration.test.ts
import { describe, it, expect } from 'vitest';
import { PtyProcess } from '../src/pty.js';
import { encodeTermData } from '../src/stream.js';
import { IpcServer } from '../src/ipc.js';
import net from 'node:net';

describe('Integration: PTY → Stream encoding', () => {
  it('captures PTY output and encodes it for streaming', async () => {
    const chunks: Buffer[] = [];
    const pty = new PtyProcess('echo', ['integration test']);
    pty.onData((data) => chunks.push(data));

    await pty.wait();

    const combined = Buffer.concat(chunks);
    const encoded = encodeTermData(combined);
    const parsed = JSON.parse(encoded);

    expect(parsed.ch).toBe('term');
    const decoded = Buffer.from(parsed.data, 'base64').toString();
    expect(decoded).toContain('integration test');
  });
});

describe('Integration: IPC → meta events', () => {
  it('receives hook events and they are properly structured', async () => {
    const events: Record<string, unknown>[] = [];
    const ipc = new IpcServer(process.pid);
    ipc.onEvent((e) => events.push(e));
    await ipc.start();

    const client = net.createConnection(ipc.socketPath);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.write(JSON.stringify({
      event: 'tool_start',
      tool: 'Edit',
      file: 'src/app.ts',
    }) + '\n');

    await new Promise((r) => setTimeout(r, 100));
    client.end();

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('tool_start');

    await ipc.close();
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run tests/integration.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test: add integration smoke tests for PTY→stream and IPC→meta pipelines"
```

---

### Task 9: Manual Smoke Test & Polish

**Files:**
- Modify: `src/cli.ts` (if needed)
- Modify: `package.json` (bin entry)

- [ ] **Step 1: Test CLI help/version output**

Run: `npx tsx src/cli.ts --help 2>&1 || true`
Verify it doesn't crash. If no help text, add a check for `--help` and `--version` flags.

- [ ] **Step 2: Test whoami without login**

Run: `npx tsx src/cli.ts whoami 2>&1`
Expected: "Not logged in. Run: aistreamer login"

- [ ] **Step 3: Test streaming a simple command (no backend)**

Run: `npx tsx src/cli.ts -- echo "hello world" 2>&1`
Expected: Should print connection warning, then "hello world", then exit. Should not crash.

- [ ] **Step 4: Fix any issues found, run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: polish CLI for smoke testing"
```
