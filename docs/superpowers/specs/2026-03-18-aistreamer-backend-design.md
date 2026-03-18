# aistreamer Backend — Design Spec

**Sub-system:** 2 of 3 (Backend Server)
**Date:** 2026-03-18
**Status:** Draft

## Overview

The aistreamer backend is a Node.js server that relays real-time terminal streams from CLI broadcasters to web viewers. It handles authentication, stream lifecycle management, and event logging. Lives in `server/` within the monorepo alongside the CLI.

## Architecture

```
CLI (broadcaster)                    Viewers (web app)
    │                                      │
    ▼                                      ▼
[WS: /stream]                       [WS: /watch/:id]
    │                                      ▲
    ▼                                      │
┌──────────────── Server ─────────────────┐
│                                          │
│  ws-broadcaster.ts    ws-viewer.ts       │
│        │                   ▲             │
│        ▼                   │             │
│     StreamManager (in-memory pub/sub)    │
│        │              │                  │
│        ▼              ▼                  │
│    Postgres       ClickHouse             │
│    (users,        (stream events)        │
│     streams)                             │
└──────────────────────────────────────────┘
```

### Components

- **Express** — HTTP server for REST API and OAuth routes
- **ws** — WebSocket server for both broadcaster and viewer connections
- **StreamManager** — in-memory pub/sub that fans out messages from broadcaster to viewers. Abstracted so it can be swapped for Redis later.
- **Postgres** — relational data: users, stream metadata
- **ClickHouse** — append-only event log for stream data (terminal output, structured events)

## WebSocket Protocol — Broadcaster Side

The CLI connects to `ws://server/stream` with `Authorization: Bearer <jwt>` on the HTTP upgrade request. The server validates the JWT during upgrade and rejects with 401 if invalid.

### Message Flow

1. **CLI sends `stream_start`:**
```json
{"type": "stream_start", "title": "Building auth", "agent": "claude-code", "cols": 120, "rows": 40, "protocol_version": 1}
```

2. **Server creates stream in Postgres, registers in StreamManager, responds:**
```json
{"type": "stream_started", "stream_id": "01HXYZ...", "url": "https://aistreamer.dev/s/01HXYZ..."}
```

3. **CLI streams messages for the duration of the session:**
```json
{"ch": "term", "data": "<base64>", "ts": 1710720000}
{"ch": "meta", "event": "tool_start", "tool": "Edit", "file": "app.ts", "ts": 1710720000}
```

4. **CLI sends `stream_end` when done:**
```json
{"type": "stream_end", "reason": "exit", "exit_code": 0, "duration_s": 3600}
```

5. **Server marks stream as ended in Postgres, cleans up StreamManager.**

All `term` and `meta` messages are:
- Fanned out to connected viewers via StreamManager
- Written to ClickHouse for logging

## WebSocket Protocol — Viewer Side

Viewers connect to `ws://server/watch/:streamId`. No authentication required.

### Connection Flow

1. Server looks up stream in StreamManager
2. If stream is live, sends a `snapshot` message with accumulated terminal output:
```json
{"type": "snapshot", "data": "<base64 accumulated output>", "cols": 120, "rows": 40, "title": "Building auth", "agent": "claude-code"}
```
3. All subsequent `term` and `meta` messages from the broadcaster are forwarded as-is
4. If stream doesn't exist or has ended, sends error and closes:
```json
{"type": "error", "message": "Stream not found or has ended"}
```

### Viewer Lifecycle

- Viewers are added to the stream's viewer set on connect
- Removed on disconnect
- Viewer count of 0 is fine — broadcaster continues regardless
- No messages flow from viewer to broadcaster (read-only)

## REST API

All endpoints return JSON. CORS enabled for the viewer web app origin.

### Public Endpoints (No Auth)

**`GET /api/streams`** — List live streams
```json
{
  "streams": [
    {
      "id": "01HXYZ...",
      "title": "Building auth",
      "agent": "claude-code",
      "user": {"id": "01HABC...", "username": "em", "avatar_url": "..."},
      "started_at": "2026-03-18T10:00:00Z",
      "viewer_count": 5
    }
  ]
}
```

**`GET /api/streams/:id`** — Stream details
```json
{
  "id": "01HXYZ...",
  "title": "Building auth",
  "agent": "claude-code",
  "status": "live",
  "user": {"id": "01HABC...", "username": "em", "avatar_url": "..."},
  "started_at": "2026-03-18T10:00:00Z",
  "viewer_count": 5
}
```

### Auth Endpoints

**`GET /auth/github`** — Start GitHub OAuth flow
- Query param: `callback_port` (the CLI's local callback port)
- Redirects to GitHub's OAuth authorize URL

**`GET /auth/github/callback`** — Handle GitHub callback
- Exchanges code for access token
- Creates or finds user in Postgres
- Issues JWT
- Redirects to CLI's local callback with token and user info

### Protected Endpoints (JWT Required)

**`GET /api/me`** — Current user info
```json
{
  "id": "01HABC...",
  "username": "em",
  "avatar_url": "..."
}
```

## Authentication

### GitHub OAuth Flow

1. CLI calls `GET /auth/github?callback_port=9876`
2. Server stores `callback_port` in OAuth state parameter
3. Redirects to `https://github.com/login/oauth/authorize?client_id=...&state=...`
4. GitHub redirects back to `GET /auth/github/callback?code=...&state=...`
5. Server exchanges code for GitHub access token
6. Fetches GitHub user info (`GET https://api.github.com/user`)
7. Creates user in Postgres if new (ULID for ID)
8. Issues JWT containing `{sub: userId, username: githubUsername}`
9. Redirects to `http://localhost:{callback_port}/callback?token=<jwt>&user_id=<id>&username=<username>&avatar_url=<url>`

### JWT

- Signed with `HS256` using a server secret (env var `JWT_SECRET`)
- Contains: `sub` (user ULID), `username`, `iat`, `exp` (30 days)
- Verified on WebSocket upgrade for broadcaster connections
- Verified on protected REST endpoints via `Authorization: Bearer` header

## Data Model

### Postgres

```sql
CREATE TABLE users (
  id          text PRIMARY KEY,           -- ULID
  github_id   text UNIQUE NOT NULL,
  username    text NOT NULL,
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE streams (
  id          text PRIMARY KEY,           -- ULID
  user_id     text REFERENCES users(id),
  title       text DEFAULT '',
  agent       text DEFAULT 'unknown',
  status      text DEFAULT 'live',        -- 'live' | 'ended'
  started_at  timestamptz DEFAULT now(),
  ended_at    timestamptz,
  cols        int DEFAULT 80,
  rows        int DEFAULT 24
);

CREATE INDEX idx_streams_status ON streams(status);
CREATE INDEX idx_streams_user_id ON streams(user_id);
```

### ClickHouse

```sql
CREATE TABLE stream_events (
  stream_id   String,
  channel     String,                     -- 'term' | 'meta'
  data        String,                     -- raw JSON payload
  ts          DateTime64(3),
  inserted_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY (stream_id, ts);
```

All `term` and `meta` messages from broadcasters are appended here. This enables future stream replay and analytics.

## StreamManager

The in-memory pub/sub abstraction:

```typescript
interface ActiveStream {
  broadcaster: WebSocket;
  viewers: Set<WebSocket>;
  buffer: Buffer;           // accumulated terminal output for catch-up
  metadata: {
    id: string;
    title: string;
    agent: string;
    cols: number;
    rows: number;
    userId: string;
    startedAt: Date;
  };
}

class StreamManager {
  private streams: Map<string, ActiveStream>;

  registerStream(id: string, broadcaster: WebSocket, metadata: StreamMetadata): void;
  endStream(id: string): void;

  addViewer(streamId: string, viewer: WebSocket): void;    // sends snapshot, subscribes
  removeViewer(streamId: string, viewer: WebSocket): void;

  broadcast(streamId: string, message: string): void;       // fan out to viewers
  appendToBuffer(streamId: string, data: Buffer): void;     // accumulate for catch-up

  getActiveStreams(): ActiveStream[];
  getStream(id: string): ActiveStream | undefined;
  getViewerCount(id: string): number;
}
```

The `broadcast()` method iterates the viewer Set directly. To scale to multiple server instances, this could be replaced with Redis pub/sub without changing the interface.

### Buffer Management

The `buffer` accumulates raw terminal bytes for viewer catch-up snapshots. To prevent unbounded growth:
- Buffer is capped at 1MB
- When exceeded, the oldest half is discarded (viewers joining very late may miss early output — acceptable for live streaming)

## Project Structure

```
server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            — server entry, Express + ws setup
│   ├── config.ts           — env vars (PORT, DB URLs, JWT_SECRET, GITHUB_CLIENT_*)
│   ├── db.ts               — Postgres client (pg), schema migrations
│   ├── clickhouse.ts       — ClickHouse client, event insert
│   ├── auth.ts             — GitHub OAuth routes, JWT issue/verify
│   ├── api.ts              — REST routes (/api/streams, /api/me)
│   ├── stream-manager.ts   — in-memory pub/sub, viewer fan-out, buffer
│   ├── ws-broadcaster.ts   — WebSocket handler for CLI connections
│   └── ws-viewer.ts        — WebSocket handler for viewer connections
shared/
└── protocol.ts             — message type definitions (used by CLI + server)
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server, REST API |
| `ws` | WebSocket server |
| `pg` | Postgres client |
| `@clickhouse/client` | ClickHouse client |
| `jsonwebtoken` | JWT sign/verify |
| `ulid` | ULID generation |
| `cors` | CORS middleware |
| `dotenv` | Env var loading |

Dev dependencies: `typescript`, `tsx`, `vitest`, `@types/express`, `@types/ws`, `@types/pg`, `@types/jsonwebtoken`

## Configuration

Environment variables (loaded via `dotenv`):

```
PORT=3000
DATABASE_URL=postgresql://localhost:5432/aistreamer
CLICKHOUSE_URL=http://localhost:8123
JWT_SECRET=<random secret>
GITHUB_CLIENT_ID=<from GitHub OAuth app>
GITHUB_CLIENT_SECRET=<from GitHub OAuth app>
CORS_ORIGIN=http://localhost:5173
```

## MVP Scope

### In Scope
- WebSocket relay: broadcaster → viewers via in-memory StreamManager
- Viewer catch-up snapshot on connect (accumulated buffer)
- GitHub OAuth flow (issue JWT for CLI, store users in Postgres)
- JWT verification on broadcaster WebSocket upgrade
- REST API: list live streams, stream details, current user
- Stream events logged to ClickHouse
- ULID for all IDs
- Shared protocol types between CLI and server
- CORS for viewer web app
- Buffer cap (1MB) to prevent memory leaks

### Out of Scope (Future)
- Comments / chat system
- Redis pub/sub for multi-server scaling
- Stream recording replay from ClickHouse
- Rate limiting / abuse prevention
- Stream thumbnails / previews
- User profiles / settings pages
- Admin endpoints
- Docker / deploy configuration
- WebSocket compression

## Error Handling

- **Broadcaster disconnects unexpectedly:** Mark stream as ended in Postgres, clean up StreamManager, notify viewers with `{"type": "stream_ended"}`
- **Viewer connects to non-existent stream:** Send error message, close WebSocket
- **Database unavailable:** Server logs error, returns 500. Stream relay still works (in-memory only, no persistence)
- **ClickHouse unavailable:** Log warning, continue relay. Events are dropped (acceptable for MVP — not critical path)
- **Invalid JWT on upgrade:** Reject with 401 before WebSocket is established
- **GitHub OAuth fails:** Redirect to CLI callback with error parameter

## Security Considerations

- JWT secret must be a strong random value (not committed to repo)
- GitHub client secret stored as env var only
- CORS restricted to specific viewer app origin
- WebSocket broadcaster connections require valid JWT
- Viewer connections are unauthenticated but read-only
- No user input is rendered as HTML (XSS prevention)
- Postgres queries use parameterized statements (SQL injection prevention)
