import type WebSocket from 'ws';

const MAX_BUFFER_BYTES = 1024 * 1024;

export interface StreamMetadata {
  title: string; agent: string; cols: number; rows: number;
  userId: string; username: string; avatarUrl: string;
}

export interface ActiveStream {
  broadcaster: WebSocket;
  viewers: Set<WebSocket>;
  buffer: Buffer;
  metadata: StreamMetadata & { id: string; startedAt: Date };
}

export class StreamManager {
  private streams = new Map<string, ActiveStream>();

  registerStream(id: string, broadcaster: WebSocket, metadata: StreamMetadata): void {
    this.streams.set(id, {
      broadcaster, viewers: new Set(), buffer: Buffer.alloc(0),
      metadata: { ...metadata, id, startedAt: new Date() },
    });
  }

  endStream(id: string): void {
    const stream = this.streams.get(id);
    if (!stream) return;
    const msg = JSON.stringify({ type: 'stream_ended' });
    for (const viewer of stream.viewers) { try { viewer.send(msg); } catch {} }
    this.streams.delete(id);
  }

  addViewer(streamId: string, viewer: WebSocket): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    const snapshot = JSON.stringify({
      type: 'snapshot', data: stream.buffer.toString('base64'),
      cols: stream.metadata.cols, rows: stream.metadata.rows,
      title: stream.metadata.title, agent: stream.metadata.agent,
    });
    viewer.send(snapshot);
    stream.viewers.add(viewer);
  }

  removeViewer(streamId: string, viewer: WebSocket): void {
    this.streams.get(streamId)?.viewers.delete(viewer);
  }

  broadcast(streamId: string, message: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    for (const viewer of stream.viewers) {
      try { if (viewer.readyState === 1) viewer.send(message); } catch {}
    }
  }

  appendToBuffer(streamId: string, data: Buffer): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    stream.buffer = Buffer.concat([stream.buffer, data]);
    if (stream.buffer.length > MAX_BUFFER_BYTES) {
      // Trim from start without reset sequence to avoid flashing
      // Keep last 75% of buffer instead of using a reset sequence
      const keepFrom = Math.floor(stream.buffer.length * 0.25);
      stream.buffer = stream.buffer.subarray(keepFrom);
    }
  }

  updateDimensions(streamId: string, cols: number, rows: number): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    stream.metadata.cols = cols;
    stream.metadata.rows = rows;
  }

  getActiveStreams(): ActiveStream[] { return Array.from(this.streams.values()); }
  getStream(id: string): ActiveStream | undefined { return this.streams.get(id); }
  getViewerCount(id: string): number { return this.streams.get(id)?.viewers.size ?? 0; }

  getStreamByUserId(userId: string): ActiveStream | undefined {
    for (const stream of this.streams.values()) {
      if (stream.metadata.userId === userId) return stream;
    }
    return undefined;
  }

  endAll(): string[] {
    const ids = Array.from(this.streams.keys());
    for (const id of ids) this.endStream(id);
    return ids;
  }
}
