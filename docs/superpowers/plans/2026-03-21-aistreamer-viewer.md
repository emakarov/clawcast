# aistreamer Viewer Web App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React SPA for watching live AI agent coding sessions, with a browse page (card grid) and watch page (xterm.js terminal + activity feed).

**Architecture:** React 19 + Vite + shadcn/ui + Tailwind. Browse page polls REST API. Watch page connects via WebSocket and renders terminal output with xterm.js. Collapsible shadcn sidebar for navigation.

**Tech Stack:** React 19, Vite, shadcn/ui, Tailwind CSS v4, xterm.js, @xterm/addon-webgl, React Router, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-21-aistreamer-viewer-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `web/package.json` | Package config |
| `web/tsconfig.json` | TypeScript config |
| `web/vite.config.ts` | Vite config with API proxy |
| `web/index.html` | HTML entry point |
| `web/src/main.tsx` | React entry, router setup |
| `web/src/App.tsx` | Root layout with sidebar provider |
| `web/src/lib/utils.ts` | shadcn cn() helper + formatDuration |
| `web/src/lib/types.ts` | Frontend types (stream, activity event) |
| `web/src/lib/api.ts` | Fetch wrapper for REST API |
| `web/src/hooks/use-stream.ts` | WebSocket connection + terminal state |
| `web/src/hooks/use-streams.ts` | Polling GET /api/streams |
| `web/src/hooks/use-theme.ts` | Dark/light toggle |
| `web/src/components/ui/` | shadcn components |
| `web/src/components/terminal-view.tsx` | xterm.js wrapper |
| `web/src/components/activity-feed.tsx` | Meta event feed |
| `web/src/components/activity-event.tsx` | Single event row |
| `web/src/components/stream-header.tsx` | Watch page header bar |
| `web/src/components/stream-card.tsx` | Browse page card |
| `web/src/components/stream-ended-overlay.tsx` | Stream ended overlay |
| `web/src/components/app-sidebar.tsx` | Collapsible nav sidebar |
| `web/src/components/theme-toggle.tsx` | Theme toggle button |
| `web/src/pages/browse.tsx` | Browse page |
| `web/src/pages/watch.tsx` | Watch page |

---

### Task 1: Scaffold React + Vite + shadcn/ui

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`
- Create: `web/src/main.tsx`, `web/src/App.tsx`
- Create: `web/src/lib/utils.ts`
- Create: `web/components.json` (shadcn config)

- [ ] **Step 1: Create web directory and scaffold Vite + React**

```bash
cd /Users/em/dev/aistreamer
npm create vite@latest web -- --template react-ts
cd web
npm install
```

- [ ] **Step 2: Install Tailwind CSS v4**

```bash
cd /Users/em/dev/aistreamer/web
npm install tailwindcss @tailwindcss/vite
```

Update `web/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/watch': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
```

Replace `web/src/index.css` with:
```css
@import "tailwindcss";
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
cd /Users/em/dev/aistreamer/web
npx shadcn@latest init
```

Select: New York style, Zinc base color, CSS variables.

- [ ] **Step 4: Add shadcn components needed for the app**

```bash
cd /Users/em/dev/aistreamer/web
npx shadcn@latest add sidebar card badge scroll-area button separator sheet tooltip avatar
```

- [ ] **Step 5: Install remaining dependencies**

```bash
cd /Users/em/dev/aistreamer/web
npm install react-router-dom @xterm/xterm @xterm/addon-webgl lucide-react
```

- [ ] **Step 6: Verify and extend lib/utils.ts**

Verify `web/src/lib/utils.ts` exists with the `cn()` helper (created by shadcn init). Add `formatDuration`:

```typescript
// Append to web/src/lib/utils.ts (after cn() helper)

export function formatDuration(startedAt: string): string {
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
```

- [ ] **Step 7: Create minimal main.tsx with router**

```typescript
// web/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<div>Browse (coming soon)</div>} />
          <Route path="s/:streamId" element={<div>Watch (coming soon)</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 8: Create minimal App.tsx**

```typescript
// web/src/App.tsx
import { Outlet } from 'react-router-dom'

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  )
}
```

- [ ] **Step 9: Verify dev server starts**

Run: `cd /Users/em/dev/aistreamer/web && npm run dev`
Expected: Vite dev server starts, page renders at localhost:5173

- [ ] **Step 10: Commit**

```bash
git add web/
git commit -m "chore: scaffold viewer web app with React, Vite, shadcn/ui"
```

---

### Task 2: Types & API Client

**Files:**
- Create: `web/src/lib/types.ts`
- Create: `web/src/lib/api.ts`

- [ ] **Step 1: Create frontend types**

```typescript
// web/src/lib/types.ts
export interface StreamUser {
  id: string
  username: string
  avatar_url: string
}

export interface StreamInfo {
  id: string
  title: string
  agent: string
  status: 'live' | 'ended'
  user: StreamUser
  started_at: string
  viewer_count: number
}

export interface ActivityEvent {
  id: string
  event: string
  tool?: string
  file?: string
  path?: string
  action?: string
  success?: boolean
  role?: string
  summary?: string
  duration_ms?: number
  ts: number
}

export type StreamState = 'connecting' | 'connected' | 'ended' | 'error' | 'reconnecting'
```

- [ ] **Step 2: Create API client**

```typescript
// web/src/lib/api.ts
import type { StreamInfo } from './types'

const API_BASE = import.meta.env.VITE_API_URL || ''

export async function fetchStreams(): Promise<{ streams: StreamInfo[] }> {
  const res = await fetch(`${API_BASE}/api/streams`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchStream(id: string): Promise<StreamInfo> {
  const res = await fetch(`${API_BASE}/api/streams/${id}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export function getWsUrl(streamId: string): string {
  if (import.meta.env.VITE_API_URL) {
    const base = import.meta.env.VITE_API_URL
      .replace('https://', 'wss://')
      .replace('http://', 'ws://')
    return `${base}/watch/${streamId}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/watch/${streamId}`
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts
git commit -m "feat: add frontend types and API client"
```

---

### Task 3: useStreams Hook & Browse Page

**Files:**
- Create: `web/src/hooks/use-streams.ts`
- Create: `web/src/components/stream-card.tsx`
- Create: `web/src/pages/browse.tsx`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: Create useStreams hook**

```typescript
// web/src/hooks/use-streams.ts
import { useState, useEffect, useCallback } from 'react'
import { fetchStreams } from '../lib/api'
import type { StreamInfo } from '../lib/types'

const POLL_INTERVAL = 10_000

export function useStreams() {
  const [streams, setStreams] = useState<StreamInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchStreams()
      setStreams(data.streams)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch streams')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [refresh])

  return { streams, loading, error }
}
```

- [ ] **Step 2: Create StreamCard component**

```typescript
// web/src/components/stream-card.tsx
import { Link } from 'react-router-dom'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar'
import { Eye, Clock } from 'lucide-react'
import { formatDuration } from '../lib/utils'
import type { StreamInfo } from '../lib/types'

export function StreamCard({ stream }: { stream: StreamInfo }) {
  return (
    <Link to={`/s/${stream.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <h3 className="font-semibold text-sm truncate">{stream.title || 'Untitled stream'}</h3>
            </div>
            <Badge variant="secondary" className="text-xs shrink-0">{stream.agent}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Avatar className="h-4 w-4">
              <AvatarImage src={stream.user.avatar_url} />
              <AvatarFallback className="text-[8px]">{stream.user.username[0]}</AvatarFallback>
            </Avatar>
            <span>@{stream.user.username}</span>
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{stream.viewer_count}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(stream.started_at)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
```

- [ ] **Step 3: Create Browse page**

```typescript
// web/src/pages/browse.tsx
import { useStreams } from '../hooks/use-streams'
import { StreamCard } from '../components/stream-card'
import { Radio } from 'lucide-react'

export function BrowsePage() {
  const { streams, loading, error } = useStreams()

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Live Streams</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Live Streams</h1>
        <p className="text-destructive">Failed to load streams. Retrying...</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Live Streams</h1>
      {streams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No streams live right now</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            aistreamer lets you watch AI coding agents work in real-time.
            Streams appear here when someone starts broadcasting.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {streams.map((stream) => (
            <StreamCard key={stream.id} stream={stream} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update main.tsx to use BrowsePage**

```typescript
// web/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App'
import { BrowsePage } from './pages/browse'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<BrowsePage />} />
          <Route path="s/:streamId" element={<div>Watch (coming soon)</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 5: Verify browse page renders**

Run: `cd /Users/em/dev/aistreamer/web && npm run dev`
Expected: Browse page shows empty state at localhost:5173

- [ ] **Step 6: Commit**

```bash
git add web/src/hooks/use-streams.ts web/src/components/stream-card.tsx web/src/pages/browse.tsx web/src/main.tsx
git commit -m "feat: add browse page with stream cards and polling"
```

---

### Task 4: useStream Hook (WebSocket + Terminal State)

**Files:**
- Create: `web/src/hooks/use-stream.ts`

- [ ] **Step 1: Create useStream hook**

```typescript
// web/src/hooks/use-stream.ts
import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'
import { getWsUrl } from '../lib/api'
import type { ActivityEvent, StreamState } from '../lib/types'

const MAX_EVENTS = 100
const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000]

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

interface StreamInfo {
  title: string
  agent: string
  cols: number
  rows: number
}

export function useStream(streamId: string) {
  const terminalRef = useRef<Terminal | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const retryCount = useRef(0)
  const stateRef = useRef<StreamState>('connecting')

  const [state, setState] = useState<StreamState>('connecting')
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])

  // Keep ref in sync so WebSocket closures always read current state
  const setStreamState = useCallback((s: StreamState) => {
    stateRef.current = s
    setState(s)
  }, [])

  const addEvent = useCallback((event: ActivityEvent) => {
    setEvents((prev) => {
      const next = [...prev, event]
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
    })
  }, [])

  const connectRef = useRef<() => void>()

  connectRef.current = () => {
    const ws = new WebSocket(getWsUrl(streamId))
    wsRef.current = ws

    ws.onopen = () => {
      retryCount.current = 0
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      const terminal = terminalRef.current
      if (!terminal) return

      if (msg.type === 'snapshot') {
        terminal.resize(msg.cols, msg.rows)
        terminal.write(decodeBase64(msg.data))
        setStreamInfo({ title: msg.title, agent: msg.agent, cols: msg.cols, rows: msg.rows })
        setStreamState('connected')
      } else if (msg.type === 'stream_ended') {
        setStreamState('ended')
      } else if (msg.type === 'error') {
        setStreamState('error')
      }

      if (msg.ch === 'term') {
        if (msg.type === 'resize') {
          terminal.resize(msg.cols, msg.rows)
        } else if (msg.data) {
          terminal.write(decodeBase64(msg.data))
        }
      }

      if (msg.ch === 'meta') {
        addEvent({
          id: crypto.randomUUID(),
          event: msg.event,
          tool: msg.tool,
          file: msg.file,
          path: msg.path,
          action: msg.action,
          success: msg.success,
          role: msg.role,
          summary: msg.summary,
          duration_ms: msg.duration_ms,
          ts: msg.ts,
        })
      }
    }

    ws.onclose = () => {
      // Use ref to avoid stale closure over React state
      if (stateRef.current === 'ended' || stateRef.current === 'error') return
      if (retryCount.current < MAX_RETRIES) {
        setStreamState('reconnecting')
        const delay = RETRY_DELAYS[retryCount.current] || 4000
        retryCount.current++
        setTimeout(() => {
          if (terminalRef.current) {
            terminalRef.current.reset()
          }
          connectRef.current?.()
        }, delay)
      } else {
        setStreamState('error')
      }
    }

    ws.onerror = () => {
      // onclose will fire after this
    }
  }

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (terminalRef.current) return
    containerRef.current = container

    const terminal = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      theme: {
        background: '#0d0d1a',
        foreground: '#e2e8f0',
        cursor: '#e2e8f0',
      },
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 14,
    })

    terminal.open(container)

    try {
      const webglAddon = new WebglAddon()
      terminal.loadAddon(webglAddon)
    } catch {
      // WebGL not available, fall back to canvas renderer
    }

    terminalRef.current = terminal
    connectRef.current?.()
  }, [])

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      terminalRef.current?.dispose()
      terminalRef.current = null
    }
  }, [])

  return { state, streamInfo, events, initTerminal }
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/hooks/use-stream.ts
git commit -m "feat: add useStream hook with WebSocket, xterm.js, and reconnection"
```

---

### Task 5: Terminal View & Activity Feed Components

**Files:**
- Create: `web/src/components/terminal-view.tsx`
- Create: `web/src/components/activity-event.tsx`
- Create: `web/src/components/activity-feed.tsx`
- Create: `web/src/components/stream-header.tsx`
- Create: `web/src/components/stream-ended-overlay.tsx`

- [ ] **Step 1: Create TerminalView component**

```typescript
// web/src/components/terminal-view.tsx
import { useCallback } from 'react'
import '@xterm/xterm/css/xterm.css'

export function TerminalView({ onMount }: { onMount: (el: HTMLDivElement) => void }) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) onMount(el)
  }, [onMount])

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 bg-[#0d0d1a] overflow-auto"
    />
  )
}
```

- [ ] **Step 2: Create ActivityEvent component**

```typescript
// web/src/components/activity-event.tsx
import { Loader2, Check, X, Plus, Pencil, MessageSquare } from 'lucide-react'
import type { ActivityEvent } from '../lib/types'

function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

function getEventDisplay(event: ActivityEvent) {
  switch (event.event) {
    case 'tool_start':
      return {
        icon: <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />,
        text: `${event.tool || 'Unknown'} ${event.file || ''}`.trim(),
      }
    case 'tool_end':
      return event.success !== false
        ? { icon: <Check className="h-3.5 w-3.5 text-green-400" />, text: `${event.tool || 'Unknown'} ${event.file || ''}`.trim() }
        : { icon: <X className="h-3.5 w-3.5 text-red-400" />, text: `${event.tool || 'Unknown'} ${event.file || ''}`.trim() }
    case 'file_change':
      return event.action === 'create'
        ? { icon: <Plus className="h-3.5 w-3.5 text-green-400" />, text: `Created ${event.path || event.file || ''}` }
        : { icon: <Pencil className="h-3.5 w-3.5 text-blue-400" />, text: `Edited ${event.path || event.file || ''}` }
    case 'agent_message':
      return {
        icon: <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />,
        text: event.summary || 'Message',
      }
    default:
      return { icon: null, text: event.event }
  }
}

export function ActivityEventRow({ event }: { event: ActivityEvent }) {
  const { icon, text } = getEventDisplay(event)

  return (
    <div className="flex items-start gap-2 py-1.5 px-3 text-xs border-b border-border/50 last:border-0">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex-1 truncate text-muted-foreground">{text}</span>
      <span className="shrink-0 text-muted-foreground/60">{formatTimeAgo(event.ts)}</span>
    </div>
  )
}
```

- [ ] **Step 3: Create ActivityFeed component**

```typescript
// web/src/components/activity-feed.tsx
import { useEffect, useRef } from 'react'
import { ScrollArea } from './ui/scroll-area'
import { ActivityEventRow } from './activity-event'
import type { ActivityEvent } from '../lib/types'

export function ActivityFeed({ events, agent, startedAt, className }: {
  events: ActivityEvent[]
  agent?: string
  startedAt?: string
  className?: string
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const toolCount = events.filter((e) => e.event === 'tool_start').length

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      <div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground">
        Activity
      </div>
      <ScrollArea className="flex-1">
        {events.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">
            Waiting for agent activity...
          </div>
        ) : (
          <div>
            {events.map((event) => (
              <ActivityEventRow key={event.id} event={event} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>
      <div className="px-3 py-2 border-t text-xs text-muted-foreground space-y-0.5">
        {agent && <div>Agent: {agent}</div>}
        <div>Tools used: {toolCount}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create StreamHeader component**

```typescript
// web/src/components/stream-header.tsx
import { Eye, Clock } from 'lucide-react'
import { Badge } from './ui/badge'
import { formatDuration } from '../lib/utils'

export function StreamHeader({ title, username, agent, viewerCount, startedAt }: {
  title: string
  username?: string
  agent?: string
  viewerCount: number
  startedAt?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-background">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      <h1 className="font-semibold text-sm truncate">{title || 'Untitled stream'}</h1>
      {username && <span className="text-xs text-muted-foreground">@{username}</span>}
      {agent && <Badge variant="secondary" className="text-xs">{agent}</Badge>}
      <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{viewerCount}</span>
        {startedAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(startedAt)}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create StreamEndedOverlay component**

```typescript
// web/src/components/stream-ended-overlay.tsx
import { Link } from 'react-router-dom'
import { Button } from './ui/button'

export function StreamEndedOverlay({ type }: { type: 'ended' | 'error' }) {
  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-2">
          {type === 'ended' ? 'This stream has ended' : 'Stream not found'}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {type === 'ended'
            ? 'The broadcaster has ended their session.'
            : 'This stream doesn\'t exist or has already ended.'}
        </p>
        <Button asChild>
          <Link to="/">Browse streams</Link>
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add web/src/components/terminal-view.tsx web/src/components/activity-event.tsx web/src/components/activity-feed.tsx web/src/components/stream-header.tsx web/src/components/stream-ended-overlay.tsx
git commit -m "feat: add terminal view, activity feed, and stream UI components"
```

---

### Task 6: Watch Page

**Files:**
- Create: `web/src/pages/watch.tsx`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: Create Watch page**

```typescript
// web/src/pages/watch.tsx
import { useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useStream } from '../hooks/use-stream'
import { fetchStream } from '../lib/api'
import { TerminalView } from '../components/terminal-view'
import { ActivityFeed } from '../components/activity-feed'
import { StreamHeader } from '../components/stream-header'
import { StreamEndedOverlay } from '../components/stream-ended-overlay'
import { Sheet, SheetContent, SheetTrigger } from '../components/ui/sheet'
import { Button } from '../components/ui/button'
import { Loader2, Activity } from 'lucide-react'
import type { StreamInfo } from '../lib/types'

const POLL_INTERVAL = 10_000

export function WatchPage() {
  const { streamId } = useParams<{ streamId: string }>()
  const { state, streamInfo, events, initTerminal } = useStream(streamId!)
  const [apiInfo, setApiInfo] = useState<StreamInfo | null>(null)

  // Poll for viewer count
  useEffect(() => {
    if (!streamId) return
    const poll = async () => {
      try {
        const info = await fetchStream(streamId)
        setApiInfo(info)
      } catch {}
    }
    poll()
    const interval = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [streamId])

  if (state === 'connecting') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      {/* Terminal + header */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <StreamHeader
          title={streamInfo?.title || apiInfo?.title || 'Stream'}
          username={apiInfo?.user?.username}
          agent={streamInfo?.agent || apiInfo?.agent}
          viewerCount={apiInfo?.viewer_count ?? 0}
          startedAt={apiInfo?.started_at}
        />
        <TerminalView onMount={initTerminal} />
        {state === 'reconnecting' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-yellow-950 text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reconnecting...
          </div>
        )}
        {(state === 'ended' || state === 'error') && (
          <StreamEndedOverlay type={state} />
        )}
      </div>

      {/* Activity feed - desktop: sidebar, mobile: bottom sheet */}
      <ActivityFeed
        events={events}
        agent={streamInfo?.agent}
        startedAt={apiInfo?.started_at}
        className="w-64 border-l hidden lg:flex"
      />

      {/* Mobile: floating button + bottom sheet for activity feed */}
      <div className="lg:hidden fixed bottom-4 right-4 z-20">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="secondary" className="rounded-full shadow-lg h-12 w-12">
              <Activity className="h-5 w-5" />
              {events.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full h-5 w-5 flex items-center justify-center">
                  {events.length}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[60vh] p-0">
            <ActivityFeed
              events={events}
              agent={streamInfo?.agent}
              startedAt={apiInfo?.started_at}
              className="h-full"
            />
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update main.tsx with WatchPage**

```typescript
// web/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App'
import { BrowsePage } from './pages/browse'
import { WatchPage } from './pages/watch'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<BrowsePage />} />
          <Route path="s/:streamId" element={<WatchPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 3: Verify watch page renders (with no backend, should show loading then error)**

Run: `cd /Users/em/dev/aistreamer/web && npm run dev`
Navigate to `http://localhost:5173/s/test123`
Expected: Shows loading spinner, then error state (no backend running)

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/watch.tsx web/src/main.tsx
git commit -m "feat: add watch page with terminal, activity feed, and stream header"
```

---

### Task 7: Collapsible Sidebar & App Layout

**Files:**
- Create: `web/src/components/app-sidebar.tsx`
- Create: `web/src/components/theme-toggle.tsx`
- Create: `web/src/hooks/use-theme.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/pages/browse.tsx`
- Modify: `web/src/pages/watch.tsx`

- [ ] **Step 1: Create useTheme hook**

```typescript
// web/src/hooks/use-theme.ts
import { useState, useEffect } from 'react'

type Theme = 'dark' | 'light'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme
    return stored || 'dark'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggleTheme }
}
```

- [ ] **Step 2: Create ThemeToggle component**

```typescript
// web/src/components/theme-toggle.tsx
import { Moon, Sun } from 'lucide-react'
import { Button } from './ui/button'
import { useTheme } from '../hooks/use-theme'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme}>
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
```

- [ ] **Step 3: Create AppSidebar component**

```typescript
// web/src/components/app-sidebar.tsx
import { Radio, MonitorPlay } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from './ui/sidebar'
import { ThemeToggle } from './theme-toggle'
import { useStreams } from '../hooks/use-streams'

export function AppSidebar() {
  const location = useLocation()
  const { streams } = useStreams()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <MonitorPlay className="h-5 w-5" />
                <span className="font-bold">aistreamer</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.pathname === '/'}>
                  <Link to="/">
                    <Radio className="h-4 w-4" />
                    <span>Browse</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {streams.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Live Now</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {streams.slice(0, 5).map((s) => (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton asChild isActive={location.pathname === `/s/${s.id}`}>
                      <Link to={`/s/${s.id}`}>
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                        <span className="truncate text-xs">@{s.user.username} · {s.title || 'Untitled'}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}
```

- [ ] **Step 4: Update App.tsx with sidebar layout**

```typescript
// web/src/App.tsx
import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from './components/ui/sidebar'
import { AppSidebar } from './components/app-sidebar'

export default function App() {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

- [ ] **Step 5: Verify sidebar works**

Run: `cd /Users/em/dev/aistreamer/web && npm run dev`
Expected: Sidebar renders collapsed, expands on toggle, browse/watch pages work within layout

- [ ] **Step 6: Commit**

```bash
git add web/src/hooks/use-theme.ts web/src/components/theme-toggle.tsx web/src/components/app-sidebar.tsx web/src/App.tsx
git commit -m "feat: add collapsible sidebar, theme toggle, and app layout"
```

---

### Task 8: TypeScript Check & Build Verification

**Files:**
- Possibly modify: any files with type errors

- [ ] **Step 1: Run TypeScript check**

Run: `cd /Users/em/dev/aistreamer/web && npx tsc --noEmit`
Expected: No errors. If errors, fix them.

- [ ] **Step 2: Run Vite build**

Run: `cd /Users/em/dev/aistreamer/web && npm run build`
Expected: Builds successfully to `dist/`

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix type errors and verify production build"
```

(Only if there are changes)

---

### Task 9: Manual Smoke Test

- [ ] **Step 1: Start backend server (if Postgres is available)**

```bash
cd /Users/em/dev/aistreamer/server && npx tsx src/index.ts
```

If no Postgres, skip this step — test viewer in isolation.

- [ ] **Step 2: Start viewer dev server**

```bash
cd /Users/em/dev/aistreamer/web && npm run dev
```

- [ ] **Step 3: Test browse page**

Visit `http://localhost:5173`
Expected: Empty state with "No streams live right now"

- [ ] **Step 4: Test watch page with fake stream ID**

Visit `http://localhost:5173/s/test123`
Expected: Loading spinner → error state (no backend / stream not found)

- [ ] **Step 5: Test sidebar collapse/expand**

Click sidebar toggle
Expected: Sidebar toggles between icon-only and expanded

- [ ] **Step 6: Test theme toggle**

Click theme toggle
Expected: Switches between dark and light mode

- [ ] **Step 7: Commit any final fixes**

```bash
git add -A
git commit -m "chore: polish viewer web app for smoke testing"
```
