import { expect, test, _electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// electron 包在 Node 环境下 default export 即可执行文件路径；类型层面按 string 用
import electronPath from 'electron';

const here = dirname(fileURLToPath(import.meta.url));

async function launch(home: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await _electron.launch({
    args: [join(here, '../out/main/index.js'), `--openfield-home=${home}`],
    executablePath: electronPath as unknown as string,
  });
  return { app, win: await app.firstWindow() };
}

test('P1 恢复闭环：建库→备份→换家恢复→原口令解锁→校验零问题', async () => {
  const homeA = mkdtempSync(join(tmpdir(), 'of-restore-a-'));
  const homeB = mkdtempSync(join(tmpdir(), 'of-restore-b-'));
  try {
    // 家 A：建库 → 登记 → 导出备份
    const a = await launch(homeA);
    await a.win.fill('#pass', 'e2e-passphrase-1');
    await a.win.click('#btn-create');
    await expect(a.win.locator('#status')).toContainText('"unlocked":true');

    await a.win.click('#nav-register');
    await a.win.fill('#ev-id', 'evt-1');
    await a.win.fill('#ev-date', '2026-09-22');
    await a.win.fill('#ev-city', 'KMG');
    await a.win.fill('#ev-loc', '昆明篆新市场');
    await a.win.click('#btn-event');
    await expect(a.win.locator('#status')).toContainText('事件已登记');

    await a.win.click('#nav-overview');
    await a.win.click('#btn-backup');
    await expect(a.win.locator('#status')).toContainText('备份已导出');
    const backupName = readdirSync(join(homeA, 'backups'))[0];
    if (!backupName) throw new Error('备份导出后 backups 目录为空');
    const backupFile = join(homeA, 'backups', backupName);
    await a.app.close();

    // 家 B：无库锁定态 → 恢复。原生对话框无法自动化：main 进程内打桩 showOpenDialog
    const b = await launch(homeB);
    await b.app.evaluate(({ dialog }, file) => {
      (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, backupFile);

    await b.win.click('#btn-restore');
    await expect(b.win.locator('#restore-fields')).toBeVisible();
    await expect(b.win.locator('#restore-file')).toHaveValue(backupFile);

    // 负例：两次资料库口令不一致被前端拦截，不发 IPC（A29：vaultPassphrase 是原口令确认）
    await b.win.fill('#restore-backup-pass', 'e2e-passphrase-1');
    await b.win.fill('#restore-vault-pass', 'e2e-passphrase-1');
    await b.win.fill('#restore-vault-pass2', 'e2e-passphrase-typo');
    await b.win.click('#btn-restore-run');
    await expect(b.win.locator('#status')).toContainText('两次输入的资料库口令不一致');

    // 正例：恢复成功（原口令确认）→ 原口令解锁 → 数据与链完整
    await b.win.fill('#restore-vault-pass2', 'e2e-passphrase-1');
    await b.win.click('#btn-restore-run');
    await expect(b.win.locator('#status')).toContainText('已从备份恢复');
    await expect(b.win.locator('#restore-fields')).toBeHidden();

    await b.win.fill('#pass', 'e2e-passphrase-1');
    await b.win.click('#btn-open');
    await expect(b.win.locator('#status')).toContainText('"unlocked":true');
    await expect(b.win.locator('#stat-events')).toHaveText('1');

    await b.win.click('#nav-verify');
    await b.win.click('#btn-verify');
    await expect(b.win.locator('#report')).toContainText('"chainOk": true');
    await expect(b.win.locator('#report')).toContainText('"issues": []');

    await b.app.close();
  } finally {
    rmSync(homeA, { recursive: true, force: true });
    rmSync(homeB, { recursive: true, force: true });
  }
});
