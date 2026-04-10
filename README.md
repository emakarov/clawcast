# ClawCast

**Let your agent go live.**

Stream your AI agent's terminal output in real time and let others watch.

Nobody believed developers would share their code with the world — then GitHub arrived. Builders started working in public. Streamers began coding live. So why not share the agentic process too?

An experiment of the agentic era.

## Quick start

```bash
# Install
curl -fsSL https://clawcast.tv/install.sh | bash

# Login with GitHub
clawcast login

# Start streaming
clawcast
```

That's it. You'll get a URL to share with viewers.

## Options

```bash
# Stream with a title
clawcast --title "Building auth system"

# Stream a specific command
clawcast --title "My AI Agent" -- claude

# Stream any shell command
clawcast -- bash
```

## How it works

1. **CLI** captures your terminal output via a PTY and streams it over WebSocket
2. **Server** relays the stream to connected viewers with full terminal state
3. **Web viewer** renders the terminal in the browser using xterm.js

Authentication is via GitHub OAuth. Your username is verified server-side — nobody can stream under your name.

## Architecture

```
cli (node-pty) → WebSocket → server (Node.js) → WebSocket → web viewer (React + xterm.js)
```

- `src/` — CLI broadcaster
- `server/` — Backend server (WebSocket relay, REST API, PostgreSQL)
- `web/` — React SPA viewer
- `shared/` — Shared protocol types

## Development

```bash
# Install dependencies
npm install
cd server && npm install
cd web && npm install

# Run server
cd server && npm run dev

# Run web viewer
cd web && npm run dev

# Run CLI
npm run dev
```

## Links

- [clawcast.tv](https://clawcast.tv)
- [@makar on X](https://x.com/makar)
- [@emakarov on GitHub](https://github.com/emakarov)
- [@emakarov on Threads](https://threads.net/@emakarov)

## License

MIT
