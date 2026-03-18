# aistreamer CLI — Broadcaster Design Spec

**Sub-system:** 1 of 3 (CLI Broadcaster)
**Date:** 2026-03-18
**Status:** Draft

## Overview

aistreamer is "Twitch for AI agents" — a platform where people stream their Claude Code and other agentic coding sessions in real-time for others to watch and comment on. This spec covers sub-system 1: the CLI broadcaster that captures and streams terminal sessions.

The CLI is a thin PTY proxy. It wraps any command, captures raw terminal bytes plus optional structured metadata, and sends both over WebSocket to the aistreamer backend.

## Architecture

```
User runs:                   PTY Proxy                    Backend
$ aistreamer claude    →    [node-pty]     →    [WebSocket]    →    [Server]
                            captures raw         two channels        (sub-system 2)
                            bytes + hooks        term + meta
```

### Two-Channel WebSocket Protocol

All data flows over a single WebSocket connection using two logical channels:

**Channel: `term`** — Raw PTY output
```json
{"ch": "term", "data": "<base64-encoded bytes>", "ts": 1710720000}
```
- Every byte from the PTY output (escape sequences, colors, cursor movement)
- Base64 encoded to safely transport binary data
- What the user actually sees in their terminal

**Channel: `meta`** — Structured events (optional)
```json
{"ch": "meta", "event": "tool_start", "tool": "Edit", "file": "src/app.ts", "ts": 1710720000}
{"ch": "meta", "event": "tool_end", "tool": "Edit", "success": true, "duration_ms": 1200, "ts": 1710720001}
{"ch": "meta", "event": "file_change", "path": "src/app.ts", "action": "edit", "lines_changed": 12, "ts": 1710720001}
```
- Agent-specific structured data
- Only available when an adapter exists for the detected agent
- Falls back gracefully — raw-only streams work fine without metadata

### Connection Lifecycle

1. CLI authenticates WebSocket with JWT token in query param
2. Sends `stream_start` message with metadata (title, agent type, terminal dimensions)
3. Streams `term` and `meta` messages for the duration of the session
4. Sends `stream_end` on exit
5. Server can send messages back (future: viewer chat, commands)

```json
// stream_start
{"type": "stream_start", "title": "Building auth", "agent": "claude-code", "cols": 120, "rows": 40}

// stream_end
{"type": "stream_end", "reason": "exit", "exit_code": 0, "duration_s": 3600}
```

## CLI Interface

### Commands

```bash
# Authenticate via GitHub OAuth (one-time)
aistreamer login

# Stream a Claude Code session
aistreamer claude

# Stream any command
aistreamer -- aider --model sonnet
aistreamer -- python train.py
aistreamer -- cargo build

# Stream with a title
aistreamer --title "Building aistreamer" claude

# Check identity
aistreamer whoami

# Logout
aistreamer logout
```

### How `aistreamer <command>` Works

1. Reads auth token from `~/.aistreamer/config.json`
2. Opens WebSocket to backend with JWT
3. Detects agent type from command name
4. If adapter exists (e.g., Claude Code), installs hooks
5. Spawns command inside a PTY via `node-pty`
6. Prints stream URL to stderr (doesn't interfere with PTY output)
7. Forwards PTY output to terminal AND to WebSocket (`term` channel)
8. Receives hook events via IPC, forwards to WebSocket (`meta` channel)
9. On command exit: cleans up hooks, closes WebSocket, exits with same code

## Authentication

### GitHub OAuth Flow

1. `aistreamer login` starts a temporary HTTP server on `localhost:9876`
2. Opens browser to `https://aistreamer.dev/auth/github` (backend handles OAuth)
3. GitHub redirects back to backend with auth code
4. Backend exchanges code for GitHub user info, creates/finds user, issues JWT
5. Backend redirects to `http://localhost:9876/callback?token=<jwt>`
6. CLI saves token and profile to `~/.aistreamer/config.json`
7. Temporary HTTP server shuts down

### Token Storage

```json
// ~/.aistreamer/config.json
{
  "token": "eyJhbG...",
  "user": {
    "id": "abc123",
    "github_username": "em",
    "avatar_url": "https://avatars.githubusercontent.com/..."
  },
  "server": "wss://aistreamer.dev"
}
```

## Claude Code Adapter

### Agent Detection

The CLI detects the agent from the command name:
- `claude` → ClaudeCodeAdapter
- Anything else → no adapter (raw-only stream)

Future adapters can be added for other agents.

### Hook Installation

When Claude Code is detected, the adapter:

1. Reads existing `.claude/settings.local.json` (or creates it)
2. Adds aistreamer hooks for `PreToolUse`, `PostToolUse`, and `Notification` events
3. Each hook runs a small script that sends the event to the CLI via Unix socket

### Hook → CLI Communication (IPC)

```
Claude Code triggers hook
    → Hook script (hooks/claude-hook.js)
        → Connects to Unix socket at /tmp/aistreamer-{pid}.sock
            → Sends JSON event
                → CLI process receives, forwards to WebSocket meta channel
```

The Unix socket approach is chosen because:
- No port conflicts (file-based)
- Fast local communication
- Automatically cleaned up on process exit
- Hook scripts are short-lived — connect, send, disconnect

### Structured Events

| Event | Source Hook | Fields |
|-------|-----------|--------|
| `tool_start` | PreToolUse | tool, file (if applicable) |
| `tool_end` | PostToolUse | tool, success, duration_ms |
| `file_change` | PostToolUse (Edit/Write) | path, action, lines_changed |
| `agent_message` | Notification | role, summary |

### Cleanup

On exit (normal or Ctrl+C):
1. Remove all aistreamer hooks from `.claude/settings.local.json`
2. If the file was created by aistreamer and is now empty, delete it
3. Remove Unix socket file
4. Close WebSocket connection

## Project Structure

```
aistreamer/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts              — entry point, arg parsing (commander)
│   ├── pty.ts              — PTY spawn + capture (node-pty)
│   ├── stream.ts           — WebSocket client, two-channel protocol
│   ├── auth.ts             — GitHub OAuth flow, token storage
│   ├── ipc.ts              — Unix socket server for hook events
│   ├── adapters/
│   │   ├── base.ts         — adapter interface
│   │   └── claude-code.ts  — hook install/cleanup, event parsing
│   └── hooks/
│       └── claude-hook.js  — script installed as Claude Code hook
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `node-pty` | PTY spawning and raw byte capture |
| `ws` | WebSocket client |
| `commander` | CLI argument parsing |
| `open` | Open browser for OAuth flow |
| `tsx` | TypeScript execution (dev) |

## MVP Scope

### In Scope
- CLI wrapper with PTY capture via node-pty
- WebSocket streaming with two-channel protocol (term + meta)
- GitHub OAuth login flow
- Claude Code adapter with hook-based structured events
- IPC via Unix socket for hook communication
- Stream title flag (`--title`)
- Clean hook cleanup on exit (normal and Ctrl+C)
- Graceful signal handling

### Out of Scope (Future)
- Ghostty SDK integration for terminal state snapshots
- Attach to existing terminal session
- Background daemon mode
- Additional agent adapters (Aider, Cursor, Codex)
- Stream recording and replay
- Viewer chat relayed back to streamer
- Stream privacy/visibility settings
- npm publish / global install
- Windows support (Unix socket dependency)

## Error Handling

- **Backend unreachable:** Print error, offer to run command without streaming
- **WebSocket disconnects mid-stream:** Attempt reconnect with exponential backoff (3 attempts), then warn user and continue running command without streaming
- **Hook installation fails:** Warn user, fall back to raw-only streaming
- **PTY spawn fails:** Print error with the failed command, exit with code 1
- **Auth token expired:** Prompt user to run `aistreamer login` again

## Security Considerations

- JWT tokens stored with `0600` file permissions
- Hooks are installed in `.claude/settings.local.json` (project-local, not global)
- Unix socket created with `0600` permissions
- No sensitive data (API keys, env vars) is captured — only PTY output that the user sees
- Stream URL uses a random ID, not predictable
