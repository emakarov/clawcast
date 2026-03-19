import type WebSocket from 'ws';
import { StreamManager } from './stream-manager.js';

export function handleViewerConnection(ws: WebSocket, streamId: string, mgr: StreamManager): void {
  const stream = mgr.getStream(streamId);
  if (!stream) {
    ws.send(JSON.stringify({ type: 'error', message: 'Stream not found or has ended' }));
    ws.close();
    return;
  }
  mgr.addViewer(streamId, ws);
  ws.on('close', () => { mgr.removeViewer(streamId, ws); });
  ws.on('error', () => { mgr.removeViewer(streamId, ws); });
}
