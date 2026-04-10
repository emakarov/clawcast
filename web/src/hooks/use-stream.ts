import { useEffect, useRef, useCallback, useState } from 'react'
import { getWsUrl } from '@/lib/api'
import { TerminalBuffer } from '@/lib/terminal-buffer'
import type { ActivityEvent, StreamState } from '@/lib/types'

const MAX_EVENTS = 100
const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000]

function decodeBase64(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

// Strip ANSI codes for plain text export
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][0-9;]*\x07/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
}

interface StreamInfo {
  title: string
  agent: string
  cols: number
  rows: number
}

export function useStream(streamId: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const retryCount = useRef(0)
  const stateRef = useRef<StreamState>('connecting')
  const terminalBufferRef = useRef<TerminalBuffer | null>(null)
  const updateTimerRef = useRef<number | null>(null)
  const pendingUpdateRef = useRef(false)

  const [state, setState] = useState<StreamState>('connecting')
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [htmlContent, setHtmlContent] = useState<string>('')

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

  // Throttle display updates to reduce flickering
  const scheduleUpdate = useCallback(() => {
    pendingUpdateRef.current = true

    if (updateTimerRef.current === null) {
      updateTimerRef.current = window.setTimeout(() => {
        if (pendingUpdateRef.current && terminalBufferRef.current) {
          setHtmlContent(terminalBufferRef.current.toHTML())
          pendingUpdateRef.current = false
        }
        updateTimerRef.current = null
      }, 50) // Update every 50ms max (20 FPS)
    }
  }, [])

  const connectRef = useRef<((scheduleUpdateFn: () => void) => void) | undefined>(undefined)

  connectRef.current = (scheduleUpdateFn: () => void) => {
    const ws = new WebSocket(getWsUrl(streamId))
    wsRef.current = ws

    ws.onopen = () => { retryCount.current = 0 }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      const buffer = terminalBufferRef.current

      if (msg.type === 'snapshot') {
        console.log('[aistreamer] Received snapshot')
        const data = decodeBase64(msg.data)

        if (buffer) {
          // Match broadcaster's terminal size for correct cursor positioning
          if (msg.cols && msg.rows) {
            buffer.resize(msg.cols, msg.rows)
          }
          buffer.reset()
          buffer.write(data)
          scheduleUpdateFn()
        }

        setStreamInfo({ title: msg.title, agent: msg.agent, cols: msg.cols, rows: msg.rows })
        setStreamState('connected')
      } else if (msg.type === 'stream_ended') {
        setStreamState('ended')
      } else if (msg.type === 'error') {
        setStreamState('error')
      }

      if (msg.ch === 'term') {
        if (msg.type === 'resize' && buffer && msg.cols && msg.rows) {
          buffer.resize(msg.cols, msg.rows)
          scheduleUpdateFn()
        } else if (msg.data) {
          const data = decodeBase64(msg.data)
          if (buffer) {
            buffer.write(data)
            scheduleUpdateFn()
          }
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
          connectRef.current?.(scheduleUpdate)
        }, delay)
      } else {
        setStreamState('error')
      }
    }

    ws.onerror = () => {}
  }

  const initTerminal = useCallback(() => {
    if (terminalBufferRef.current) {
      console.log('[aistreamer] Terminal buffer already initialized, skipping')
      return
    }

    console.log('[aistreamer] Initializing terminal buffer')
    terminalBufferRef.current = new TerminalBuffer()

    connectRef.current?.(scheduleUpdate)
  }, [scheduleUpdate])

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      if (updateTimerRef.current !== null) {
        clearTimeout(updateTimerRef.current)
      }
    }
  }, [])

  const downloadLog = useCallback(() => {
    const buffer = terminalBufferRef.current
    if (!buffer) return

    // Get the final rendered state (what you see on screen), then strip ANSI codes
    const content = stripAnsi(buffer.toPlainText())
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stream-${streamId}-${new Date().toISOString()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [streamId])

  return { state, streamInfo, events, htmlContent, initTerminal, downloadLog }
}
