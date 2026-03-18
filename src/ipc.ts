import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type EventHandler = (event: Record<string, unknown>) => void;

export class IpcServer {
  private server: net.Server | null = null;
  private handlers: EventHandler[] = [];
  readonly socketPath: string;

  constructor(pid: number) {
    this.socketPath = path.join(os.tmpdir(), `aistreamer-${pid}.sock`);
  }

  onEvent(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  async start(): Promise<void> {
    // Clean up stale socket
    try {
      fs.unlinkSync(this.socketPath);
    } catch {}

    this.server = net.createServer((conn) => {
      let buffer = '';
      conn.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop()!; // keep incomplete line in buffer
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            for (const handler of this.handlers) {
              handler(event);
            }
          } catch {}
        }
      });
    });

    // Set socket permissions
    return new Promise((resolve, reject) => {
      this.server!.on('error', reject);
      this.server!.listen(this.socketPath, () => {
        fs.chmodSync(this.socketPath, 0o600);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          try {
            fs.unlinkSync(this.socketPath);
          } catch {}
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  static cleanupStale(): void {
    const tmpDir = os.tmpdir();
    try {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        const match = file.match(/^aistreamer-(\d+)\.sock$/);
        if (match) {
          const pid = parseInt(match[1], 10);
          if (!isProcessAlive(pid)) {
            try {
              fs.unlinkSync(path.join(tmpDir, file));
            } catch {}
          }
        }
      }
    } catch {}
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
