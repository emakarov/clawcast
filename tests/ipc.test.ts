import { describe, it, expect, afterEach } from 'vitest';
import { IpcServer } from '../src/ipc.js';
import net from 'node:net';
import fs from 'node:fs';

describe('IpcServer', () => {
  let server: IpcServer;

  afterEach(async () => {
    if (server) await server.close();
  });

  it('receives JSON events over Unix socket', async () => {
    const events: Record<string, unknown>[] = [];
    server = new IpcServer(process.pid);
    server.onEvent((event) => events.push(event));
    await server.start();

    // Connect and send an event
    const client = net.createConnection(server.socketPath);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    client.write(JSON.stringify({ event: 'tool_start', tool: 'Edit' }) + '\n');
    await new Promise((r) => setTimeout(r, 100));
    client.end();

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('tool_start');
    expect(events[0].tool).toBe('Edit');
  });

  it('cleans up socket file on close', async () => {
    server = new IpcServer(process.pid);
    await server.start();
    const sockPath = server.socketPath;
    expect(fs.existsSync(sockPath)).toBe(true);

    await server.close();
    expect(fs.existsSync(sockPath)).toBe(false);
  });
});
