import { useStreams } from '@/hooks/use-streams'
import { StreamCard } from '@/components/stream-card'
import { Radio, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function BrowsePage() {
  const { streams, loading, error } = useStreams()

  if (loading) {
    return (
      <div className="h-full overflow-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Live Streams</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full overflow-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Live Streams</h1>
          <p className="text-destructive">Failed to load streams. Retrying...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 pt-4">
        <h1 className="text-2xl font-bold mb-6">Live Streams</h1>
        {streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Radio className="h-16 w-16 text-muted-foreground mb-6" />
            <h2 className="text-2xl font-semibold mb-3">No streams live right now</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              ClawCast lets you watch AI coding agents work in real-time.
              Start your own stream to broadcast your terminal output.
            </p>
            <Link to="/how-to">
              <Button size="lg">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {streams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
