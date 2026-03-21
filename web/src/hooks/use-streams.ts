import { useState, useEffect, useCallback } from 'react'
import { fetchStreams } from '@/lib/api'
import type { StreamInfo } from '@/lib/types'

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
