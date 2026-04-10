import { useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useStream } from '@/hooks/use-stream'
import { fetchStream } from '@/lib/api'
import { TerminalView } from '@/components/terminal-view'
import { StreamHeader } from '@/components/stream-header'
import { StreamEndedOverlay } from '@/components/stream-ended-overlay'
import { Loader2 } from 'lucide-react'
import type { StreamInfo } from '@/lib/types'

const POLL_INTERVAL = 10_000

export function WatchPage() {
  const { streamId } = useParams<{ streamId: string }>()
  const { state, streamInfo, htmlContent, initTerminal, downloadLog } = useStream(streamId!)
  const [apiInfo, setApiInfo] = useState<StreamInfo | null>(null)

  useEffect(() => {
    if (!streamId) return
    // Initialize ANSI converter and connect to stream
    initTerminal()

    const poll = async () => {
      try {
        const info = await fetchStream(streamId)
        setApiInfo(info)
      } catch {}
    }
    poll()
    const interval = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [streamId, initTerminal])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <StreamHeader
        title={streamInfo?.title || apiInfo?.title || 'Stream'}
        username={apiInfo?.user?.username}
        agent={streamInfo?.agent || apiInfo?.agent}
        viewerCount={apiInfo?.viewer_count ?? 0}
        startedAt={apiInfo?.started_at}
        onDownloadLog={downloadLog}
      />
      <div className="flex-1 relative p-4 min-h-0">
        <div className="h-full rounded-lg border bg-card overflow-hidden shadow-sm">
          <TerminalView htmlContent={htmlContent} />
          {state === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
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
      </div>
    </div>
  )
}
