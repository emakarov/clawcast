import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StreamManager } from '../src/stream-manager.js';
import { EventLogger } from '../src/clickhouse.js';
import { handleBroadcasterMessage } from '../src/ws-broadcaster.js';
import { handleViewerConnection } from '../src/ws-viewer.js';
import { EventEmitter } from 'node:events';

function mockWs(): any {
  const ws = new EventEmitter() as any;
  ws.send = (data: string) => { ws.lastSent = data; ws.allSent = ws.allSent || []; ws.allSent.push(data); };
  ws.close = () => { ws.closeCalled = true; };
  ws.readyState = 1;
  ws.lastSent = null;
  ws.allSent = [];
  ws.closeCalled = false;
  return ws;
}

describe('Integration: broadcaster → viewer flow', () => {
  let mgr: StreamManager;
  let logger: EventLogger;
  let logged: any[];

  beforeEach(() => {
    mgr = new StreamManager();
    logged = [];
    logger = new EventLogger({ flushFn: async (e) => logged.push(...e), maxBatchSize: 1000, flushIntervalMs: 60000 });
  });

  afterEach(async () => {
    await logger.close();
  });

  it('full lifecycle: start → stream data → viewer joins → stream ends', async () => {
    const broadcaster = mockWs();

    // 1. Start stream
    const streamId = await handleBroadcasterMessage(
      broadcaster, mgr, logger, 'user1', 'testuser', '',
      JSON.stringify({ type: 'stream_start', title: 'E2E Test', agent: 'claude-code', cols: 120, rows: 40, protocol_version: 1 }),
      null
    );
    expect(streamId).toBeTruthy();

    // 2. Send some terminal data
    const termData = Buffer.from('Hello, viewers!').toString('base64');
    await handleBroadcasterMessage(
      broadcaster, mgr, logger, 'user1', 'testuser', '',
      JSON.stringify({ ch: 'term', data: termData, ts: Date.now() }),
      streamId
    );

    // 3. Viewer joins mid-stream
    const viewer = mockWs();
    handleViewerConnection(viewer, streamId!, mgr);

    // Viewer should get snapshot with accumulated data
    const snapshot = JSON.parse(viewer.allSent[0]);
    expect(snapshot.type).toBe('snapshot');
    expect(Buffer.from(snapshot.data, 'base64').toString()).toBe('Hello, viewers!');

    // 4. More data arrives — viewer should get it
    const moreData = Buffer.from(' More data!').toString('base64');
    await handleBroadcasterMessage(
      broadcaster, mgr, logger, 'user1', 'testuser', '',
      JSON.stringify({ ch: 'term', data: moreData, ts: Date.now() }),
      streamId
    );
    expect(viewer.allSent.length).toBe(2); // snapshot + term message

    // 5. Stream ends
    await handleBroadcasterMessage(
      broadcaster, mgr, logger, 'user1', 'testuser', '',
      JSON.stringify({ type: 'stream_end', reason: 'exit', exit_code: 0, duration_s: 60 }),
      streamId
    );

    // Viewer should get stream_ended
    const ended = JSON.parse(viewer.allSent[viewer.allSent.length - 1]);
    expect(ended.type).toBe('stream_ended');

    // Stream should be gone
    expect(mgr.getStream(streamId!)).toBeUndefined();

    // Events should be logged
    await logger.close();
    expect(logged.length).toBe(2); // two term messages
  });
});
