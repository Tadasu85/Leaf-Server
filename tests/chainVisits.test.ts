import request from 'supertest';
import ChainVisitService from '../src/services/ChainVisitService';
import CurationService from '../src/services/CurationService';
import { BlockRangeMoveSource, ChainOp, MoveSource } from '../src/services/MoveSource';
import { app, cleanup } from '../src/server';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;
const HOUR = 3600 * 1000;
const T0 = Date.parse('2026-11-08T12:00:00Z');

const move = (account: string, author: string, permlink: string, time = T0, block = 1): ChainOp => ({
  block, time, account, id: 'ego-death',
  json: JSON.stringify({ move_to: { Location: { author, permlink } } }),
});

describe('BlockRangeMoveSource', () => {
  const block = (ts: string, ops: Array<{ type: string; value: any }>) => ({ timestamp: ts, transactions: [{ operations: ops }] });
  const cj = (id: string, auth: string, json: string) => ({
    type: 'custom_json_operation', value: { id, required_posting_auths: [auth], required_auths: [], json },
  });

  const fakeNode = (blocksFrom: (start: number, count: number) => any[], head = 500) => {
    const calls: any[] = [];
    const fetcher = jest.fn(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      const result = body.method === 'block_api.get_block_range'
        ? { blocks: blocksFrom(body.params.starting_block_num, body.params.count) }
        : { last_irreversible_block_num: head };
      return { text: async () => JSON.stringify({ result }) } as any;
    });
    return { fetcher, calls };
  };

  it('keeps only our custom_json ops, numbered by block, in batches', async () => {
    const { fetcher, calls } = fakeNode((start, count) => Array.from({ length: count }, (_, i) =>
      block('2026-11-08T12:00:00', start + i === 105
        ? [cj('ego-death', 'alice', '{"a":1}'), cj('sm_market', 'bob', '{}'), { type: 'vote_operation', value: {} }]
        : [])));
    const src = new BlockRangeMoveSource(logger, ['https://node'], 50, fetcher as any);
    const res = await src.read(100, 219, 'ego-death');
    expect(calls.map((c) => c.params)).toEqual([
      { starting_block_num: 100, count: 50 },
      { starting_block_num: 150, count: 50 },
      { starting_block_num: 200, count: 20 },
    ]);
    expect(res.ops).toEqual([{ block: 105, time: T0, account: 'alice', id: 'ego-death', json: '{"a":1}' }]);
    expect(res.bytes).toBeGreaterThan(0);
    expect(res.lastBlock).toBeUndefined();
    await expect(src.headBlock()).resolves.toBe(500);
  });

  it('reports where it stopped when a node returns fewer blocks', async () => {
    const { fetcher } = fakeNode((_s, count) => Array.from({ length: Math.min(count, 30) }, () => block('2026-11-08T12:00:00', [])));
    const src = new BlockRangeMoveSource(logger, ['https://node'], 50, fetcher as any);
    const res = await src.read(100, 199, 'ego-death');
    expect(res.lastBlock).toBe(129);
  });

  it('moves to the next node when one fails', async () => {
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ text: async () => JSON.stringify({ result: { last_irreversible_block_num: 7 } }) });
    const src = new BlockRangeMoveSource(logger, ['https://a', 'https://b'], 50, fetcher as any);
    await expect(src.headBlock()).resolves.toBe(7);
    expect(fetcher.mock.calls[1][0]).toBe('https://b');
  });
});

describe('ChainVisitService counting', () => {
  const svc = () => new ChainVisitService(logger, {} as MoveSource, { gameId: 'ego-death' });

  it('counts each player once per room', () => {
    const s = svc();
    s.apply(move('alice', 'ray', 'cave'));
    s.apply(move('alice', 'ray', 'cave', T0 + 1000));
    s.apply(move('bob', 'ray', 'cave'));
    s.apply(move('bob', 'ray', 'dock'));
    expect(s.getCounts().map((r) => [r.channelId, r.uniqueVisitors])).toEqual([['ray/cave', 2], ['ray/dock', 1]]);
  });

  it("doesn't count an author visiting their own room", () => {
    const s = svc();
    s.apply(move('ray', 'ray', 'cave'));
    expect(s.getCounts()).toEqual([]);
    expect(s.getStats().movesSkipped).toBe(1);
  });

  it('skips malformed ops and other ids', () => {
    const s = svc();
    s.apply({ ...move('alice', 'ray', 'cave'), json: 'not json' });
    s.apply({ ...move('alice', 'ray', 'cave'), json: '{"move_to":{"Location":{"author":5}}}' });
    s.apply({ ...move('alice', 'ray', 'cave'), id: 'other-game' });
    expect(s.getCounts()).toEqual([]);
  });

  it('drops visits older than the window', () => {
    const s = svc();
    s.apply(move('alice', 'ray', 'cave', T0));
    s.apply(move('bob', 'ray', 'dock', T0 + 25 * HOUR));
    expect(s.getCounts().map((r) => r.channelId)).toEqual(['ray/dock']);
  });

  it('lists only rooms on the map once the map has loaded', () => {
    const s = new ChainVisitService(logger, {} as MoveSource, {
      gameId: 'ego-death', isMapLoaded: () => true, isKnownRoom: (_a, p) => p === 'cave',
    });
    s.apply(move('alice', 'ray', 'cave'));
    s.apply(move('alice', 'ray', 'not-a-room'));
    expect(s.getCounts().map((r) => r.channelId)).toEqual(['ray/cave']);
  });
});

describe('ChainVisitService reading', () => {
  const makeSource = (head: { n: number }, failFrom?: number) => {
    const reads: Array<[number, number]> = [];
    const source: MoveSource = {
      name: 'fake',
      headBlock: async () => head.n,
      read: async (from, to) => {
        if (failFrom !== undefined && from >= failFrom) throw new Error('node down');
        reads.push([from, to]);
        return { ops: from <= 50 && 50 <= to ? [move('alice', 'ray', 'cave', T0, 50)] : [], bytes: (to - from + 1) * 1000 };
      },
    };
    return { source, reads };
  };
  // 300 s window at 3 s blocks = 100 blocks.
  const opts = { gameId: 'ego-death', windowMs: 300 * 1000 };

  it('reads one window back on start, then only new blocks', async () => {
    const head = { n: 1100 };
    const { source, reads } = makeSource(head);
    const s = new ChainVisitService(logger, source, opts);
    expect(s.isReady()).toBe(false);
    await s.tick();
    expect(reads).toEqual([[1001, 1100]]);
    expect(s.isReady()).toBe(true);
    expect(s.getStats()).toMatchObject({ firstBlock: 1001, lastBlock: 1100, blocksRead: 100, mbDownloaded: 0.1 });
    head.n = 1120;
    await s.tick();
    expect(reads[1]).toEqual([1101, 1120]);
  });

  it('starts a fresh window after sleeping longer than the window', async () => {
    const head = { n: 1100 };
    const { source, reads } = makeSource(head);
    const s = new ChainVisitService(logger, source, opts);
    await s.tick();
    head.n = 5000;
    await s.tick();
    expect(reads[1]).toEqual([4901, 5000]);
  });

  it('reads a long backfill in chunks of 1000 blocks', async () => {
    const { source, reads } = makeSource({ n: 2500 });
    const s = new ChainVisitService(logger, source, { gameId: 'ego-death', windowMs: 2500 * 3000 });
    await s.tick();
    expect(reads).toEqual([[1, 1000], [1001, 2000], [2001, 2500]]);
    expect(s.getCounts()).toHaveLength(1);
  });

  it('keeps counts and resumes from the same block after a failed read', async () => {
    const head = { n: 100 };
    const { source } = makeSource(head);
    const s = new ChainVisitService(logger, source, opts);
    await s.tick();
    const failing = makeSource(head, 101);
    (s as any).source = failing.source;
    head.n = 120;
    await s.tick();
    expect(s.getStats().lastError).toMatch(/node down/);
    expect(s.getStats().lastBlock).toBe(100);
    expect(s.getCounts()).toHaveLength(1);
  });
});

describe('CurationService with chain visits', () => {
  it('ignores chat joins and ranks from the chain', () => {
    const curation = new CurationService(logger, 'hive-109456', null);
    const counts = [{ channelId: 'ray/cave', author: 'ray', permlink: 'cave', uniqueVisitors: 4 }];
    curation.setVisitSource({ isReady: () => true, getCounts: () => counts });
    curation.recordVisit('ray/dock', 'alice');
    expect(curation.getDryRun()).toEqual(counts);
  });
});

describe('/curation/dryrun', () => {
  afterAll(() => cleanup());

  it('says where visits come from and what reading costs', async () => {
    const res = await request(app).get('/curation/dryrun');
    expect(res.status).toBe(200);
    expect(res.body.visits).toMatchObject({ source: 'block_api.get_block_range', ready: false, windowHours: 24 });
    expect(Array.isArray(res.body.fullRanking)).toBe(true);
  });
});
