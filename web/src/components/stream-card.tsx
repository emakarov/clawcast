import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Eye, Clock } from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import { StreamPreview } from '@/components/stream-preview'
import type { StreamInfo } from '@/lib/types'

export function StreamCard({ stream }: { stream: StreamInfo }) {
  return (
    <Link to={`/watch/${stream.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer overflow-hidden">
        <StreamPreview streamId={stream.id} />
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <h3 className="font-semibold text-sm truncate">{stream.title || 'Untitled stream'}</h3>
            </div>
            <Badge variant="secondary" className="text-xs shrink-0">{stream.agent}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Avatar className="h-4 w-4">
              <AvatarImage src={stream.user.avatar_url} />
              <AvatarFallback className="text-[8px]">{stream.user.username[0]}</AvatarFallback>
            </Avatar>
            <span>@{stream.user.username}</span>
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{stream.viewer_count}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(stream.started_at)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
