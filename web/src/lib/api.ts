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
  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl) {
    const base = apiUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://')
    return `${base}/ws/${streamId}`
  }
  // Production: use current host. Development: use localhost.
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws/${streamId}`
  }
  return `ws://localhost:3456/watch/${streamId}`
}
