import { useStreams } from '@/hooks/use-streams'
import { StreamCard } from '@/components/stream-card'
import { Radio } from 'lucide-react'

export function BrowsePage() {
  const { streams, loading, error } = useStreams()

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Live Streams</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Live Streams</h1>
        <p className="text-destructive">Failed to load streams. Retrying...</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Live Streams</h1>
      {streams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No streams live right now</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            aistreamer lets you watch AI coding agents work in real-time.
            Streams appear here when someone starts broadcasting.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {streams.map((stream) => (
            <StreamCard key={stream.id} stream={stream} />
          ))}
        </div>
      )}
    </div>
  )
}
