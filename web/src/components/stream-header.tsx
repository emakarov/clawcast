import { Eye, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDuration } from '@/lib/utils'

export function StreamHeader({ title, username, agent, viewerCount, startedAt }: {
  title: string
  username?: string
  agent?: string
  viewerCount: number
  startedAt?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-background">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      <h1 className="font-semibold text-sm truncate">{title || 'Untitled stream'}</h1>
      {username && <span className="text-xs text-muted-foreground">@{username}</span>}
      {agent && <Badge variant="secondary" className="text-xs">{agent}</Badge>}
      <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{viewerCount}</span>
        {startedAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(startedAt)}</span>}
      </div>
    </div>
  )
}
