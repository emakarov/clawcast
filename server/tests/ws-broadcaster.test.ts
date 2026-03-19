import { describe, it, expect, beforeEach } from 'vitest';
import { handleBroadcasterMessage } from '../src/ws-broadcaster.js';
import { StreamManager } from '../src/stream-manager.js';
import { EventLogger } from '../src/clickhouse.js';
import { EventEmitter } from 'node:events';

function mockWs(): any {
  const ws = new EventEmitter() as any;
  ws.send = (data: string) => { ws.lastSent = data; ws.allSent = ws.allSent || []; ws.allSent.push(data); };
  ws.close = () => {};
  ws.readyState = 1;
  ws.lastSent = null;
  ws.allSent = [];
  return ws;
}

describe('handleBroadcasterMessage', () => {
  let mgr: StreamManager;
  let logger: EventLogger;
  let flushed: any[];

  beforeEach(() => {
    mgr = new StreamManager();
    flushed = [];
    logger = new EventLogger({ flushFn: async (e) => flushed.push(...e), maxBatchSize: 1000, flushIntervalMs: 60000 });
  });

  it('handles stream_start and responds with stream_started', async () => {
    const ws = mockWs();
    const streamId = await handleBroadcasterMessage(ws, mgr, logger, 'u1', 'testuser', '', JSON.stringify({
      type: 'stream_start', title: 'test', agent: 'claude-code', cols: 120, rows: 40, protocol_version: 1,
    }), null);
    expect(streamId).toBeTruthy();
    const response = JSON.parse(ws.lastSent);
    expect(response.type).toBe('stream_started');
    expect(response.stream_id).toBe(streamId);
  });

  it('rejects unsupported protocol version', async () => {
    const ws = mockWs();
    const streamId = await handleBroadcasterMessage(ws, mgr, logger, 'u1', 'testuser', '', JSON.stringify({
      type: 'stream_start', title: 'test', agent: 'claude-code', cols: 120, rows: 40, protocol_version: 99,
    }), null);
    expect(streamId).toBeNull();
    const response = JSON.parse(ws.lastSent);
    expect(response.type).toBe('error');
  });

  it('forwards term messages to StreamManager and logger', async () => {
    const ws = mockWs();
    mgr.registerStream('s1', ws, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    const viewer = mockWs();
    mgr.addViewer('s1', viewer);

    await handleBroadcasterMessage(ws, mgr, logger, 'u1', 'testuser', '', JSON.stringify({
      ch: 'term', data: Buffer.from('hello').toString('base64'), ts: Date.now(),
    }), 's1');

    expect(viewer.allSent.length).toBe(2); // snapshot + term
    await logger.close();
    expect(flushed.length).toBe(1);
    expect(flushed[0].channel).toBe('term');
  });

  it('updates dimensions on resize message', async () => {
    const ws = mockWs();
    mgr.registerStream('s1', ws, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    await handleBroadcasterMessage(ws, mgr, logger, 'u1', 'testuser', '', JSON.stringify({
      ch: 'term', type: 'resize', cols: 140, rows: 50, ts: Date.now(),
    }), 's1');

    const stream = mgr.getStream('s1');
    expect(stream!.metadata.cols).toBe(140);
    expect(stream!.metadata.rows).toBe(50);
  });
});
