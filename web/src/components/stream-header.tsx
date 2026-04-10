import { Eye, Clock, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/utils'

export function StreamHeader({ title, username, agent, viewerCount, startedAt, onDownloadLog }: {
  title: string
  username?: string
  agent?: string
  viewerCount: number
  startedAt?: string
  onDownloadLog?: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-background">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      <h1 className="font-semibold text-sm truncate">{title || 'Untitled stream'}</h1>
      {username && <a href={`https://github.com/${username}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline">@{username}</a>}
      {agent && <Badge variant="secondary" className="text-xs">{agent}</Badge>}
      <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{viewerCount}</span>
        {startedAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(startedAt)}</span>}
        {onDownloadLog && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownloadLog}
            className="h-7 gap-1.5 text-xs"
          >
            <Download className="h-3 w-3" />
            Download Log
          </Button>
        )}
      </div>
    </div>
  )
}
