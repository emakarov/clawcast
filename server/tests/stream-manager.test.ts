import { describe, it, expect, beforeEach } from 'vitest';
import { StreamManager } from '../src/stream-manager.js';
import { EventEmitter } from 'node:events';

function mockWs(): any {
  const ws = new EventEmitter() as any;
  ws.send = (data: string) => { ws.lastSent = data; ws.allSent = ws.allSent || []; ws.allSent.push(data); };
  ws.close = () => { ws.emit('close'); };
  ws.readyState = 1;
  ws.lastSent = null;
  ws.allSent = [];
  return ws;
}

describe('StreamManager', () => {
  let mgr: StreamManager;
  beforeEach(() => { mgr = new StreamManager(); });

  it('registers and retrieves a stream', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    const stream = mgr.getStream('s1');
    expect(stream).toBeDefined();
    expect(stream!.metadata.title).toBe('test');
  });

  it('adds viewers and sends snapshot', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    mgr.appendToBuffer('s1', Buffer.from('hello'));
    const viewer = mockWs();
    mgr.addViewer('s1', viewer);
    expect(viewer.lastSent).toBeTruthy();
    const snapshot = JSON.parse(viewer.lastSent);
    expect(snapshot.type).toBe('snapshot');
    expect(Buffer.from(snapshot.data, 'base64').toString()).toBe('hello');
    expect(mgr.getViewerCount('s1')).toBe(1);
  });

  it('broadcasts to all viewers', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    const v1 = mockWs();
    const v2 = mockWs();
    mgr.addViewer('s1', v1);
    mgr.addViewer('s1', v2);
    mgr.broadcast('s1', '{"ch":"term","data":"dGVzdA=="}');
    expect(v1.allSent.length).toBe(2); // snapshot + broadcast
    expect(v2.allSent.length).toBe(2);
  });

  it('removes viewers', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    const viewer = mockWs();
    mgr.addViewer('s1', viewer);
    expect(mgr.getViewerCount('s1')).toBe(1);
    mgr.removeViewer('s1', viewer);
    expect(mgr.getViewerCount('s1')).toBe(0);
  });

  it('ends stream and notifies viewers', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    const viewer = mockWs();
    mgr.addViewer('s1', viewer);
    mgr.endStream('s1');
    const lastMsg = JSON.parse(viewer.allSent[viewer.allSent.length - 1]);
    expect(lastMsg.type).toBe('stream_ended');
    expect(mgr.getStream('s1')).toBeUndefined();
  });

  it('caps buffer at 1MB', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    const chunk = Buffer.alloc(512 * 1024, 'x');
    mgr.appendToBuffer('s1', chunk);
    mgr.appendToBuffer('s1', chunk);
    mgr.appendToBuffer('s1', chunk);
    const stream = mgr.getStream('s1');
    expect(stream!.buffer.length).toBeLessThanOrEqual(1024 * 1024);
  });

  it('lists active streams', () => {
    mgr.registerStream('s1', mockWs(), { title: 'a', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'user1', avatarUrl: '' });
    mgr.registerStream('s2', mockWs(), { title: 'b', agent: 'aider', cols: 80, rows: 24, userId: 'u2', username: 'user2', avatarUrl: '' });
    expect(mgr.getActiveStreams()).toHaveLength(2);
  });

  it('updates cols/rows on resize', () => {
    mgr.registerStream('s1', mockWs(), { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    mgr.updateDimensions('s1', 120, 40);
    const stream = mgr.getStream('s1');
    expect(stream!.metadata.cols).toBe(120);
    expect(stream!.metadata.rows).toBe(40);
  });
});
