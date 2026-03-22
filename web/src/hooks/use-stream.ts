import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'
import { getWsUrl } from '@/lib/api'
import type { ActivityEvent, StreamState } from '@/lib/types'

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

  const connectRef = useRef<(() => void) | undefined>(undefined)

  connectRef.current = () => {
    const ws = new WebSocket(getWsUrl(streamId))
    wsRef.current = ws

    ws.onopen = () => { retryCount.current = 0 }

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
      if (stateRef.current === 'ended' || stateRef.current === 'error') return
      if (retryCount.current < MAX_RETRIES) {
        setStreamState('reconnecting')
        const delay = RETRY_DELAYS[retryCount.current] || 4000
        retryCount.current++
        setTimeout(() => {
          if (terminalRef.current) terminalRef.current.reset()
          connectRef.current?.()
        }, delay)
      } else {
        setStreamState('error')
      }
    }

    ws.onerror = () => {}
  }

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (terminalRef.current) return
    containerRef.current = container

    const terminal = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      theme: { background: '#0d0d1a', foreground: '#e2e8f0', cursor: '#e2e8f0' },
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 14,
    })

    terminal.open(container)

    try {
      const webglAddon = new WebglAddon()
      terminal.loadAddon(webglAddon)
    } catch {
      // WebGL not available, fall back to canvas
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
