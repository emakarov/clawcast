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
