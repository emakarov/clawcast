import { describe, it, expect } from 'vitest';
import { encodeTermData, encodeMetaEvent, encodeStreamStart, encodeStreamEnd, encodeResize } from '../src/stream.js';

describe('Stream protocol encoding', () => {
  it('encodes terminal data as base64', () => {
    const msg = encodeTermData(Buffer.from('hello'));
    const parsed = JSON.parse(msg);
    expect(parsed.ch).toBe('term');
    expect(Buffer.from(parsed.data, 'base64').toString()).toBe('hello');
    expect(parsed.ts).toBeTypeOf('number');
  });

  it('encodes meta events', () => {
    const msg = encodeMetaEvent({ event: 'tool_start', tool: 'Edit', file: 'app.ts' });
    const parsed = JSON.parse(msg);
    expect(parsed.ch).toBe('meta');
    expect(parsed.event).toBe('tool_start');
    expect(parsed.tool).toBe('Edit');
  });

  it('encodes stream_start', () => {
    const msg = encodeStreamStart({ title: 'test', agent: 'claude-code', cols: 120, rows: 40 });
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('stream_start');
    expect(parsed.protocol_version).toBe(1);
    expect(parsed.cols).toBe(120);
  });

  it('encodes stream_end', () => {
    const msg = encodeStreamEnd(0, 3600);
    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('stream_end');
    expect(parsed.exit_code).toBe(0);
  });

  it('encodes resize events', () => {
    const msg = encodeResize(140, 50);
    const parsed = JSON.parse(msg);
    expect(parsed.ch).toBe('term');
    expect(parsed.type).toBe('resize');
    expect(parsed.cols).toBe(140);
  });
});

import { StreamClient } from '../src/stream.js';
import { WebSocketServer } from 'ws';

describe('StreamClient batching', () => {
  it('batches multiple queueTermData calls into one send', async () => {
    const messages: string[] = [];
    const wss = new WebSocketServer({ port: 0 });
    const port = (wss.address() as { port: number }).port;

    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'stream_started', stream_id: 'test', url: 'http://test/s/test' }));
      ws.on('message', (data) => messages.push(data.toString()));
    });

    const client = new StreamClient(`ws://localhost:${port}`, 'test-token');
    await client.connect({ title: 'test', cols: 80, rows: 24 });

    // Queue multiple chunks rapidly
    client.queueTermData(Buffer.from('hello'));
    client.queueTermData(Buffer.from(' world'));

    // Wait for batch interval
    await new Promise((r) => setTimeout(r, 50));

    // Should have stream_start + one batched term message (not two)
    const termMessages = messages.filter((m) => JSON.parse(m).ch === 'term');
    expect(termMessages.length).toBe(1);

    const decoded = Buffer.from(JSON.parse(termMessages[0]).data, 'base64').toString();
    expect(decoded).toBe('hello world');

    client.close();
    wss.close();
  });
});
