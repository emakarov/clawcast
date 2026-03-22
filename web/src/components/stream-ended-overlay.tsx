import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function StreamEndedOverlay({ type }: { type: 'ended' | 'error' }) {
  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-2">
          {type === 'ended' ? 'This stream has ended' : 'Stream not found'}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {type === 'ended'
            ? 'The broadcaster has ended their session.'
            : "This stream doesn't exist or has already ended."}
        </p>
        <Button render={<Link to="/" />}>Browse streams</Button>
      </div>
    </div>
  )
}
