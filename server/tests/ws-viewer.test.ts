import { describe, it, expect, beforeEach } from 'vitest';
import { handleViewerConnection } from '../src/ws-viewer.js';
import { StreamManager } from '../src/stream-manager.js';
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

describe('handleViewerConnection', () => {
  let mgr: StreamManager;
  beforeEach(() => { mgr = new StreamManager(); });

  it('sends snapshot and subscribes viewer to live stream', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });
    mgr.appendToBuffer('s1', Buffer.from('hello'));

    const viewer = mockWs();
    handleViewerConnection(viewer, 's1', mgr);

    const snapshot = JSON.parse(viewer.lastSent);
    expect(snapshot.type).toBe('snapshot');
    expect(mgr.getViewerCount('s1')).toBe(1);
  });

  it('sends error for non-existent stream', () => {
    const viewer = mockWs();
    handleViewerConnection(viewer, 'nonexistent', mgr);

    const msg = JSON.parse(viewer.lastSent);
    expect(msg.type).toBe('error');
    expect(viewer.closeCalled).toBe(true);
  });

  it('removes viewer on disconnect', () => {
    const broadcaster = mockWs();
    mgr.registerStream('s1', broadcaster, { title: 'test', agent: 'claude', cols: 80, rows: 24, userId: 'u1', username: 'testuser', avatarUrl: '' });

    const viewer = mockWs();
    handleViewerConnection(viewer, 's1', mgr);
    expect(mgr.getViewerCount('s1')).toBe(1);

    viewer.emit('close');
    expect(mgr.getViewerCount('s1')).toBe(0);
  });
});
