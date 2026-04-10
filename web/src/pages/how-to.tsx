import { Terminal, Radio, StopCircle, Play } from 'lucide-react'

export function HowToPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-6 pt-4 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">How to Use ClawCast</h1>
          <p className="text-muted-foreground">
            Stream your AI agent's terminal output in real-time and let others watch your coding assistant work.
          </p>
        </div>

        <div className="space-y-8">
          {/* Installation */}
          <section className="bg-card border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                1
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-3">Install ClawCast</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Install the CLI with one command. Requires Node.js 18+.
                </p>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
curl -fsSL https://clawcast.tv/install.sh | bash
                </pre>
              </div>
            </div>
          </section>

          {/* Start Streaming */}
          <section className="bg-card border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                2
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Start a stream
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Just run ClawCast — it launches your default shell and starts streaming:
                </p>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto mb-3">
clawcast
                </pre>
                <p className="text-xs text-muted-foreground mb-3">
                  You can also customize what to run:
                </p>
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto mb-3">
clawcast --title "My AI Agent" -- claude
                </pre>
                <p className="text-xs text-muted-foreground">
                  This will output a unique stream URL that you can share with viewers.
                </p>
              </div>
            </div>
          </section>

          {/* Run Your Agent */}
          <section className="bg-card border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                3
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Run your AI agent
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Execute your AI coding agent as you normally would. All terminal output will be automatically
                  captured and streamed to your viewers in real-time.
                </p>
                <div className="bg-muted/50 border-l-4 border-primary p-4 rounded">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Tip:</strong> Your stream will show exactly what appears in your terminal,
                    including colors, formatting, and real-time updates as your AI agent works.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Stop Streaming */}
          <section className="bg-card border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                4
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <StopCircle className="h-5 w-5" />
                  Stop streaming
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  When you're done, simply exit the command you're running (Ctrl+C or let it finish normally). The stream will end automatically.
                </p>
              </div>
            </div>
          </section>

          {/* Additional Tips */}
          <section className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Tips & Best Practices</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <Radio className="h-4 w-4" />
                  Restarting a stream
                </h3>
                <p className="text-sm text-muted-foreground">
                  To restart a stream from the beginning, exit your current command (Ctrl+C) and run a new ClawCast session. Viewers joining mid-stream only see output from when they connect.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-1">Download logs</h3>
                <p className="text-sm text-muted-foreground">
                  Viewers can download clean text logs of your terminal output using the download button in the stream viewer.
                  This captures the final rendered state without ANSI escape codes.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-1">Privacy</h3>
                <p className="text-sm text-muted-foreground">
                  Be mindful of what's visible in your terminal. Avoid displaying sensitive information like API keys,
                  passwords, or private file paths while streaming.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
