# aistreamer Viewer Web App — Design Spec

**Sub-system:** 3 of 3 (Viewer Web App)
**Date:** 2026-03-21
**Status:** Draft

## Overview

The aistreamer viewer is a React SPA that lets anyone watch live AI agent coding sessions. It connects to the backend via REST API (browse) and WebSocket (watch). No authentication — viewing is fully anonymous.

Lives in `web/` within the monorepo.

## Architecture

```
Browser
  │
  ├── GET /api/streams          → Browse page (card grid)
  │
  └── ws://server/watch/:id     → Watch page (xterm.js terminal)
```

### Tech Stack

- **React 19** + **Vite**
- **shadcn/ui** — sidebar, card, badge, scroll-area, button, toggle
- **Tailwind CSS v4**
- **xterm.js** — terminal rendering
- **React Router** — client-side routing
- **@xterm/addon-fit** — auto-resize terminal to container

### No Auth

Viewers are anonymous. No login, no tokens, no protected routes. Authentication is only required for broadcasting (handled by the CLI).

## Pages

### Browse Page (`/`)

Card grid of live streams. Data from `GET /api/streams`.

Each stream card shows:
- Stream title
- Username + avatar (from API response)
- Agent type badge (e.g., "claude-code", "aider")
- Viewer count
- Duration (computed client-side from `started_at`)
- Green live indicator dot

Cards link to `/s/:streamId`.

**Data fetching:** Poll `GET /api/streams` every 10 seconds. No WebSocket for the browse page — simple and sufficient for MVP.

**Empty state:** "No streams live right now" with a brief explanation of what aistreamer is and how to start streaming.

### Watch Page (`/s/:streamId`)

Three-panel layout:

```
┌──────┬──────────────────────────────┬──────────┐
│ Nav  │         Terminal             │ Activity │
│ Side │        (xterm.js)            │  Feed    │
│ bar  │                              │          │
│      │                              │          │
│(col- │                              │          │
│lapsi-│                              │          │
│ble)  │                              │          │
└──────┴──────────────────────────────┴──────────┘
```

#### Left Panel: Collapsible Sidebar

shadcn collapsible sidebar. Toggles between expanded (icons + text) and collapsed (icons only).

**Expanded state:**
- App logo/name at top
- Navigation: Browse
- "Live Now" section at bottom listing other active streams (fetched from `/api/streams`)

**Collapsed state:**
- Icon-only navigation
- No "Live Now" section

Default: collapsed on watch page to maximize terminal space.

#### Center Panel: Terminal

- **Header bar:** stream title, `@username`, viewer count (polled), live duration
- **Terminal area:** xterm.js instance sized to the broadcaster's dimensions
- Terminal is initialized with `cols`/`rows` from the `snapshot` message, not auto-fitted to container
- If the broadcaster's terminal is larger than the viewport, the container scrolls horizontally
- `@xterm/addon-fit` is NOT used — viewer terminal must match broadcaster dimensions exactly
- `@xterm/addon-webgl` used for GPU-accelerated rendering (high-throughput streams)
- Dark terminal background (always dark, regardless of app theme)

**Viewer count:** Polled from `GET /api/streams/:streamId` every 10 seconds. Not available via WebSocket.

#### Right Panel: Activity Feed

Scrolling feed of structured meta events from the agent. Each event shows:

- **Icon** — color-coded by event type
- **Description** — e.g., "Edit auth.ts", "Bash npm test"
- **Timestamp** — relative ("2s ago", "1m ago")

Event types and their display:

| Event | Icon | Color | Display |
|-------|------|-------|---------|
| `tool_start` | spinner | blue | "Edit auth.ts" / "Bash npm test" |
| `tool_end` (success) | check | green | "Edit auth.ts ✓" |
| `tool_end` (failure) | x | red | "Edit auth.ts ✗" |
| `file_change` (create) | plus | green | "Created db.ts" |
| `file_change` (edit) | pencil | blue | "Edited config.ts" |
| `agent_message` | message | gray | truncated message summary |

The feed auto-scrolls to the latest event. Maximum 100 events kept in state (older events discarded).

**Stream info section** at the bottom of the activity panel:
- Agent type
- Total duration
- Tool use count

## WebSocket Integration

### Connection Flow

1. Component mounts → connect to `ws://server/watch/:streamId`
2. Receive `snapshot` message → resize terminal to broadcaster's cols/rows, decode base64 to Uint8Array, write to xterm.js
3. Receive `term` messages → if resize, call `terminal.resize(cols, rows)`; if data, decode base64 to Uint8Array, write to xterm.js
4. Receive `meta` messages → append to activity feed state
5. Receive `stream_ended` → show "Stream ended" overlay on terminal
6. Receive `error` → show error state (stream not found)
7. Connection lost → show reconnecting indicator, attempt reconnect 3 times

### Message Handling

```typescript
// Incoming messages from server
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  // Helper: decode base64 to Uint8Array (not atob — handles binary/UTF-8 correctly)
  const decodeBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  switch (msg.type) {
    case 'snapshot':
      terminal.resize(msg.cols, msg.rows);
      terminal.write(decodeBase64(msg.data));
      setStreamInfo({ title: msg.title, agent: msg.agent, cols: msg.cols, rows: msg.rows });
      break;
    case 'stream_ended':
      setStreamState('ended');
      break;
    case 'error':
      setStreamState('error');
      break;
  }

  if (msg.ch === 'term') {
    if (msg.type === 'resize') {
      terminal.resize(msg.cols, msg.rows);
    } else if (msg.data) {
      terminal.write(decodeBase64(msg.data));
    }
  }

  if (msg.ch === 'meta') {
    addActivityEvent(msg);
  }
};
```

### Terminal Sizing

The viewer terminal uses the broadcaster's dimensions, not the container size. The terminal is initialized from the `snapshot` message's `cols`/`rows` and updated when resize messages arrive (`{"ch": "term", "type": "resize", "cols": N, "rows": N}`). `@xterm/addon-fit` is not used — the terminal must match the broadcaster exactly to avoid line-wrapping artifacts.

### Reconnection

On reconnection, `terminal.reset()` must be called before writing the new snapshot to avoid doubled output. The server sends a fresh snapshot on each viewer connect.

## UI States

### Watch Page States

- **Loading:** skeleton terminal + sidebar while connecting
- **Connected:** live terminal rendering with activity feed
- **Stream ended:** terminal frozen, overlay "This stream has ended" with link to browse
- **Not found:** "Stream not found" with link to browse
- **Connection lost:** terminal frozen, banner "Connection lost. Reconnecting..." with retry count
- **Reconnecting:** same as connection lost but with spinner

### Browse Page States

- **Loading:** skeleton card grid
- **Streams available:** card grid
- **Empty:** "No streams live right now" message

## Responsive Design

| Breakpoint | Layout |
|------------|--------|
| Desktop (≥1024px) | Three-panel: sidebar + terminal + activity |
| Tablet (768-1023px) | Two-panel: terminal + activity (sidebar hidden) |
| Mobile (<768px) | Terminal only, activity in bottom sheet toggle |

On mobile, a floating button toggles a bottom sheet containing the activity feed.

## Theme

- Light/dark toggle using shadcn's theme system
- Default: dark mode
- Terminal area is always dark regardless of app theme
- Clean, minimal aesthetic (Linear-inspired)

## Project Structure

```
web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── index.html
├── public/
├── src/
│   ├── main.tsx                    — entry point, router setup
│   ├── App.tsx                     — root layout with sidebar provider
│   ├── components/
│   │   ├── ui/                     — shadcn components
│   │   ├── app-sidebar.tsx         — collapsible nav sidebar
│   │   ├── stream-card.tsx         — browse page stream card
│   │   ├── terminal-view.tsx       — xterm.js wrapper component
│   │   ├── activity-feed.tsx       — meta event feed
│   │   ├── activity-event.tsx      — single event row
│   │   ├── stream-header.tsx       — watch page header bar
│   │   ├── stream-ended-overlay.tsx
│   │   └── theme-toggle.tsx
│   ├── pages/
│   │   ├── browse.tsx              — browse page
│   │   └── watch.tsx               — watch page
│   ├── hooks/
│   │   ├── use-stream.ts           — WebSocket connection + state
│   │   ├── use-streams.ts          — polling GET /api/streams
│   │   └── use-theme.ts            — light/dark toggle
│   └── lib/
│       ├── api.ts                  — fetch wrapper for REST API
│       ├── utils.ts                — shadcn cn() helper
│       └── types.ts                — shared frontend types
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `react`, `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `@xterm/xterm` | Terminal rendering |
| `@xterm/addon-webgl` | GPU-accelerated terminal rendering |
| `tailwindcss` | Styling |
| `class-variance-authority` | shadcn component variants |
| `clsx`, `tailwind-merge` | shadcn utility |
| `lucide-react` | Icons |

Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`

## Configuration

Vite config sets the API proxy for development:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/watch': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
```

Production: served by a static file server or CDN. Configure via env vars:
- `VITE_API_URL` — REST API base URL (e.g., `https://aistreamer.dev`)
- WebSocket URL is derived from `VITE_API_URL` by replacing `https://` with `wss://` (or `http://` with `ws://`)

## MVP Scope

### In Scope
- Watch page: xterm.js terminal + activity feed + collapsible sidebar
- Browse page: card grid of live streams, 10s polling
- React Router (`/`, `/s/:streamId`)
- shadcn/ui components
- Tailwind CSS, dark/light toggle (dark default)
- Error states: not found, ended, connection lost
- Reconnection (3 attempts)
- Responsive: desktop/tablet/mobile layouts

### Out of Scope
- Authentication (viewers are anonymous)
- Comments / chat
- Stream recording replay
- Search / filter on browse
- User profiles
- Notifications
- PWA / offline
- Keyboard shortcuts
- Stream sharing / embed

## Error Handling

- **WebSocket connection fails:** Show error state, retry 3 times with exponential backoff (1s, 2s, 4s)
- **API request fails:** Show error in browse page, retry on next poll interval
- **Invalid stream ID in URL:** Show "Stream not found" with link to browse
- **xterm.js fails to initialize:** Show fallback message (extremely unlikely)
