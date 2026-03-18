import * as pty from 'node-pty';

export type DataHandler = (data: Buffer) => void;

export class PtyProcess {
  private proc: pty.IPty;
  private dataHandlers: DataHandler[] = [];
  private exitPromise: Promise<number>;

  constructor(command: string, args: string[], cols = 80, rows = 24) {
    this.proc = pty.spawn(command, args, {
      name: process.env.TERM || 'xterm-256color',
      cols,
      rows,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.proc.onData((data) => {
      const buf = Buffer.from(data);
      for (const handler of this.dataHandlers) {
        handler(buf);
      }
    });

    this.exitPromise = new Promise((resolve) => {
      this.proc.onExit(({ exitCode }) => resolve(exitCode));
    });
  }

  onData(handler: DataHandler): void {
    this.dataHandlers.push(handler);
  }

  write(data: string): void {
    this.proc.write(data);
  }

  resize(cols: number, rows: number): void {
    this.proc.resize(cols, rows);
  }

  kill(signal?: string): void {
    this.proc.kill(signal);
  }

  wait(): Promise<number> {
    return this.exitPromise;
  }

  get pid(): number {
    return this.proc.pid;
  }
}
