import { useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useStream } from '@/hooks/use-stream'
import { fetchStream } from '@/lib/api'
import { TerminalView } from '@/components/terminal-view'
import { ActivityFeed } from '@/components/activity-feed'
import { StreamHeader } from '@/components/stream-header'
import { StreamEndedOverlay } from '@/components/stream-ended-overlay'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Loader2, Activity } from 'lucide-react'
import type { StreamInfo } from '@/lib/types'

const POLL_INTERVAL = 10_000

export function WatchPage() {
  const { streamId } = useParams<{ streamId: string }>()
  const { state, streamInfo, events, initTerminal } = useStream(streamId!)
  const [apiInfo, setApiInfo] = useState<StreamInfo | null>(null)

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

      {/* Desktop: activity feed sidebar */}
      <ActivityFeed
        events={events}
        agent={streamInfo?.agent}
        startedAt={apiInfo?.started_at}
        className="w-64 border-l hidden lg:flex"
      />

      {/* Mobile: floating button + bottom sheet */}
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
