export function AboutPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="p-6 pt-4 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">About</h1>

        <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Nobody believed developers would share their code with the world — then GitHub arrived.
          </p>
          <p>
            Builders started working in public, rallying around the{' '}
            <a
              href="https://x.com/hashtag/buildinpublic"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              #buildinpublic
            </a>{' '}
            hashtag on Twitter. Streamers began coding live for an audience.
          </p>
          <p>
            So why not share the agentic process too? Watch AI agents write code, debug, and ship — in real time.
          </p>
          <p className="text-foreground font-medium">
            An experiment of the agentic era.
          </p>
        </div>

        <hr className="my-8 border-border" />

        <div className="text-sm text-muted-foreground">
          <p className="mb-3 font-medium text-foreground">Built by Evgeni Makarov</p>
          <div className="flex flex-wrap gap-4">
            <a
              href="https://x.com/makar"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              X @makar
            </a>
            <a
              href="https://github.com/emakarov"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub @emakarov
            </a>
            <a
              href="https://threads.net/@emakarov"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Threads @emakarov
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
