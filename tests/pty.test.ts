import { describe, it, expect } from 'vitest';
import { PtyProcess } from '../src/pty.js';

describe('PtyProcess', () => {
  it('captures output from a spawned command', async () => {
    const chunks: Buffer[] = [];
    const pty = new PtyProcess('echo', ['hello']);
    pty.onData((data) => chunks.push(data));

    const exitCode = await pty.wait();

    expect(exitCode).toBe(0);
    const output = Buffer.concat(chunks).toString();
    expect(output).toContain('hello');
  });

  it('reports non-zero exit codes', async () => {
    const pty = new PtyProcess('bash', ['-c', 'exit 42']);
    const exitCode = await pty.wait();
    expect(exitCode).toBe(42);
  });

  it('forwards input to the PTY', async () => {
    const chunks: Buffer[] = [];
    const pty = new PtyProcess('cat', []);
    pty.onData((data) => chunks.push(data));

    pty.write('hello\n');
    // Give cat time to echo back
    await new Promise((r) => setTimeout(r, 200));
    pty.write('\x04'); // EOF (Ctrl+D)

    await pty.wait();
    const output = Buffer.concat(chunks).toString();
    expect(output).toContain('hello');
  });
});
