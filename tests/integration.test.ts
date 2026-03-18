import { describe, it, expect } from 'vitest';
import { PtyProcess } from '../src/pty.js';
import { encodeTermData } from '../src/stream.js';
import { IpcServer } from '../src/ipc.js';
import net from 'node:net';

describe('Integration: PTY → Stream encoding', () => {
  it('captures PTY output and encodes it for streaming', async () => {
    const chunks: Buffer[] = [];
    const pty = new PtyProcess('echo', ['integration test']);
    pty.onData((data) => chunks.push(data));

    await pty.wait();

    const combined = Buffer.concat(chunks);
    const encoded = encodeTermData(combined);
    const parsed = JSON.parse(encoded);

    expect(parsed.ch).toBe('term');
    const decoded = Buffer.from(parsed.data, 'base64').toString();
    expect(decoded).toContain('integration test');
  });
});

describe('Integration: IPC → meta events', () => {
  it('receives hook events and they are properly structured', async () => {
    const events: Record<string, unknown>[] = [];
    const ipc = new IpcServer(process.pid);
    ipc.onEvent((e) => events.push(e));
    await ipc.start();

    const client = net.createConnection(ipc.socketPath);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.write(JSON.stringify({
      event: 'tool_start',
      tool: 'Edit',
      file: 'src/app.ts',
    }) + '\n');

    await new Promise((r) => setTimeout(r, 100));
    client.end();

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('tool_start');

    await ipc.close();
  });
});
