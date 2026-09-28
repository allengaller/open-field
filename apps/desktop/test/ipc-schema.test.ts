import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IPC_CHANNELS, type IpcChannel } from '../src/shared/ipc';
import { IPC_RESPONSE_SCHEMAS } from '../src/shared/schemas';
import { listInboxItems } from '../src/main/services/repos';
import { AppState } from '../src/main/state';
import { createIpcHandlers } from '../src/main/ipc';

// IPC 响应 schema 漂移钉死：逐通道实调 handler（走演示数据与真实入库路径），
// 断言信封 ok 且 data 通过对应 zod schema。服务返回形状一变，本测试即红——
// schema 因此不可能与 handler 各自漂移。新增通道若未进覆盖集也会直接失败。
// （time:sync 依赖 NTP、backup:pick 依赖 Electron dialog，无法在 Node 单测实调，
//  其形状分别由 evidence.test 的 syncTime 注入用例与 restore E2E 覆盖。）
const LIVE_EXEMPT: readonly IpcChannel[] = ['time:sync', 'backup:pick'];

function localDate(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe('IPC 响应 schema 全通道钉死', () => {
  const root = mkdtempSync(join(tmpdir(), 'of-schema-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('逐通道实调：信封 ok 且 data 过 schema；豁免通道之外全覆盖', async () => {
    const home = join(root, 'main');
    const state = new AppState(home);
    const h = createIpcHandlers(state);
    const covered = new Set<IpcChannel>();

    const expectOk = async (channel: IpcChannel, payload?: unknown): Promise<unknown> => {
      covered.add(channel);
      const res = await h[channel](payload);
      if (!res.ok) throw new Error(`${channel} 信封错误：${res.error}`);
      try {
        IPC_RESPONSE_SCHEMAS[channel].parse(res.data);
      } catch (err) {
        throw new Error(`${channel} schema 不匹配：${String(err)}`);
      }
      return res.data;
    };

    // 锁定态 → 建库 → 演示数据
    await expectOk('vault:status');
    await expectOk('vault:create', { passphrase: 'passphrase-1234' });
    await expectOk('mock:load');
    await expectOk('mock:status');

    // 登记 / 建档 / 同意（新 id 避免与演示数据冲突）
    await expectOk('events:create', { id: 'evt-schema', date: localDate(), cityCode: 'HZS', locationName: 'Schema 测试事件' });
    await expectOk('encounters:create', { id: 'enc-schema', eventId: 'evt-schema', participantRef: 'P-777', samplingReason: '钉死测试', startedAt: Date.now() });
    await expectOk('participants:upsert', { pseudonym: 'P-777', industry: '测试' });
    await expectOk('participants:set-real-name', { pseudonym: 'P-777', realName: '测试真名' });
    const consent = (await expectOk('consents:record', { encounterId: 'enc-schema', templateType: 'recording', scope: '仅测试' })) as { id: string };
    await expectOk('consents:withdraw', { consentId: consent.id });

    // 档案 / 链 / 校验 / 引用（幂等路径）
    await expectOk('archive:events');
    await expectOk('archive:encounters', { eventId: 'evt-demo-kmg-mushuihua' });
    await expectOk('archive:artifacts', { encounterId: 'enc-demo-001' });
    await expectOk('archive:detail', { encounterId: 'enc-demo-001' });
    await expectOk('evidence:list');
    await expectOk('verify:run');
    await expectOk('citation:make', { artifactId: 'art-demo-note-001' }); // A15：重复引用幂等返回

    // 日志 / 研究台
    await expectOk('journals:build', { date: localDate() });
    await expectOk('memos:confirm', { memoId: `journal-${localDate()}` });
    await expectOk('research:load');
    const memo = (await expectOk('research:memo-create', { type: 'quicknote', content: 'schema 钉死测试备忘' })) as { memo: { id: string } };
    await expectOk('research:memo-code', { memoId: memo.memo.id, themes: ['SchemaTest'] });

    // 收件箱（演示数据带 2 条 pending）
    await expectOk('inbox:list', {});
    const pending = listInboxItems(state.getDb(), 'pending').filter((i) => i.sourcePath.includes('demo-inbox-'));
    expect(pending.length).toBe(2);
    await expectOk('inbox:confirm', { itemId: pending[0]!.id, encounterId: 'enc-schema' });
    await expectOk('inbox:reject', { itemId: pending[1]!.id });
    await expectOk('inbox:scan');

    // 备份 / PIPL / 演示清除
    const backup = (await expectOk('backup:export', { passphrase: 'schema-pass-123' })) as { outPath: string };
    await expectOk('purge:subject', { pseudonym: 'P-005', confirmToken: 'P-005' });
    await expectOk('mock:clear');

    // 锁定态：关库 → 开库 → 状态；恢复走第二个空家目录
    state.close();
    await expectOk('vault:open', { passphrase: 'passphrase-1234' });
    await expectOk('vault:status');

    const fresh = new AppState(join(root, 'fresh'));
    const res = await createIpcHandlers(fresh)['backup:restore']({
      backupPath: backup.outPath,
      backupPassphrase: 'schema-pass-123',
      vaultPassphrase: 'passphrase-1234',
    });
    if (!res.ok) throw new Error(`backup:restore 信封错误：${res.error}`);
    IPC_RESPONSE_SCHEMAS['backup:restore'].parse(res.data);
    covered.add('backup:restore');
    fresh.close();

    // 覆盖完整性：豁免之外每个通道都被实调过
    const missed = IPC_CHANNELS.filter((c) => !covered.has(c) && !LIVE_EXEMPT.includes(c));
    expect(missed).toEqual([]);
    state.close();
  });
});
