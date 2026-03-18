import { describe, it, expect, beforeEach } from 'vitest';
import { EventLogger } from '../src/clickhouse.js';

describe('EventLogger batching', () => {
  let flushed: Array<Array<{ stream_id: string; channel: string; data: string; ts: number }>>;
  let logger: EventLogger;

  beforeEach(() => {
    flushed = [];
    logger = new EventLogger({
      flushFn: async (events) => { flushed.push([...events]); },
      flushIntervalMs: 100,
      maxBatchSize: 3,
    });
  });

  it('flushes when batch reaches maxBatchSize', async () => {
    logger.log('stream1', 'term', '{"data":"a"}', Date.now());
    logger.log('stream1', 'term', '{"data":"b"}', Date.now());
    expect(flushed).toHaveLength(0);
    logger.log('stream1', 'term', '{"data":"c"}', Date.now());
    await new Promise((r) => setTimeout(r, 50));
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(3);
  });

  it('flushes on interval', async () => {
    logger.log('stream1', 'term', '{"data":"a"}', Date.now());
    expect(flushed).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 150));
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(1);
  });

  it('does not flush empty batches', async () => {
    await new Promise((r) => setTimeout(r, 150));
    expect(flushed).toHaveLength(0);
  });

  it('stops flushing after close', async () => {
    logger.log('stream1', 'term', '{"data":"a"}', Date.now());
    await logger.close();
    expect(flushed).toHaveLength(1);
  });
});
