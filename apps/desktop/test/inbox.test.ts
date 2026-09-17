import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeBundle, encodeBundle, verifyChain, type Bundle } from '@openfield/core';
import { cleanupTestVault, makeTestVault } from './helpers';
import { listEvidenceEntries } from '../src/main/services/evidence';
import { insertFieldEvent, listInboxItems } from '../src/main/services/repos';
import { applyBundle, scanOnce } from '../src/main/services/inbox';

const { db, paths, home } = makeTestVault();
afterAll(() => cleanupTestVault(home));

function localDateStr(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function writeInbox(name: string, content: string | Buffer): string {
  const p = join(paths.inboxDir, name);
  writeFileSync(p, content);
  return p;
}

describe('scanOnce', () => {
  it('普通文件 → pending 且带同日事件建议；.icloud 与 0 字节跳过', async () => {
    insertFieldEvent(db, { id: 'evt-scan', date: localDateStr(Date.now()), cityCode: 'KMG', locationName: '昆明' }); // A9：事件日期须等于文件 mtime 的本地日期
    const wav = writeInbox('rec.wav', Buffer.from('E'.repeat(64)));
    writeInbox('.rec2.wav.icloud', Buffer.from('rec2.wav\u0000'));
    writeInbox('empty.png', Buffer.alloc(0));

    const summary = await scanOnce(db, { inboxDir: paths.inboxDir, quarantineDir: paths.quarantineDir });
    expect(summary.pending).toBe(1);
    expect(summary.skippedIcloud).toBe(1);
    expect(summary.skippedEmpty).toBe(1);

    const items = listInboxItems(db, 'pending');
    expect(items.length).toBe(1);
    expect(items[0]?.sourcePath).toBe(wav);
    expect(items[0]?.suggestedEventId).toBe('evt-scan'); // mtime 同日
  });

  it('同一文件重复扫描不产生第二条 pending', async () => {
    await scanOnce(db, { inboxDir: paths.inboxDir, quarantineDir: paths.quarantineDir });
    const n = listInboxItems(db, 'pending').length;
    await scanOnce(db, { inboxDir: paths.inboxDir, quarantineDir: paths.quarantineDir });
    expect(listInboxItems(db, 'pending').length).toBe(n);
  });

  it('合法 bundle → 实体入库 + mediaRefs 变 pending + bundle 记 ingested', async () => {
    const bundle: Bundle = {
      schemaVersion: 1,
      id: 'bundle-1',
      deviceId: 'iphone-01',
      createdAt: 1757376400000,
      events: [{ id: 'evt-m1', date: '2026-09-09', cityCode: 'KMG', locationName: '木水花市场' }],
      encounters: [],
      participants: [{ pseudonym: 'P09', industry: '菌子贩' }],
      consents: [],
      memos: [],
      mediaRefs: [{ filename: 'live.m4a', sha256: 'a'.repeat(64), bytes: 1024, mime: 'audio/mp4', type: 'audio', capturedAt: 1757376400000 }],
    };
    const p = writeInbox('session.ofbundle.json', encodeBundle(bundle));
    const summary = await scanOnce(db, { inboxDir: paths.inboxDir, quarantineDir: paths.quarantineDir });
    expect(summary.appliedBundles).toBe(1);
    const entries = listEvidenceEntries(db);
    expect(entries.filter((x) => x.actor === 'bundle:bundle-1').map((x) => x.action)).toEqual(['CREATE_EVENT', 'CREATE_PARTICIPANT']); // A4
    expect(verifyChain(entries).ok).toBe(true);
    const items = listInboxItems(db);
    expect(items.find((i) => i.sourcePath === p)?.status).toBe('ingested');
    const media = items.find((i) => i.sourcePath === 'bundle:bundle-1:live.m4a');
    expect(media?.status).toBe('pending');
    expect(media?.sha256).toBe('a'.repeat(64));
  });

  it('畸形 bundle → 移入隔离区并记 quarantined', async () => {
    writeInbox('broken.ofbundle.json', '{"schemaVersion": 1, "oops": true}');
    const summary = await scanOnce(db, { inboxDir: paths.inboxDir, quarantineDir: paths.quarantineDir });
    expect(summary.quarantined).toBe(1);
    const items = listInboxItems(db, 'quarantined');
    expect(items.length).toBe(1);
    expect(items[0]?.sourcePath.startsWith(paths.quarantineDir)).toBe(true);
  });
});

describe('applyBundle', () => {
  it('重复应用同一 bundle 幂等（id 去重，链长不变，A4）', () => {
    const bundle: Bundle = decodeBundle(encodeBundle({
      schemaVersion: 1,
      id: 'bundle-2',
      deviceId: 'iphone-01',
      createdAt: 1757376500000,
      events: [{ id: 'evt-m2', date: '2026-09-10', cityCode: 'KMG', locationName: '双龙商场' }],
      encounters: [],
      participants: [],
      consents: [],
      memos: [],
      mediaRefs: [],
    }));
    const chainLen = listEvidenceEntries(db).length;
    applyBundle(db, bundle);
    expect(listEvidenceEntries(db).length).toBe(chainLen + 1); // 首次：1 条 CREATE_EVENT
    expect(() => applyBundle(db, bundle)).not.toThrow();
    expect(listEvidenceEntries(db).length).toBe(chainLen + 1); // 重复应用不入新链目
  });

  it('重复应用含 mediaRefs 的 bundle 不产生重复 pending 项（A10）', () => {
    const bundle: Bundle = decodeBundle(encodeBundle({
      schemaVersion: 1,
      id: 'bundle-3',
      deviceId: 'iphone-01',
      createdAt: 1757376600000,
      events: [],
      encounters: [],
      participants: [],
      consents: [],
      memos: [],
      mediaRefs: [{ filename: 'clip.m4a', sha256: 'b'.repeat(64), bytes: 2048, mime: 'audio/mp4', type: 'audio', capturedAt: 1757376600000 }],
    }));
    applyBundle(db, bundle);
    const count = (): number => listInboxItems(db, 'pending').filter((i) => i.sourcePath === 'bundle:bundle-3:clip.m4a').length;
    expect(count()).toBe(1);
    applyBundle(db, bundle);
    expect(count()).toBe(1);
  });

  it('同一 bundle 内重复 filename 只落一条 pending（循环内同步去重）', () => {
    const mediaRef = { filename: 'dup.m4a', sha256: 'c'.repeat(64), bytes: 100, mime: 'audio/mp4', type: 'audio' as const, capturedAt: 1757376700000 };
    const bundle: Bundle = decodeBundle(encodeBundle({
      schemaVersion: 1,
      id: 'bundle-4',
      deviceId: 'iphone-01',
      createdAt: 1757376700000,
      events: [],
      encounters: [],
      participants: [],
      consents: [],
      memos: [],
      mediaRefs: [mediaRef, { ...mediaRef }],
    }));
    applyBundle(db, bundle);
    expect(listInboxItems(db, 'pending').filter((i) => i.sourcePath === 'bundle:bundle-4:dup.m4a').length).toBe(1);
  });
});
