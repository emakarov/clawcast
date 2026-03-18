import { createClient, type ClickHouseClient } from '@clickhouse/client';

interface EventRow {
  stream_id: string;
  channel: string;
  data: string;
  ts: number;
}

interface EventLoggerOptions {
  flushFn?: (events: EventRow[]) => Promise<void>;
  flushIntervalMs?: number;
  maxBatchSize?: number;
}

export class EventLogger {
  private batch: EventRow[] = [];
  private flushFn: (events: EventRow[]) => Promise<void>;
  private flushInterval: ReturnType<typeof setInterval>;
  private maxBatchSize: number;

  constructor(opts: EventLoggerOptions = {}) {
    this.flushFn = opts.flushFn ?? (async () => {});
    this.maxBatchSize = opts.maxBatchSize ?? 100;
    this.flushInterval = setInterval(() => this.flush(), opts.flushIntervalMs ?? 5000);
  }

  log(streamId: string, channel: string, data: string, ts: number): void {
    this.batch.push({ stream_id: streamId, channel, data, ts });
    if (this.batch.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;
    const events = this.batch;
    this.batch = [];
    try {
      await this.flushFn(events);
    } catch (err) {
      console.warn('[aistreamer] ClickHouse flush failed:', err);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();
  }
}

export function createClickHouseLogger(url: string): EventLogger {
  const client: ClickHouseClient = createClient({ url });
  return new EventLogger({
    flushFn: async (events) => {
      await client.insert({
        table: 'stream_events',
        values: events.map((e) => ({
          stream_id: e.stream_id, channel: e.channel, data: e.data,
          ts: new Date(e.ts).toISOString(),
        })),
        format: 'JSONEachRow',
      });
    },
    flushIntervalMs: 5000,
    maxBatchSize: 100,
  });
}

export async function ensureClickHouseSchema(url: string): Promise<void> {
  const client = createClient({ url });
  await client.exec({
    query: `CREATE TABLE IF NOT EXISTS stream_events (
      stream_id String, channel String, data String,
      ts DateTime64(3), inserted_at DateTime64(3) DEFAULT now64(3)
    ) ENGINE = MergeTree() ORDER BY (stream_id, ts)`,
  });
  await client.close();
}
