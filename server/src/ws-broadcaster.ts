import type WebSocket from 'ws';
import { ulid } from 'ulid';
import { StreamManager } from './stream-manager.js';
import { EventLogger } from './clickhouse.js';
import { config } from './config.js';
import { PROTOCOL_VERSION } from '../../shared/protocol.js';
import { createStream as dbCreateStream, endStream as dbEndStream, type DbPool } from './db.js';

export async function handleBroadcasterMessage(
  ws: WebSocket,
  mgr: StreamManager,
  logger: EventLogger,
  userId: string,
  username: string,
  avatarUrl: string,
  rawMessage: string,
  currentStreamId: string | null,
  pool?: DbPool,
): Promise<string | null> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(rawMessage);
  } catch {
    return currentStreamId;
  }

  if (msg.type === 'stream_start') {
    if (msg.protocol_version !== PROTOCOL_VERSION) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unsupported protocol version. Please update your CLI.' }));
      ws.close();
      return null;
    }

    // End any existing stream for this user
    const existing = mgr.getStreamByUserId(userId);
    if (existing) {
      mgr.endStream(existing.metadata.id);
      if (pool) await dbEndStream(pool, existing.metadata.id);
    }

    const streamId = ulid();
    const metadata = {
      title: (msg.title as string) || '',
      agent: (msg.agent as string) || 'unknown',
      cols: (msg.cols as number) || 80,
      rows: (msg.rows as number) || 24,
      userId, username, avatarUrl,
    };

    mgr.registerStream(streamId, ws, metadata);

    if (pool) {
      try {
        await dbCreateStream(pool, { id: streamId, userId, ...metadata });
      } catch (err) {
        console.error('[aistreamer] Failed to create stream in DB:', err);
      }
    }

    const url = `${config.baseUrl}/s/${streamId}`;
    ws.send(JSON.stringify({ type: 'stream_started', stream_id: streamId, url }));
    return streamId;
  }

  if (!currentStreamId) return null;

  if (msg.type === 'stream_end') {
    mgr.endStream(currentStreamId);
    if (pool) { try { await dbEndStream(pool, currentStreamId); } catch {} }
    return null;
  }

  if (msg.ch === 'term') {
    if (msg.type === 'resize') {
      mgr.updateDimensions(currentStreamId, msg.cols as number, msg.rows as number);
    } else if (msg.data) {
      const decoded = Buffer.from(msg.data as string, 'base64');
      mgr.appendToBuffer(currentStreamId, decoded);
    }
    mgr.broadcast(currentStreamId, rawMessage);
    logger.log(currentStreamId, 'term', rawMessage, (msg.ts as number) || Date.now());
  } else if (msg.ch === 'meta') {
    mgr.broadcast(currentStreamId, rawMessage);
    logger.log(currentStreamId, 'meta', rawMessage, (msg.ts as number) || Date.now());
  }

  return currentStreamId;
}
