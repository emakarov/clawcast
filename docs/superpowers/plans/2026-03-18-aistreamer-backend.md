# aistreamer Backend — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js server that relays real-time terminal streams from CLI broadcasters to web viewers, with GitHub OAuth, Postgres for users/streams, and ClickHouse for event logging.

**Architecture:** Express + ws server. StreamManager (in-memory pub/sub) fans out broadcaster messages to viewers. Postgres stores users and stream metadata. ClickHouse stores stream events in batches.

**Tech Stack:** TypeScript, Express, ws, pg, @clickhouse/client, jsonwebtoken, ulid

**Spec:** `docs/superpowers/specs/2026-03-18-aistreamer-backend-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `server/package.json` | Server package config |
| `server/tsconfig.json` | Server TypeScript config |
| `server/.env.example` | Example env vars |
| `shared/protocol.ts` | Shared message type definitions |
| `server/src/config.ts` | Env var loading and validation |
| `server/src/db.ts` | Postgres client, schema creation |
| `server/src/clickhouse.ts` | ClickHouse client, batched event inserts |
| `server/src/auth.ts` | GitHub OAuth routes, JWT issue/verify |
| `server/src/stream-manager.ts` | In-memory pub/sub, viewer fan-out, buffer |
| `server/src/ws-broadcaster.ts` | WebSocket handler for CLI connections |
| `server/src/ws-viewer.ts` | WebSocket handler for viewer connections |
| `server/src/api.ts` | REST routes (/api/streams, /api/me) |
| `server/src/heartbeat.ts` | Ping/pong heartbeat for WebSocket connections |
| `server/src/index.ts` | Server entry, Express + ws setup, graceful shutdown |
| `server/tests/stream-manager.test.ts` | StreamManager unit tests |
| `server/tests/auth.test.ts` | JWT and OAuth tests |
| `server/tests/api.test.ts` | REST API tests |
| `server/tests/ws-broadcaster.test.ts` | Broadcaster WebSocket tests |
| `server/tests/ws-viewer.test.ts` | Viewer WebSocket tests |
| `server/tests/clickhouse.test.ts` | ClickHouse batching tests |
| `server/tests/integration.test.ts` | End-to-end integration tests |

---

### Task 1: Server Scaffolding & Shared Types

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/.gitignore`
- Create: `shared/protocol.ts`

- [ ] **Step 1: Create server directory and init**

```bash
mkdir -p server/src server/tests
cd server && npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
cd server
npm install express ws pg @clickhouse/client jsonwebtoken ulid cors dotenv
npm install -D typescript tsx vitest @types/express @types/ws @types/pg @types/jsonwebtoken @types/cors @types/node
```

- [ ] **Step 3: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src", "../shared"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create server/.env.example**

```
PORT=3000
DATABASE_URL=postgresql://localhost:5432/aistreamer
CLICKHOUSE_URL=http://localhost:8123
JWT_SECRET=change-me-to-a-random-secret
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
CORS_ORIGIN=http://localhost:5173
```

- [ ] **Step 5: Create server/.gitignore**

```
node_modules/
dist/
.env
```

- [ ] **Step 6: Add scripts to server/package.json**

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx --watch src/index.ts",
    "build": "tsc",
    "start": "node dist/src/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 7: Create shared/protocol.ts**

```typescript
// shared/protocol.ts
// Message types shared between CLI broadcaster and backend server.

export interface StreamStartMessage {
  type: 'stream_start';
  title: string;
  agent: string;
  cols: number;
  rows: number;
  protocol_version: number;
}

export interface StreamStartedMessage {
  type: 'stream_started';
  stream_id: string;
  url: string;
}

export interface StreamEndMessage {
  type: 'stream_end';
  reason: string;
  exit_code: number;
  duration_s: number;
}

export interface StreamEndedMessage {
  type: 'stream_ended';
}

export interface TermDataMessage {
  ch: 'term';
  data: string; // base64
  ts: number;
}

export interface TermResizeMessage {
  ch: 'term';
  type: 'resize';
  cols: number;
  rows: number;
  ts: number;
}

export interface MetaEventMessage {
  ch: 'meta';
  event: string;
  ts: number;
  [key: string]: unknown;
}

export interface SnapshotMessage {
  type: 'snapshot';
  data: string; // base64
  cols: number;
  rows: number;
  title: string;
  agent: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type BroadcasterMessage = StreamStartMessage | StreamEndMessage | TermDataMessage | TermResizeMessage | MetaEventMessage;
export type ServerToBroadcasterMessage = StreamStartedMessage | ErrorMessage;
export type ServerToViewerMessage = SnapshotMessage | StreamEndedMessage | ErrorMessage | TermDataMessage | MetaEventMessage;

export const PROTOCOL_VERSION = 1;
```

- [ ] **Step 8: Commit**

```bash
git add server/ shared/
git commit -m "chore: scaffold backend server and shared protocol types"
```

---

### Task 2: Config & Database

**Files:**
- Create: `server/src/config.ts`
- Create: `server/src/db.ts`
- Create: `server/tests/db.test.ts`

- [ ] **Step 1: Create config module**

```typescript
// server/src/config.ts
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/aistreamer',
  clickhouseUrl: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  githubClientId: process.env.GITHUB_CLIENT_ID || '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || '3000'}`,
};
```

- [ ] **Step 2: Write failing test for db schema creation**

```typescript
// server/tests/db.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPool, ensureSchema, type DbPool } from '../src/db.js';

// These tests require a running Postgres instance.
// Skip if DATABASE_URL is not set or not reachable.
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/aistreamer_test';

describe('Database', () => {
  let pool: DbPool;

  beforeAll(async () => {
    try {
      pool = createPool(TEST_DB_URL);
      await pool.query('SELECT 1');
    } catch {
      console.warn('Skipping DB tests — Postgres not available');
      return;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DROP TABLE IF EXISTS streams CASCADE');
      await pool.query('DROP TABLE IF EXISTS users CASCADE');
      await pool.end();
    }
  });

  it('creates users and streams tables', async () => {
    if (!pool) return;
    await ensureSchema(pool);

    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'streams') ORDER BY table_name"
    );
    expect(tables.rows.map((r: { table_name: string }) => r.table_name)).toEqual(['streams', 'users']);
  });

  it('can insert and query a user', async () => {
    if (!pool) return;
    await pool.query(
      "INSERT INTO users (id, github_id, username, avatar_url) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      ['01TEST', 'gh123', 'testuser', 'https://avatar.url']
    );

    const result = await pool.query("SELECT * FROM users WHERE id = $1", ['01TEST']);
    expect(result.rows[0].username).toBe('testuser');
  });
});
```

- [ ] **Step 3: Implement db module**

```typescript
// server/src/db.ts
import pg from 'pg';

export type DbPool = pg.Pool;

export function createPool(connectionString: string): DbPool {
  return new pg.Pool({ connectionString });
}

export async function ensureSchema(pool: DbPool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          text PRIMARY KEY,
      github_id   text UNIQUE NOT NULL,
      username    text NOT NULL,
      avatar_url  text,
      created_at  timestamptz DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS streams (
      id          text PRIMARY KEY,
      user_id     text REFERENCES users(id),
      title       text DEFAULT '',
      agent       text DEFAULT 'unknown',
      status      text DEFAULT 'live',
      started_at  timestamptz DEFAULT now(),
      ended_at    timestamptz,
      cols        int DEFAULT 80,
      rows        int DEFAULT 24
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_streams_user_id ON streams(user_id)`);
}

export async function createStream(pool: DbPool, stream: {
  id: string;
  userId: string;
  title: string;
  agent: string;
  cols: number;
  rows: number;
}): Promise<void> {
  await pool.query(
    'INSERT INTO streams (id, user_id, title, agent, cols, rows) VALUES ($1, $2, $3, $4, $5, $6)',
    [stream.id, stream.userId, stream.title, stream.agent, stream.cols, stream.rows]
  );
}

export async function endStream(pool: DbPool, streamId: string): Promise<void> {
  await pool.query(
    "UPDATE streams SET status = 'ended', ended_at = now() WHERE id = $1",
    [streamId]
  );
}

export async function endUserStreams(pool: DbPool, userId: string): Promise<string[]> {
  const result = await pool.query(
    "UPDATE streams SET status = 'ended', ended_at = now() WHERE user_id = $1 AND status = 'live' RETURNING id",
    [userId]
  );
  return result.rows.map((r: { id: string }) => r.id);
}

export async function getLiveStreams(pool: DbPool, limit = 50): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT s.id, s.title, s.agent, s.status, s.started_at, s.cols, s.rows,
            u.id as user_id, u.username, u.avatar_url
     FROM streams s JOIN users u ON s.user_id = u.id
     WHERE s.status = 'live'
     ORDER BY s.started_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getStream(pool: DbPool, streamId: string): Promise<unknown | null> {
  const result = await pool.query(
    `SELECT s.id, s.title, s.agent, s.status, s.started_at, s.ended_at, s.cols, s.rows,
            u.id as user_id, u.username, u.avatar_url
     FROM streams s JOIN users u ON s.user_id = u.id
     WHERE s.id = $1`,
    [streamId]
  );
  return result.rows[0] || null;
}

export async function findOrCreateUser(pool: DbPool, user: {
  id: string;
  githubId: string;
  username: string;
  avatarUrl: string;
}): Promise<{ id: string; username: string; avatar_url: string }> {
  // Try to find existing
  const existing = await pool.query('SELECT id, username, avatar_url FROM users WHERE github_id = $1', [user.githubId]);
  if (existing.rows.length > 0) {
    // Update username/avatar in case they changed
    await pool.query('UPDATE users SET username = $1, avatar_url = $2 WHERE github_id = $3', [user.username, user.avatarUrl, user.githubId]);
    return { ...existing.rows[0], username: user.username, avatar_url: user.avatarUrl };
  }

  await pool.query(
    'INSERT INTO users (id, github_id, username, avatar_url) VALUES ($1, $2, $3, $4)',
    [user.id, user.githubId, user.username, user.avatarUrl]
  );
  return { id: user.id, username: user.username, avatar_url: user.avatarUrl };
}
```

- [ ] **Step 4: Run test**

Run: `cd server && npx vitest run tests/db.test.ts`
Expected: PASS (or skip if no Postgres)

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/src/db.ts server/tests/db.test.ts
git commit -m "feat: add config and Postgres database module"
```

---

### Task 3: ClickHouse Event Logger

**Files:**
- Create: `server/src/clickhouse.ts`
- Create: `server/tests/clickhouse.test.ts`

- [ ] **Step 1: Write failing test for event batching**

```typescript
// server/tests/clickhouse.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventLogger } from '../src/clickhouse.js';

describe('EventLogger batching', () => {
  let flushed: Array<Array<{ stream_id: string; channel: string; data: string; ts: number }>>;
  let logger: EventLogger;

  beforeEach(() => {
    flushed = [];
    // Create logger with a mock flush function
    logger = new EventLogger({
      flushFn: async (events) => { flushed.push([...events]); },
      flushIntervalMs: 100,
      maxBatchSize: 3,
    });
  });

  it('flushes when batch reaches maxBatchSize', async () => {
    logger.log('stream1', 'term', '{"data":"a"}', Date.now());
    logger.log('stream1', 'term', '{"data":"b"}', Date.now());
    expect(flushed).toHaveLength(0);

    logger.log('stream1', 'term', '{"data":"c"}', Date.now());
    // Wait for async flush
    await new Promise((r) => setTimeout(r, 50));
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(3);
  });

  it('flushes on interval', async () => {
    logger.log('stream1', 'term', '{"data":"a"}', Date.now());
    expect(flushed).toHaveLength(0);

    // Wait for flush interval
    await new Promise((r) => setTimeout(r, 150));
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(1);
  });

  it('does not flush empty batches', async () => {
    await new Promise((r) => setTimeout(r, 150));
    expect(flushed).toHaveLength(0);
  });

  it('stops flushing after close', async () => {
    logger.log('stream1', 'term', '{"data":"a"}', Date.now());
    await logger.close();
    expect(flushed).toHaveLength(1); // final flush on close
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/clickhouse.test.ts`

- [ ] **Step 3: Implement EventLogger**

```typescript
// server/src/clickhouse.ts
import { createClient, type ClickHouseClient } from '@clickhouse/client';

interface EventRow {
  stream_id: string;
  channel: string;
  data: string;
  ts: number;
}

interface EventLoggerOptions {
  flushFn?: (events: EventRow[]) => Promise<void>;
  flushIntervalMs?: number;
  maxBatchSize?: number;
}

export class EventLogger {
  private batch: EventRow[] = [];
  private flushFn: (events: EventRow[]) => Promise<void>;
  private flushInterval: ReturnType<typeof setInterval>;
  private maxBatchSize: number;

  constructor(opts: EventLoggerOptions = {}) {
    this.flushFn = opts.flushFn ?? (async () => {});
    this.maxBatchSize = opts.maxBatchSize ?? 100;
    this.flushInterval = setInterval(() => this.flush(), opts.flushIntervalMs ?? 5000);
  }

  log(streamId: string, channel: string, data: string, ts: number): void {
    this.batch.push({ stream_id: streamId, channel, data, ts });
    if (this.batch.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;
    const events = this.batch;
    this.batch = [];
    try {
      await this.flushFn(events);
    } catch (err) {
      console.warn('[aistreamer] ClickHouse flush failed:', err);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();
  }
}

export function createClickHouseLogger(url: string): EventLogger {
  const client: ClickHouseClient = createClient({ url });

  return new EventLogger({
    flushFn: async (events) => {
      await client.insert({
        table: 'stream_events',
        values: events.map((e) => ({
          stream_id: e.stream_id,
          channel: e.channel,
          data: e.data,
          ts: new Date(e.ts).toISOString(),
        })),
        format: 'JSONEachRow',
      });
    },
    flushIntervalMs: 5000,
    maxBatchSize: 100,
  });
}

export async function ensureClickHouseSchema(url: string): Promise<void> {
  const client = createClient({ url });
  await client.exec({
    query: `
      CREATE TABLE IF NOT EXISTS stream_events (
        stream_id   String,
        channel     String,
        data        String,
        ts          DateTime64(3),
        inserted_at DateTime64(3) DEFAULT now64(3)
      ) ENGINE = MergeTree()
      ORDER BY (stream_id, ts)
    `,
  });
  await client.close();
}
```

- [ ] **Step 4: Run test**

Run: `cd server && npx vitest run tests/clickhouse.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/clickhouse.ts server/tests/clickhouse.test.ts
git commit -m "feat: add ClickHouse event logger with batched inserts"
```

---

### Task 4: JWT Auth & GitHub OAuth

**Files:**
- Create: `server/src/auth.ts`
- Create: `server/tests/auth.test.ts`

- [ ] **Step 1: Write failing test for JWT**

```typescript
// server/tests/auth.test.ts
import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../src/auth.js';

const TEST_SECRET = 'test-secret-key';

describe('JWT', () => {
  it('signs and verifies a token', () => {
    const token = signJwt({ sub: '01USER', username: 'em' }, TEST_SECRET);
    const payload = verifyJwt(token, TEST_SECRET);
    expect(payload.sub).toBe('01USER');
    expect(payload.username).toBe('em');
  });

  it('rejects invalid tokens', () => {
    expect(() => verifyJwt('garbage', TEST_SECRET)).toThrow();
  });

  it('rejects tokens with wrong secret', () => {
    const token = signJwt({ sub: '01USER', username: 'em' }, TEST_SECRET);
    expect(() => verifyJwt(token, 'wrong-secret')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement auth module**

```typescript
// server/src/auth.ts
import jwt from 'jsonwebtoken';
import { Router, type Request, type Response } from 'express';
import { config } from './config.js';
import { findOrCreateUser, type DbPool } from './db.js';
import { ulid } from 'ulid';

interface JwtPayload {
  sub: string;
  username: string;
  iat?: number;
  exp?: number;
}

export function signJwt(payload: { sub: string; username: string }, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

export function verifyJwt(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export function createAuthRouter(pool: DbPool): Router {
  const router = Router();

  // Start OAuth flow
  router.get('/github', (req: Request, res: Response) => {
    const callbackPort = req.query.callback_port as string;
    const state = Buffer.from(JSON.stringify({ callback_port: callbackPort })).toString('base64url');
    const githubUrl = `https://github.com/login/oauth/authorize?client_id=${config.githubClientId}&state=${state}&scope=read:user`;
    res.redirect(githubUrl);
  });

  // Handle OAuth callback
  router.get('/github/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = JSON.parse(Buffer.from(req.query.state as string, 'base64url').toString());
      const callbackPort = state.callback_port;

      // Exchange code for access token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code,
        }),
      });
      const tokenData = await tokenRes.json() as { access_token: string };

      // Fetch user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const githubUser = await userRes.json() as { id: number; login: string; avatar_url: string };

      // Create or find user
      const user = await findOrCreateUser(pool, {
        id: ulid(),
        githubId: String(githubUser.id),
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      });

      // Issue JWT
      const token = signJwt({ sub: user.id, username: user.username }, config.jwtSecret);

      // Redirect to CLI callback
      const params = new URLSearchParams({
        token,
        user_id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
      });
      res.redirect(`http://localhost:${callbackPort}/callback?${params}`);
    } catch (err) {
      console.error('[aistreamer] OAuth error:', err);
      // Try to redirect to CLI callback with error
      try {
        const state = JSON.parse(Buffer.from(req.query.state as string, 'base64url').toString());
        res.redirect(`http://localhost:${state.callback_port}/callback?error=oauth_failed`);
      } catch {
        res.status(500).send('OAuth failed');
      }
    }
  });

  return router;
}
```

- [ ] **Step 4: Run test**

Run: `cd server && npx vitest run tests/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/auth.ts server/tests/auth.test.ts
git commit -m "feat: add JWT auth and GitHub OAuth routes"
```

---

### Task 5: StreamManager

**Files:**
- Create: `server/src/stream-manager.ts`
- Create: `server/tests/stream-manager.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/tests/stream-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { StreamManager } from '../src/stream-manager.js';
import { EventEmitter } from 'node:events';

// Minimal WebSocket mock
function mockWs(): any {
  const ws = new EventEmitter() as any;
  ws.send = (data: string) => { ws.lastSent = data; ws.allSent = ws.allSent || []; ws.allSent.push(data); };
  ws.close = () => { ws.emit('close'); };
  ws.readyState = 1; // OPEN
  ws.lastSent = null;
  ws.allSent = [];
  return ws;
}

describe('StreamManager', () => {
  let mgr: StreamManager;

  beforeEach(() => {
    mgr = new StreamManager();
  });

  it('registers and retrieves a stream', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const stream = mgr.getStream('s1');
    expect(stream).toBeDefined();
    expect(stream!.metadata.title).toBe('test');
  });

  it('adds viewers and sends snapshot', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    mgr.appendToBuffer('s1', Buffer.from('hello'));

    const viewer = mockWs();
    mgr.addViewer('s1', viewer);

    expect(viewer.lastSent).toBeTruthy();
    const snapshot = JSON.parse(viewer.lastSent);
    expect(snapshot.type).toBe('snapshot');
    expect(Buffer.from(snapshot.data, 'base64').toString()).toBe('hello');
    expect(mgr.getViewerCount('s1')).toBe(1);
  });

  it('broadcasts to all viewers', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const v1 = mockWs();
    const v2 = mockWs();
    mgr.addViewer('s1', v1);
    mgr.addViewer('s1', v2);

    mgr.broadcast('s1', '{"ch":"term","data":"dGVzdA=="}');

    expect(v1.allSent.length).toBe(2); // snapshot + broadcast
    expect(v2.allSent.length).toBe(2);
  });

  it('removes viewers', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const viewer = mockWs();
    mgr.addViewer('s1', viewer);
    expect(mgr.getViewerCount('s1')).toBe(1);

    mgr.removeViewer('s1', viewer);
    expect(mgr.getViewerCount('s1')).toBe(0);
  });

  it('ends stream and notifies viewers', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const viewer = mockWs();
    mgr.addViewer('s1', viewer);

    mgr.endStream('s1');
    const lastMsg = JSON.parse(viewer.allSent[viewer.allSent.length - 1]);
    expect(lastMsg.type).toBe('stream_ended');
    expect(mgr.getStream('s1')).toBeUndefined();
  });

  it('caps buffer at 1MB', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    // Write 1.5MB
    const chunk = Buffer.alloc(512 * 1024, 'x');
    mgr.appendToBuffer('s1', chunk);
    mgr.appendToBuffer('s1', chunk);
    mgr.appendToBuffer('s1', chunk);

    const stream = mgr.getStream('s1');
    expect(stream!.buffer.length).toBeLessThanOrEqual(1024 * 1024);
  });

  it('lists active streams', () => {
    const b1 = mockWs();
    const b2 = mockWs();
    mgr.registerStream('s1', b1, { title: 'a', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'user1', avatarUrl: '' });
    mgr.registerStream('s2', b2, { title: 'b', agent: 'aider', cols: 80, rows: 24, userId: 'u2', username: 'user2', avatarUrl: '' });

    expect(mgr.getActiveStreams()).toHaveLength(2);
  });

  it('updates cols/rows on resize', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    mgr.updateDimensions('s1', 120, 40);

    const stream = mgr.getStream('s1');
    expect(stream!.metadata.cols).toBe(120);
    expect(stream!.metadata.rows).toBe(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement StreamManager**

```typescript
// server/src/stream-manager.ts
import type WebSocket from 'ws';

const MAX_BUFFER_BYTES = 1024 * 1024; // 1MB
const TERMINAL_RESET = '\x1bc';

export interface StreamMetadata {
  title: string;
  agent: string;
  cols: number;
  rows: number;
  userId: string;
  username: string;
  avatarUrl: string;
}

export interface ActiveStream {
  broadcaster: WebSocket;
  viewers: Set<WebSocket>;
  buffer: Buffer;
  metadata: StreamMetadata & { id: string; startedAt: Date };
}

export class StreamManager {
  private streams = new Map<string, ActiveStream>();

  registerStream(id: string, broadcaster: WebSocket, metadata: StreamMetadata): void {
    this.streams.set(id, {
      broadcaster,
      viewers: new Set(),
      buffer: Buffer.alloc(0),
      metadata: { ...metadata, id, startedAt: new Date() },
    });
  }

  endStream(id: string): void {
    const stream = this.streams.get(id);
    if (!stream) return;

    const msg = JSON.stringify({ type: 'stream_ended' });
    for (const viewer of stream.viewers) {
      try { viewer.send(msg); } catch {}
    }
    this.streams.delete(id);
  }

  addViewer(streamId: string, viewer: WebSocket): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    // Send snapshot
    const snapshot = JSON.stringify({
      type: 'snapshot',
      data: stream.buffer.toString('base64'),
      cols: stream.metadata.cols,
      rows: stream.metadata.rows,
      title: stream.metadata.title,
      agent: stream.metadata.agent,
    });
    viewer.send(snapshot);

    stream.viewers.add(viewer);
  }

  removeViewer(streamId: string, viewer: WebSocket): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    stream.viewers.delete(viewer);
  }

  broadcast(streamId: string, message: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    for (const viewer of stream.viewers) {
      try {
        if (viewer.readyState === 1) { // OPEN
          viewer.send(message);
        }
      } catch {}
    }
  }

  appendToBuffer(streamId: string, data: Buffer): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    stream.buffer = Buffer.concat([stream.buffer, data]);

    if (stream.buffer.length > MAX_BUFFER_BYTES) {
      // Discard oldest half, prepend terminal reset
      const half = Math.floor(stream.buffer.length / 2);
      const reset = Buffer.from(TERMINAL_RESET);
      stream.buffer = Buffer.concat([reset, stream.buffer.subarray(half)]);
    }
  }

  updateDimensions(streamId: string, cols: number, rows: number): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    stream.metadata.cols = cols;
    stream.metadata.rows = rows;
  }

  getActiveStreams(): ActiveStream[] {
    return Array.from(this.streams.values());
  }

  getStream(id: string): ActiveStream | undefined {
    return this.streams.get(id);
  }

  getViewerCount(id: string): number {
    return this.streams.get(id)?.viewers.size ?? 0;
  }

  getStreamByUserId(userId: string): ActiveStream | undefined {
    for (const stream of this.streams.values()) {
      if (stream.metadata.userId === userId) return stream;
    }
    return undefined;
  }

  endAll(): string[] {
    const ids = Array.from(this.streams.keys());
    for (const id of ids) {
      this.endStream(id);
    }
    return ids;
  }
}
```

- [ ] **Step 4: Run test**

Run: `cd server && npx vitest run tests/stream-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/stream-manager.ts server/tests/stream-manager.test.ts
git commit -m "feat: add StreamManager with viewer fan-out and buffer management"
```

---

### Task 6: WebSocket Broadcaster Handler

**Files:**
- Create: `server/src/ws-broadcaster.ts`
- Create: `server/src/heartbeat.ts`
- Create: `server/tests/ws-broadcaster.test.ts`

- [ ] **Step 1: Create heartbeat utility**

```typescript
// server/src/heartbeat.ts
import type WebSocket from 'ws';

const PING_INTERVAL = 30_000;
const PONG_TIMEOUT = 10_000;

export function startHeartbeat(ws: WebSocket, onDead: () => void): () => void {
  let alive = true;
  let pongTimeout: ReturnType<typeof setTimeout> | null = null;

  ws.on('pong', () => {
    alive = true;
    if (pongTimeout) { clearTimeout(pongTimeout); pongTimeout = null; }
  });

  const interval = setInterval(() => {
    if (!alive) {
      clearInterval(interval);
      if (pongTimeout) clearTimeout(pongTimeout);
      onDead();
      return;
    }
    alive = false;
    ws.ping();
    // If no pong within 10s, mark dead
    pongTimeout = setTimeout(() => {
      if (!alive) {
        clearInterval(interval);
        onDead();
      }
    }, PONG_TIMEOUT);
  }, PING_INTERVAL);

  return () => {
    clearInterval(interval);
    if (pongTimeout) clearTimeout(pongTimeout);
  };
}
```

- [ ] **Step 2: Write failing test for broadcaster handler**

```typescript
// server/tests/ws-broadcaster.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { handleBroadcasterMessage } from '../src/ws-broadcaster.js';
import { StreamManager } from '../src/stream-manager.js';
import { EventLogger } from '../src/clickhouse.js';
import { EventEmitter } from 'node:events';

function mockWs(): any {
  const ws = new EventEmitter() as any;
  ws.send = (data: string) => { ws.lastSent = data; ws.allSent = ws.allSent || []; ws.allSent.push(data); };
  ws.close = () => {};
  ws.readyState = 1;
  ws.lastSent = null;
  ws.allSent = [];
  return ws;
}

describe('handleBroadcasterMessage', () => {
  let mgr: StreamManager;
  let logger: EventLogger;
  let flushed: any[];

  beforeEach(() => {
    mgr = new StreamManager();
    flushed = [];
    logger = new EventLogger({ flushFn: async (e) => flushed.push(...e), maxBatchSize: 1000, flushIntervalMs: 60000 });
  });

  it('handles stream_start and responds with stream_started', async () => {
    const ws = mockWs();
    const streamId = await handleBroadcasterMessage(ws, mgr, logger, 'u1', 'testuser', '', JSON.stringify({
      type: 'stream_start',
      title: 'test',
      agent: 'claude-code',
      cols: 120,
      rows: 40,
      protocol_version: 1,
    }), null);

    expect(streamId).toBeTruthy();
    const response = JSON.parse(ws.lastSent);
    expect(response.type).toBe('stream_started');
    expect(response.stream_id).toBe(streamId);
  });

  it('rejects unsupported protocol version', async () => {
    const ws = mockWs();
    const streamId = await handleBroadcasterMessage(ws, mgr, logger, 'u1', 'testuser', '', JSON.stringify({
      type: 'stream_start',
      title: 'test',
      agent: 'claude-code',
      cols: 120,
      rows: 40,
      protocol_version: 99,
    }), null);

    expect(streamId).toBeNull();
    const response = JSON.parse(ws.lastSent);
    expect(response.type).toBe('error');
  });

  it('forwards term messages to StreamManager and logger', async () => {
    const ws = mockWs();
    mgr.registerStream('s1', ws, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const viewer = mockWs();
    mgr.addViewer('s1', viewer);

    await handleBroadcasterMessage(ws, mgr, logger, 'u1', 'testuser', '', JSON.stringify({
      ch: 'term',
      data: Buffer.from('hello').toString('base64'),
      ts: Date.now(),
    }), 's1');

    // Viewer should have received the message (after snapshot)
    expect(viewer.allSent.length).toBe(2);
    // Logger should have the event
    await logger.close();
    expect(flushed.length).toBe(1);
    expect(flushed[0].channel).toBe('term');
  });

  it('updates dimensions on resize message', async () => {
    const ws = mockWs();
    mgr.registerStream('s1', ws, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    await handleBroadcasterMessage(ws, mgr, logger, 'u1', 'testuser', '', JSON.stringify({
      ch: 'term',
      type: 'resize',
      cols: 140,
      rows: 50,
      ts: Date.now(),
    }), 's1');

    const stream = mgr.getStream('s1');
    expect(stream!.metadata.cols).toBe(140);
    expect(stream!.metadata.rows).toBe(50);
  });
});
```

- [ ] **Step 3: Implement broadcaster handler**

```typescript
// server/src/ws-broadcaster.ts
import type WebSocket from 'ws';
import { ulid } from 'ulid';
import { StreamManager } from './stream-manager.js';
import { EventLogger } from './clickhouse.js';
import { config } from './config.js';
import { PROTOCOL_VERSION } from '../../shared/protocol.js';
import { createStream as dbCreateStream, endStream as dbEndStream, endUserStreams, type DbPool } from './db.js';

export async function handleBroadcasterMessage(
  ws: WebSocket,
  mgr: StreamManager,
  logger: EventLogger,
  userId: string,
  username: string,
  avatarUrl: string,
  rawMessage: string,
  currentStreamId: string | null,
  pool?: DbPool,
): Promise<string | null> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(rawMessage);
  } catch {
    return currentStreamId;
  }

  if (msg.type === 'stream_start') {
    // Validate protocol version
    if (msg.protocol_version !== PROTOCOL_VERSION) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unsupported protocol version. Please update your CLI.' }));
      ws.close();
      return null;
    }

    // End any existing stream for this user
    const existing = mgr.getStreamByUserId(userId);
    if (existing) {
      mgr.endStream(existing.metadata.id);
      if (pool) await dbEndStream(pool, existing.metadata.id);
    }

    const streamId = ulid();
    const metadata = {
      title: (msg.title as string) || '',
      agent: (msg.agent as string) || 'unknown',
      cols: (msg.cols as number) || 80,
      rows: (msg.rows as number) || 24,
      userId,
      username,
      avatarUrl,
    };

    mgr.registerStream(streamId, ws, metadata);

    if (pool) {
      try {
        await dbCreateStream(pool, { id: streamId, userId, ...metadata });
      } catch (err) {
        console.error('[aistreamer] Failed to create stream in DB:', err);
      }
    }

    const url = `${config.baseUrl}/s/${streamId}`;
    ws.send(JSON.stringify({ type: 'stream_started', stream_id: streamId, url }));
    return streamId;
  }

  if (!currentStreamId) return null;

  if (msg.type === 'stream_end') {
    mgr.endStream(currentStreamId);
    if (pool) {
      try { await dbEndStream(pool, currentStreamId); } catch {}
    }
    return null;
  }

  // Channel messages (term or meta)
  if (msg.ch === 'term') {
    if (msg.type === 'resize') {
      mgr.updateDimensions(currentStreamId, msg.cols as number, msg.rows as number);
    } else if (msg.data) {
      const decoded = Buffer.from(msg.data as string, 'base64');
      mgr.appendToBuffer(currentStreamId, decoded);
    }
    mgr.broadcast(currentStreamId, rawMessage);
    logger.log(currentStreamId, 'term', rawMessage, (msg.ts as number) || Date.now());
  } else if (msg.ch === 'meta') {
    mgr.broadcast(currentStreamId, rawMessage);
    logger.log(currentStreamId, 'meta', rawMessage, (msg.ts as number) || Date.now());
  }

  return currentStreamId;
}
```

- [ ] **Step 4: Run test**

Run: `cd server && npx vitest run tests/ws-broadcaster.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/ws-broadcaster.ts server/src/heartbeat.ts server/tests/ws-broadcaster.test.ts
git commit -m "feat: add WebSocket broadcaster handler and heartbeat"
```

---

### Task 7: WebSocket Viewer Handler

**Files:**
- Create: `server/src/ws-viewer.ts`
- Create: `server/tests/ws-viewer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/tests/ws-viewer.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { handleViewerConnection } from '../src/ws-viewer.js';
import { StreamManager } from '../src/stream-manager.js';
import { EventEmitter } from 'node:events';

function mockWs(): any {
  const ws = new EventEmitter() as any;
  ws.send = (data: string) => { ws.lastSent = data; ws.allSent = ws.allSent || []; ws.allSent.push(data); };
  ws.close = () => { ws.closeCalled = true; };
  ws.readyState = 1;
  ws.lastSent = null;
  ws.allSent = [];
  ws.closeCalled = false;
  return ws;
}

describe('handleViewerConnection', () => {
  let mgr: StreamManager;

  beforeEach(() => {
    mgr = new StreamManager();
  });

  it('sends snapshot and subscribes viewer to live stream', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    mgr.appendToBuffer('s1', Buffer.from('hello'));

    const viewer = mockWs();
    handleViewerConnection(viewer, 's1', mgr);

    const snapshot = JSON.parse(viewer.lastSent);
    expect(snapshot.type).toBe('snapshot');
    expect(mgr.getViewerCount('s1')).toBe(1);
  });

  it('sends error for non-existent stream', () => {
    const viewer = mockWs();
    handleViewerConnection(viewer, 'nonexistent', mgr);

    const msg = JSON.parse(viewer.lastSent);
    expect(msg.type).toBe('error');
    expect(viewer.closeCalled).toBe(true);
  });

  it('removes viewer on disconnect', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const viewer = mockWs();
    handleViewerConnection(viewer, 's1', mgr);
    expect(mgr.getViewerCount('s1')).toBe(1);

    viewer.emit('close');
    expect(mgr.getViewerCount('s1')).toBe(0);
  });
});
```

- [ ] **Step 2: Implement viewer handler**

```typescript
// server/src/ws-viewer.ts
import type WebSocket from 'ws';
import { StreamManager } from './stream-manager.js';

export function handleViewerConnection(ws: WebSocket, streamId: string, mgr: StreamManager): void {
  const stream = mgr.getStream(streamId);

  if (!stream) {
    ws.send(JSON.stringify({ type: 'error', message: 'Stream not found or has ended' }));
    ws.close();
    return;
  }

  mgr.addViewer(streamId, ws);

  ws.on('close', () => {
    mgr.removeViewer(streamId, ws);
  });

  ws.on('error', () => {
    mgr.removeViewer(streamId, ws);
  });
}
```

- [ ] **Step 3: Run test**

Run: `cd server && npx vitest run tests/ws-viewer.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/ws-viewer.ts server/tests/ws-viewer.test.ts
git commit -m "feat: add WebSocket viewer handler"
```

---

### Task 8: REST API Routes

**Files:**
- Create: `server/src/api.ts`
- Create: `server/tests/api.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/tests/api.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createApiRouter } from '../src/api.js';
import { StreamManager } from '../src/stream-manager.js';
import { EventEmitter } from 'node:events';
import http from 'node:http';

function mockWs(): any {
  const ws = new EventEmitter() as any;
  ws.send = () => {};
  ws.close = () => {};
  ws.readyState = 1;
  return ws;
}

async function request(app: express.Express, path: string, headers?: Record<string, string>): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      fetch(`http://localhost:${port}${path}`, { headers })
        .then(async (res) => {
          const body = await res.json();
          server.close();
          resolve({ status: res.status, body });
        });
    });
  });
}

describe('API routes', () => {
  let app: express.Express;
  let mgr: StreamManager;

  beforeEach(() => {
    mgr = new StreamManager();
    app = express();
    app.use('/api', createApiRouter(mgr, null as any, 'test-secret'));
  });

  it('GET /api/streams returns empty when no streams', async () => {
    const { status, body } = await request(app, '/api/streams');
    expect(status).toBe(200);
    expect(body.streams).toEqual([]);
  });

  it('GET /api/streams returns live streams with viewer count', async () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const { body } = await request(app, '/api/streams');
    expect(body.streams).toHaveLength(1);
    expect(body.streams[0].id).toBe('s1');
    expect(body.streams[0].viewer_count).toBe(0);
  });

  it('GET /api/streams/:id returns stream details', async () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const { body } = await request(app, '/api/streams/s1');
    expect(body.id).toBe('s1');
    expect(body.title).toBe('test');
  });

  it('GET /api/streams/:id returns 404 for missing stream', async () => {
    const { status } = await request(app, '/api/streams/nonexistent');
    expect(status).toBe(404);
  });
});
```

- [ ] **Step 2: Implement API routes**

```typescript
// server/src/api.ts
import { Router, type Request, type Response } from 'express';
import { StreamManager } from './stream-manager.js';
import { verifyJwt, extractBearerToken } from './auth.js';
import { getLiveStreams, getStream as dbGetStream, type DbPool } from './db.js';

export function createApiRouter(mgr: StreamManager, pool: DbPool | null, jwtSecret: string): Router {
  const router = Router();

  // List live streams
  router.get('/streams', async (_req: Request, res: Response) => {
    // Prefer in-memory data for live streams (has viewer count)
    const active = mgr.getActiveStreams().slice(0, 50);
    const streams = active.map((s) => ({
      id: s.metadata.id,
      title: s.metadata.title,
      agent: s.metadata.agent,
      status: 'live',
      user: { id: s.metadata.userId, username: s.metadata.username, avatar_url: s.metadata.avatarUrl },
      started_at: s.metadata.startedAt.toISOString(),
      viewer_count: s.viewers.size,
    }));
    res.json({ streams });
  });

  // Stream details
  router.get('/streams/:id', async (req: Request, res: Response) => {
    const stream = mgr.getStream(req.params.id);
    if (stream) {
      res.json({
        id: stream.metadata.id,
        title: stream.metadata.title,
        agent: stream.metadata.agent,
        status: 'live',
        user: { id: stream.metadata.userId },
        started_at: stream.metadata.startedAt.toISOString(),
        viewer_count: stream.viewers.size,
      });
      return;
    }

    // Fall back to DB for ended streams
    if (pool) {
      const dbStream = await dbGetStream(pool, req.params.id);
      if (dbStream) {
        res.json(dbStream);
        return;
      }
    }

    res.status(404).json({ error: 'Stream not found' });
  });

  // Current user info
  router.get('/me', (req: Request, res: Response) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const payload = verifyJwt(token, jwtSecret);
      // Look up avatar_url from DB if available
      let avatarUrl = '';
      if (pool) {
        const result = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [payload.sub]);
        if (result.rows[0]) avatarUrl = result.rows[0].avatar_url || '';
      }
      res.json({ id: payload.sub, username: payload.username, avatar_url: avatarUrl });
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  return router;
}
```

- [ ] **Step 3: Run test**

Run: `cd server && npx vitest run tests/api.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/api.ts server/tests/api.test.ts
git commit -m "feat: add REST API routes for streams and user info"
```

---

### Task 9: Server Entry Point & Graceful Shutdown

**Files:**
- Create: `server/src/index.ts`

- [ ] **Step 1: Implement server entry**

```typescript
// server/src/index.ts
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { config } from './config.js';
import { createPool, ensureSchema, endStream as dbEndStream, type DbPool } from './db.js';
import { createClickHouseLogger, ensureClickHouseSchema, EventLogger } from './clickhouse.js';
import { createAuthRouter, verifyJwt, extractBearerToken } from './auth.js';
import { createApiRouter } from './api.js';
import { StreamManager } from './stream-manager.js';
import { handleBroadcasterMessage } from './ws-broadcaster.js';
import { handleViewerConnection } from './ws-viewer.js';
import { startHeartbeat } from './heartbeat.js';

async function main() {
  // Database setup
  const pool: DbPool = createPool(config.databaseUrl);
  await ensureSchema(pool);

  // ClickHouse setup
  let logger: EventLogger;
  try {
    await ensureClickHouseSchema(config.clickhouseUrl);
    logger = createClickHouseLogger(config.clickhouseUrl);
  } catch (err) {
    console.warn('[aistreamer] ClickHouse not available, events will not be logged:', err);
    logger = new EventLogger(); // no-op logger
  }

  // Stream manager
  const mgr = new StreamManager();

  // Express app
  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());
  app.use('/auth', createAuthRouter(pool));
  app.use('/api', createApiRouter(mgr, pool, config.jwtSecret));

  // Health check
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // HTTP server
  const server = http.createServer(app);

  // WebSocket server for broadcasters (/stream)
  const broadcasterWss = new WebSocketServer({ noServer: true });
  // WebSocket server for viewers (/watch/:id)
  const viewerWss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (url.pathname === '/stream') {
      // Authenticate broadcaster
      const token = extractBearerToken(req.headers.authorization);
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      let userId: string;
      let username: string;
      try {
        const payload = verifyJwt(token, config.jwtSecret);
        userId = payload.sub;
        username = payload.username;
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      broadcasterWss.handleUpgrade(req, socket, head, (ws) => {
        broadcasterWss.emit('connection', ws, req, userId, username);
      });
    } else if (url.pathname.startsWith('/watch/')) {
      const streamId = url.pathname.slice('/watch/'.length);
      viewerWss.handleUpgrade(req, socket, head, (ws) => {
        viewerWss.emit('connection', ws, req, streamId);
      });
    } else {
      socket.destroy();
    }
  });

  // Broadcaster connections
  broadcasterWss.on('connection', (ws: WebSocket, _req: any, userId: string, username: string) => {
    let currentStreamId: string | null = null;
    const stopHeartbeat = startHeartbeat(ws, () => {
      // Dead broadcaster — clean up
      if (currentStreamId) {
        mgr.endStream(currentStreamId);
        dbEndStream(pool, currentStreamId).catch(() => {});
      }
      ws.terminate();
    });

    ws.on('message', async (data: Buffer) => {
      currentStreamId = await handleBroadcasterMessage(
        ws, mgr, logger, userId, username, '', data.toString(), currentStreamId, pool
      );
    });

    ws.on('close', async () => {
      stopHeartbeat();
      if (currentStreamId) {
        mgr.endStream(currentStreamId);
        try { await dbEndStream(pool, currentStreamId); } catch {}
      }
    });

    ws.on('error', () => {});
  });

  // Viewer connections
  viewerWss.on('connection', (ws: WebSocket, _req: any, streamId: string) => {
    const stopHeartbeat = startHeartbeat(ws, () => {
      mgr.removeViewer(streamId, ws);
      ws.terminate();
    });

    handleViewerConnection(ws, streamId, mgr);

    ws.on('close', () => stopHeartbeat());
    ws.on('error', () => {});
  });

  // Start server
  server.listen(config.port, () => {
    console.log(`[aistreamer] Server running on port ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[aistreamer] Shutting down...');

    // End all streams
    const endedIds = mgr.endAll();
    for (const id of endedIds) {
      try { await dbEndStream(pool, id); } catch {}
    }

    // Close WebSocket servers
    broadcasterWss.close();
    viewerWss.close();

    // Flush ClickHouse
    await logger.close();

    // Close HTTP server
    server.close();

    // Close DB
    await pool.end();

    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[aistreamer] Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors (may need to fix import paths)

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: add server entry point with WebSocket routing and graceful shutdown"
```

---

### Task 10: Integration Test

**Files:**
- Create: `server/tests/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// server/tests/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StreamManager } from '../src/stream-manager.js';
import { EventLogger } from '../src/clickhouse.js';
import { handleBroadcasterMessage } from '../src/ws-broadcaster.js';
import { handleViewerConnection } from '../src/ws-viewer.js';
import { EventEmitter } from 'node:events';

function mockWs(): any {
  const ws = new EventEmitter() as any;
  ws.send = (data: string) => { ws.lastSent = data; ws.allSent = ws.allSent || []; ws.allSent.push(data); };
  ws.close = () => { ws.closeCalled = true; };
  ws.readyState = 1;
  ws.lastSent = null;
  ws.allSent = [];
  ws.closeCalled = false;
  return ws;
}

describe('Integration: broadcaster → viewer flow', () => {
  let mgr: StreamManager;
  let logger: EventLogger;
  let logged: any[];

  beforeEach(() => {
    mgr = new StreamManager();
    logged = [];
    logger = new EventLogger({ flushFn: async (e) => logged.push(...e), maxBatchSize: 1000, flushIntervalMs: 60000 });
  });

  afterEach(async () => {
    await logger.close();
  });

  it('full lifecycle: start → stream data → viewer joins → stream ends', async () => {
    const broadcaster = mockWs();

    // 1. Start stream
    const streamId = await handleBroadcasterMessage(
      broadcaster, mgr, logger, 'user1', 'testuser', '',
      JSON.stringify({ type: 'stream_start', title: 'E2E Test', agent: 'claude-code', cols: 120, rows: 40, protocol_version: 1 }),
      null
    );
    expect(streamId).toBeTruthy();

    // 2. Send some terminal data
    const termData = Buffer.from('Hello, viewers!').toString('base64');
    await handleBroadcasterMessage(
      broadcaster, mgr, logger, 'user1', 'testuser', '',
      JSON.stringify({ ch: 'term', data: termData, ts: Date.now() }),
      streamId
    );

    // 3. Viewer joins mid-stream
    const viewer = mockWs();
    handleViewerConnection(viewer, streamId!, mgr);

    // Viewer should get snapshot with accumulated data
    const snapshot = JSON.parse(viewer.allSent[0]);
    expect(snapshot.type).toBe('snapshot');
    expect(Buffer.from(snapshot.data, 'base64').toString()).toBe('Hello, viewers!');

    // 4. More data arrives — viewer should get it
    const moreData = Buffer.from(' More data!').toString('base64');
    await handleBroadcasterMessage(
      broadcaster, mgr, logger, 'user1', 'testuser', '',
      JSON.stringify({ ch: 'term', data: moreData, ts: Date.now() }),
      streamId
    );
    expect(viewer.allSent.length).toBe(2); // snapshot + term message

    // 5. Stream ends
    await handleBroadcasterMessage(
      broadcaster, mgr, logger, 'user1', 'testuser', '',
      JSON.stringify({ type: 'stream_end', reason: 'exit', exit_code: 0, duration_s: 60 }),
      streamId
    );

    // Viewer should get stream_ended
    const ended = JSON.parse(viewer.allSent[viewer.allSent.length - 1]);
    expect(ended.type).toBe('stream_ended');

    // Stream should be gone
    expect(mgr.getStream(streamId!)).toBeUndefined();

    // Events should be logged
    await logger.close();
    expect(logged.length).toBe(2); // two term messages
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd server && npx vitest run tests/integration.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `cd server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add server/tests/integration.test.ts
git commit -m "test: add end-to-end integration test for broadcaster→viewer flow"
```

---

### Task 11: Manual Smoke Test

**Files:**
- Possibly modify: `server/src/index.ts`, `server/src/config.ts`

- [ ] **Step 1: Create .env for local development**

```bash
cd server
cp .env.example .env
# Edit .env to set JWT_SECRET to a random value
```

- [ ] **Step 2: Start server (expect partial functionality without Postgres)**

Run: `cd server && npx tsx src/index.ts 2>&1`
Expected: Server starts or shows clear error about missing DB

- [ ] **Step 3: Test health endpoint**

Run: `curl http://localhost:3000/health`
Expected: `{"ok":true}`

- [ ] **Step 4: Test streams API**

Run: `curl http://localhost:3000/api/streams`
Expected: `{"streams":[]}`

- [ ] **Step 5: Run full test suite one more time**

Run: `cd server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore: polish backend server for smoke testing"
```
