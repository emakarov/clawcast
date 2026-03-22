import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ActivityEventRow } from '@/components/activity-event'
import type { ActivityEvent } from '@/lib/types'

export function ActivityFeed({ events, agent, startedAt: _startedAt, className }: {
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
      <div className="px-3 py-2 border-b text-xs font-semibold text-muted-foreground">Activity</div>
      <ScrollArea className="flex-1">
        {events.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Waiting for agent activity...</div>
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
