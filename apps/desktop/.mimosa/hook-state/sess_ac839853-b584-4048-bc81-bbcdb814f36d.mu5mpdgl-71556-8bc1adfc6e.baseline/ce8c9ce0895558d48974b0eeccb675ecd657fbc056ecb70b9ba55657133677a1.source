import { expect, test, _electron } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const here = dirname(fileURLToPath(import.meta.url));

test('功能补全：演示数据 → 建档 → 同意 → 备忘录确认 → 日志 → PIPL 清除 → 链完整', async () => {
  const home = mkdtempSync(join(tmpdir(), 'of-e2e-feat-'));
  const electronApp = await _electron.launch({
    args: [join(here, '../out/main/index.js'), `--openfield-home=${home}`],
    executablePath: electronPath as unknown as string,
  });
  const win = await electronApp.firstWindow();

  try {
    await win.fill('#pass', 'e2e-passphrase-1');
    await win.click('#btn-create');
    await expect(win.locator('#status')).toContainText('"unlocked":true');

    // 演示数据
    await win.click('#btn-mock-load');
    await expect(win.locator('#status')).toContainText('演示数据已载入');
    await expect(win.locator('#mock-status')).toContainText('已载入');

    // 受访者建档（含引荐链与同意范围）
    await win.click('#nav-register');
    await win.fill('#pt-pseudonym', 'P-901');
    await win.fill('#pt-industry', '夜市烧烤摊主');
    await win.fill('#pt-region', '云南·昆明');
    await win.fill('#pt-referral', 'P-002, P-004');
    await win.check('#pt-scope-recording');
    await win.check('#pt-scope-publication');
    await win.click('#btn-participant');
    await expect(win.locator('#status')).toContainText('受访者已建档：P-901');

    // 知情同意记录
    await win.fill('#consent-enc', 'enc-demo-001');
    await win.selectOption('#consent-type', 'publication');
    await win.fill('#consent-scope', '论文插图使用');
    await win.click('#btn-consent');
    await expect(win.locator('#status')).toContainText('同意已记录');

    // 档案库：选事件 → 访谈 → 备忘录确认入档
    await win.click('#nav-archive');
    await win.locator('#ar-events .selectlist__item').first().click();
    await win.locator('#ar-encounters .selectlist__item').first().click();
    await expect(win.locator('#ar-detail')).toBeVisible();
    await expect(win.locator('#ar-memos')).toContainText('草稿');
    await win.locator('#ar-memos button').first().click();
    await expect(win.locator('#status')).toContainText('备忘录已确认入档');

    // 田野日志一键生成
    await win.click('#btn-journal');
    await expect(win.locator('#status')).toContainText('田野日志已生成');

    // PIPL 清除：先验证令牌不一致被拒绝，再正确清除
    await win.click('#nav-overview');
    await win.fill('#purge-pseudonym', 'P-001');
    await win.fill('#purge-confirm', 'P-999');
    await win.click('#btn-purge');
    await expect(win.locator('#status')).toContainText('confirmToken 必须与 pseudonym 完全一致');
    await win.fill('#purge-confirm', 'P-001');
    await win.click('#btn-purge');
    await expect(win.locator('#status')).toContainText('清除完成：P-001');
    await expect(win.locator('#mock-status')).toContainText('访谈 4 · 采集物 4'); // P-001 的 1 条访谈与 2 份采集物已清除

    // 清除后哈希链仍完整，且留痕可见
    await win.click('#nav-verify');
    await win.click('#btn-verify');
    await expect(win.locator('#report')).toContainText('"chainOk": true');
    await expect(win.locator('#evlog')).toContainText('PURGE_SUBJECT');
  } finally {
    await electronApp.close();
    rmSync(home, { recursive: true, force: true });
  }
});
