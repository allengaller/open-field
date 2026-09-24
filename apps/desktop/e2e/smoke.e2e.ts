import { expect, test, _electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// electron 包在 Node 环境下 default export 即可执行文件路径；类型层面按 string 用
import electronPath from 'electron';

const here = dirname(fileURLToPath(import.meta.url)); // A17：包为 type:module，Playwright 按 ESM 加载，无 __dirname

test('P1 冒烟：建库 → 登记 → 扫描 → 确认 → 校验 → 引用', async () => {
  const home = mkdtempSync(join(tmpdir(), 'of-e2e-'));
  const electronApp = await _electron.launch({
    args: [join(here, '../out/main/index.js'), `--openfield-home=${home}`],
    executablePath: electronPath as unknown as string,
  });
  const win = await electronApp.firstWindow();

  try {
    await win.fill('#pass', 'e2e-passphrase-1');
    await win.click('#btn-create');
    await expect(win.locator('#status')).toContainText('"unlocked":true');

    await win.click('#nav-register');
    await win.fill('#ev-id', 'evt-1');
    await win.fill('#ev-date', '2026-09-11');
    await win.fill('#ev-city', 'KMG');
    await win.fill('#ev-loc', '昆明篆新市场');
    await win.click('#btn-event');
    await expect(win.locator('#status')).toContainText('事件已登记'); // A19：登记分支正向断言

    await win.fill('#enc-id', 'enc-1');
    await win.fill('#enc-event', 'evt-1');
    await win.fill('#enc-participant', 'P01');
    await win.fill('#enc-reason', '目的性抽样');
    await win.click('#btn-encounter');
    await expect(win.locator('#status')).toContainText('访谈已登记');

    // 引用门禁：录音材料无有效知情同意不可引用，先记录同意书
    await win.fill('#consent-enc', 'enc-1');
    await win.selectOption('#consent-type', 'recording');
    await win.fill('#consent-scope', '学术研究');
    await win.click('#btn-consent');
    await expect(win.locator('#status')).toContainText('同意已记录');

    mkdirSync(join(home, 'inbox'), { recursive: true });
    writeFileSync(join(home, 'inbox', 'interview.wav'), Buffer.from('e2e-fixture-bytes-000000'));

    await win.click('#nav-inbox');
    await win.click('#btn-scan');
    // 收件箱 watcher 可能抢在手动扫描前入库（此时 scan 统计为 pending:0），故以待确认列表为准
    await expect(win.locator('#pending')).toContainText('interview.wav');
    await win.fill('#confirm-enc', 'enc-1');
    await win.click('#pending button');
    await expect(win.locator('#pending')).not.toContainText('interview.wav');

    await win.click('#nav-verify');
    await win.click('#btn-verify');
    await expect(win.locator('#report')).toContainText('"chainOk": true');
    await expect(win.locator('#report')).toContainText('"issues": []');

    await expect(win.locator('#cite-art')).not.toHaveValue('');
    await win.click('#btn-cite');
    await expect(win.locator('#cite-out')).toHaveText(/^OF-\d{8}-KMG-\d{3}#T\d{2}:\d{2}$/);
  } finally {
    await electronApp.close();
    rmSync(home, { recursive: true, force: true });
  }
});
