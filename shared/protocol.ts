// shared/protocol.ts
// Message types shared between CLI broadcaster and backend server.

export interface StreamStartMessage {
  type: 'stream_start';
  title: string;
  agent: string;
  cols: number;
  rows: number;
  protocol_version: number;
}

export interface StreamStartedMessage {
  type: 'stream_started';
  stream_id: string;
  url: string;
}

export interface StreamEndMessage {
  type: 'stream_end';
  reason: string;
  exit_code: number;
  duration_s: number;
}

export interface StreamEndedMessage {
  type: 'stream_ended';
}

export interface TermDataMessage {
  ch: 'term';
  data: string; // base64
  ts: number;
}

export interface TermResizeMessage {
  ch: 'term';
  type: 'resize';
  cols: number;
  rows: number;
  ts: number;
}

export interface MetaEventMessage {
  ch: 'meta';
  event: string;
  ts: number;
  [key: string]: unknown;
}

export interface SnapshotMessage {
  type: 'snapshot';
  data: string; // base64
  cols: number;
  rows: number;
  title: string;
  agent: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type BroadcasterMessage = StreamStartMessage | StreamEndMessage | TermDataMessage | TermResizeMessage | MetaEventMessage;
export type ServerToBroadcasterMessage = StreamStartedMessage | ErrorMessage;
export type ServerToViewerMessage = SnapshotMessage | StreamEndedMessage | ErrorMessage | TermDataMessage | MetaEventMessage;

export const PROTOCOL_VERSION = 1;
