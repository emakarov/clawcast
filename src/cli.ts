import process from 'node:process';
import type { StreamClient } from './stream.js';

const SUBCOMMANDS = ['login', 'logout', 'whoami'] as const;
type Subcommand = typeof SUBCOMMANDS[number];

export interface ParsedArgs {
  subcommand?: Subcommand;
  command?: string;
  args: string[];
  title?: string;
  server?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { args: [] };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--title' && i + 1 < argv.length) {
      result.title = argv[++i];
    } else if (arg === '--server' && i + 1 < argv.length) {
      result.server = argv[++i];
    } else if (arg === '--') {
      // Everything after -- is the command + args
      result.command = argv[i + 1];
      result.args = argv.slice(i + 2);
      break;
    } else if (SUBCOMMANDS.includes(arg as Subcommand)) {
      result.subcommand = arg as Subcommand;
    } else if (!arg.startsWith('-') && !result.command) {
      result.command = arg;
      result.args = argv.slice(i + 1);
      break;
    }
    i++;
  }

  return result;
}

function detectAgent(command: string): string | null {
  const basename = command.split('/').pop() ?? command;
  if (basename === 'claude') return 'claude-code';
  return null;
}

async function runStream(parsed: ParsedArgs): Promise<void> {
  const { readConfig } = await import('./auth.js');
  const { PtyProcess } = await import('./pty.js');
  const { StreamClient } = await import('./stream.js');
  const { IpcServer } = await import('./ipc.js');

  const config = readConfig();
  if (!config) {
    console.error('\x1b[33m[aistreamer]\x1b[0m Not logged in. Run: aistreamer login to enable streaming.');
  }

  if (!parsed.command) {
    console.error('\x1b[31m[aistreamer]\x1b[0m No command specified. Usage: aistreamer <command>');
    process.exit(1);
  }

  const agentType = detectAgent(parsed.command);
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  // Start IPC server for hook events
  const ipc = new IpcServer(process.pid);
  let adapterCleanup: (() => Promise<void>) | null = null;

  // Clean up stale sockets and hooks from previous crashes
  IpcServer.cleanupStale();
  const { ClaudeCodeAdapter } = await import('./adapters/claude-code.js');
  ClaudeCodeAdapter.cleanupStaleHooks();

  // Connect to backend — stream_start is sent inside connect() on open
  // Use a no-op stub when not logged in so the command still runs
  let stream: StreamClient | null = null;
  let streamUrl: string | null = null;
  if (config) {
    const wsUrl = `${config.server}/stream`;
    stream = new StreamClient(wsUrl, config.token);
    try {
      streamUrl = await stream.connect({
        title: parsed.title,
        agent: agentType ?? undefined,
        cols,
        rows,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        console.error('\x1b[31m[aistreamer]\x1b[0m Auth token expired. Run: aistreamer login');
        process.exit(1);
      }
      console.error(`\x1b[33m[aistreamer]\x1b[0m Could not connect to server. Running without streaming.`);
    }
  }

  // Install adapter hooks if applicable
  if (agentType === 'claude-code') {
    try {
      await ipc.start();
      const adapter = new ClaudeCodeAdapter();
      adapterCleanup = await adapter.install(ipc.socketPath);

      // Track tool_start timestamps for duration_ms computation
      const toolStartTimes = new Map<string, number>();

      ipc.onEvent((event) => {
        if (event.event === 'tool_start') {
          toolStartTimes.set(event.tool as string, Date.now());
        } else if (event.event === 'tool_end') {
          const startTime = toolStartTimes.get(event.tool as string);
          if (startTime) {
            event.duration_ms = Date.now() - startTime;
            toolStartTimes.delete(event.tool as string);
          }
        }
        stream?.sendMetaEvent(event);
      });
    } catch {
      console.error(`\x1b[33m[aistreamer]\x1b[0m Could not install Claude Code hooks. Streaming raw only.`);
    }
  }

  // Print stream info
  if (streamUrl) {
    console.error(`\x1b[36m[aistreamer]\x1b[0m \x1b[1mLive at ${streamUrl}\x1b[0m`);
    console.error(`\x1b[33m[aistreamer]\x1b[0m Warning: Your terminal output is being broadcast publicly.`);
    console.error('');
  }

  // Spawn PTY
  const ptyProc = new PtyProcess(parsed.command, parsed.args, cols, rows);
  const startTime = Date.now();

  // Forward PTY output to terminal + stream
  ptyProc.onData((data) => {
    process.stdout.write(data);
    stream?.queueTermData(data);
  });

  // Handle terminal resize
  process.stdout.on('resize', () => {
    const newCols = process.stdout.columns || 80;
    const newRows = process.stdout.rows || 24;
    ptyProc.resize(newCols, newRows);
    stream?.sendResize(newCols, newRows);
  });

  // Forward stdin to PTY
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (data) => {
    ptyProc.write(data.toString());
  });

  // Cleanup on exit
  const cleanup = async (exitCode: number) => {
    const durationS = Math.round((Date.now() - startTime) / 1000);
    stream?.sendStreamEnd(exitCode, durationS);

    if (adapterCleanup) await adapterCleanup();
    await ipc.close();
    stream?.close();

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  };

  // Handle signals
  const signalHandler = async () => {
    ptyProc.kill('SIGTERM');
  };
  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

  // Wait for PTY to exit
  const exitCode = await ptyProc.wait();
  await cleanup(exitCode);
  process.exit(exitCode);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.subcommand === 'login') {
    const { loginFlow } = await import('./auth.js');
    const server = parsed.server ?? 'https://aistreamer.dev';
    await loginFlow(server);
    console.error('\x1b[32m[aistreamer]\x1b[0m Logged in successfully!');
    return;
  }

  if (parsed.subcommand === 'logout') {
    const { clearConfig } = await import('./auth.js');
    clearConfig();
    console.error('\x1b[32m[aistreamer]\x1b[0m Logged out.');
    return;
  }

  if (parsed.subcommand === 'whoami') {
    const { readConfig } = await import('./auth.js');
    const config = readConfig();
    if (config) {
      console.error(`Logged in as @${config.user.github_username} (via GitHub)`);
    } else {
      console.error('Not logged in. Run: aistreamer login');
    }
    return;
  }

  if (!parsed.command) {
    console.error('Usage: aistreamer [--title <title>] [--server <url>] -- <command> [args...]');
    console.error('       aistreamer login');
    console.error('       aistreamer logout');
    console.error('       aistreamer whoami');
    process.exit(0);
  }

  await runStream(parsed);
}

// Only run main() when this file is executed directly, not when imported
const isDirectExecution = process.argv[1] &&
  (process.argv[1].endsWith('/cli.ts') || process.argv[1].endsWith('/cli.js'));

if (isDirectExecution) {
  main().catch((err) => {
    console.error(`\x1b[31m[aistreamer]\x1b[0m ${err.message}`);
    process.exit(1);
  });
}
