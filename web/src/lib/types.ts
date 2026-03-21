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
