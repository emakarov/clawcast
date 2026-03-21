import { Loader2, Check, X, Plus, Pencil, MessageSquare } from 'lucide-react'
import type { ActivityEvent } from '@/lib/types'

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
