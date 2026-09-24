import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Artifact, Encounter, FieldEvent, verifyChain } from '@openfield/core';
import { cleanupTestVault, makeTestVault } from './helpers';
import { listEvidenceEntries } from '../src/main/services/evidence';
import { getMemo, insertArtifact } from '../src/main/services/repos';
import {
  codeMemoWithEntry,
  confirmMemoWithEntry,
  createEncounterWithEntry,
  createEventWithEntry,
  createMemoWithEntry,
} from '../src/main/services/registry';
import { buildTimeline, loadResearch } from '../src/main/services/research';
import { AppState } from '../src/main/state';
import { createIpcHandlers } from '../src/main/ipc';

const { db, home } = makeTestVault();
afterAll(() => cleanupTestVault(home));

let memo1 = '';
let memo2 = '';

beforeAll(() => {
  createEventWithEntry(
    db,
    FieldEvent.parse({ id: 'evt-1', date: '2026-09-09', cityCode: 'KMG', locationName: '昆明篆新市场' }),
    { ts: 1757376000000 },
  );
  createEncounterWithEntry(
    db,
    Encounter.parse({ id: 'enc-1', eventId: 'evt-1', participantRef: 'P01', samplingReason: '目的性抽样', startedAt: 1757376100000 }),
    { ts: 1757376100000 },
  );
  insertArtifact(
    db,
    Artifact.parse({ id: 'art-1', encounterId: 'enc-1', type: 'note', sha256: 'a'.repeat(64), size: 4, mime: 'text/plain', capturedAt: 1757376400000, deviceId: 'desktop' }),
    '/nowhere',
  );
});

describe('createMemoWithEntry', () => {
  it('CREATE_MEMO 入链；内容裁边、主题去重去空白；关联采集物校验', () => {
    const { memo, entry } = createMemoWithEntry(
      db,
      {
        type: 'analytical',
        content: '  报价结构浮现  ',
        themes: ['报价结构', ' 报价结构 ', '', '三角验证缺口'],
        linkedArtifactIds: ['art-1'],
      },
      { ts: 1757376500000 },
    );
    memo1 = memo.id;
    expect(entry.action).toBe('CREATE_MEMO');
    expect(memo.id).toMatch(/^memo-/);
    expect(memo.confirmedAt).toBeNull();
    expect(memo.content).toBe('报价结构浮现');
    expect(memo.themes).toEqual(['报价结构', '三角验证缺口']);
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
  });

  it('拒绝：daily 类型 / 空内容 / 未知采集物', () => {
    expect(() => createMemoWithEntry(db, { type: 'daily', content: 'x' })).toThrow(/田野日志/);
    expect(() => createMemoWithEntry(db, { type: 'quicknote', content: '   ' })).toThrow(/内容不能为空/);
    expect(() => createMemoWithEntry(db, { type: 'quicknote', content: 'x', linkedArtifactIds: ['art-nope'] })).toThrow(/采集物不存在/);
  });
});

describe('codeMemoWithEntry', () => {
  it('MEMO_CODE 入链并更新主题；重复主题归一；未知 memo 拒绝', () => {
    const { memo, entry } = codeMemoWithEntry(db, memo1, ['新主题A', ' 新主题A ', ' '], { ts: 1757376600000 });
    expect(entry.action).toBe('MEMO_CODE');
    expect(memo.themes).toEqual(['新主题A']);
    expect(getMemo(db, memo1)?.themes).toEqual(['新主题A']);
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
    expect(() => codeMemoWithEntry(db, 'memo-nope', ['x'])).toThrow(/不存在/);
  });
});

describe('loadResearch', () => {
  beforeAll(() => {
    const long = '编码草稿：木水花市场报价呈三档结构——见手青鲜货、干片、人工菌三档价差稳定，夜市尾段出现议价空间，与篆新市场批发口径不同，中间商在两档之间的抽成口径也不一致，需第二轮田野复核后才能落成分析备忘。';
    const { memo } = createMemoWithEntry(db, { type: 'quicknote', content: long, themes: ['报价结构'], linkedArtifactIds: ['art-1'] }, { ts: 1757376700000 });
    memo2 = memo.id;
    confirmMemoWithEntry(db, memo2, { confirmedAt: 1757376800000 });
    createMemoWithEntry(db, { type: 'quicknote', content: '尾段议价待核', themes: ['报价结构'] }, { ts: 1757376900000 });
  });

  it('buildTimeline：四类行齐备、按时间升序、备忘录反查所属访谈', () => {
    const rows = buildTimeline(db);
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(['event', 'encounter', 'artifact', 'memo']));
    expect(rows).toHaveLength(6); // 1 事件 + 1 访谈 + 1 采集物 + 3 备忘录
    const ats = rows.map((r) => r.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);

    const encRow = rows.find((r) => r.kind === 'encounter');
    expect(encRow).toMatchObject({ id: 'enc-1', eventId: 'evt-1' });
    const artRow = rows.find((r) => r.kind === 'artifact');
    expect(artRow).toMatchObject({ id: 'art-1', encounterId: 'enc-1' });
    const memoRow = rows.find((r) => r.id === memo2);
    expect(memoRow).toMatchObject({ confirmed: true, encounterId: 'enc-1' });
    expect(memoRow?.detail.endsWith('…')).toBe(true); // 长内容截断到 80 字
    expect(memoRow?.themes).toEqual(['报价结构']);
  });

  it('loadResearch：themeCounts 聚合排序、stats 统计草稿与已确认', () => {
    const payload = loadResearch(db);
    expect(payload.themeCounts).toEqual([
      { theme: '报价结构', count: 2 },
      { theme: '新主题A', count: 1 },
    ]);
    expect(payload.stats).toEqual({ memos: 3, drafts: 2, confirmed: 1, themes: 2 });
    expect(payload.memos.map((m) => m.id)).toContain(memo1);
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
  });
});

describe('createIpcHandlers 研究台通道（main 进程同款调用序列）', () => {
  const ipcHome = mkdtempSync(join(tmpdir(), 'of-research-'));
  afterAll(() => cleanupTestVault(ipcHome));

  it('锁定态 research:load ok:false；解锁后 创建→编码→回读 全链 ok', async () => {
    const state = new AppState(join(ipcHome, 'ipc1'));
    const h = createIpcHandlers(state);

    expect(await h['research:load'](undefined)).toMatchObject({ ok: false });
    expect(await h['research:memo-create']({ type: 'quicknote', content: 'x' })).toMatchObject({ ok: false });

    expect(await h['vault:create']({ passphrase: 'passphrase-1234' })).toMatchObject({ ok: true });
    expect(await h['events:create']({ id: 'evt-r1', date: '2026-09-22', cityCode: 'KMG', locationName: '木水花市场' })).toMatchObject({ ok: true });
    expect(await h['encounters:create']({ id: 'enc-r1', eventId: 'evt-r1', participantRef: 'P01', samplingReason: '关键知情人', startedAt: Date.now() })).toMatchObject({ ok: true });

    const created = (await h['research:memo-create']({ type: 'analytical', content: '编码草稿：三档报价结构', themes: ['报价结构'] })) as {
      ok: true;
      data: { memo: { id: string; themes: string[] } };
    };
    expect(created).toMatchObject({ ok: true });
    expect(created.data.memo.themes).toEqual(['报价结构']);

    const coded = (await h['research:memo-code']({ memoId: created.data.memo.id, themes: ['报价结构', '三角验证缺口'] })) as {
      ok: true;
      data: { memo: { themes: string[] } };
    };
    expect(coded.data.memo.themes).toEqual(['报价结构', '三角验证缺口']);
    expect(await h['research:memo-code']({ memoId: 'memo-nope', themes: [] })).toMatchObject({ ok: false });

    const research = (await h['research:load'](undefined)) as { ok: true; data: { stats: { memos: number }; themeCounts: { theme: string }[] } };
    expect(research.data.stats.memos).toBe(1);
    expect(research.data.themeCounts.map((t) => t.theme)).toEqual(['报价结构', '三角验证缺口']);

    const verify = (await h['verify:run'](undefined)) as { ok: true; data: { chainOk: boolean } };
    expect(verify.data.chainOk).toBe(true);
    state.close();
  });

  it('入参非法 → ok:false（zod 拦截 daily 类型与缺字段载荷）', async () => {
    const state = new AppState(join(ipcHome, 'ipc2'));
    const h = createIpcHandlers(state);
    state.createVault('passphrase-1234');
    expect(await h['research:memo-create']({ type: 'daily', content: 'x' })).toMatchObject({ ok: false });
    expect(await h['research:memo-create']({ oops: true })).toMatchObject({ ok: false });
    state.close();
  });
});
