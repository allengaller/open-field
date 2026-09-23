import { expect, test, _electron } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const here = dirname(fileURLToPath(import.meta.url));

/* 方法论视图与场景卡片是纯静态内容（无 IPC），锁定态必须完整可用 */
test('方法论：锁定态章节树/搜索/徽章 + 登记页场景卡跳转', async () => {
  const home = mkdtempSync(join(tmpdir(), 'of-e2e-know-'));
  const electronApp = await _electron.launch({
    args: [join(here, '../out/main/index.js'), `--openfield-home=${home}`],
    executablePath: electronPath as unknown as string,
  });
  const win = await electronApp.firstWindow();

  try {
    // 锁定态：状态芯片保持 LOCKED
    await expect(win.locator('#sb-state')).toHaveText('LOCKED');

    // 登记页场景卡片（访谈 / 知情同意）
    await win.click('#nav-register');
    await expect(win.locator('#card-interview .methodcard')).toBeVisible();
    await expect(win.locator('#card-consent .methodcard')).toBeVisible();

    // 方法论视图：章节树渲染（锁定态可用）
    await win.click('#nav-knowledge');
    await expect(win.locator('#knowledge-chapters .selectlist__item').first()).toBeVisible();
    await expect(win.locator('#knowledge-collection')).toBeVisible();

    // 搜索过滤后打开章节，证据分级徽章出现在正文
    await win.fill('#knowledge-search', '访谈');
    await win.locator('#knowledge-chapters .selectlist__item', { hasText: '访谈' }).first().click();
    await expect(win.locator('.knowledge__article')).toBeVisible();
    await expect(win.locator('.knowledge__article .ev').first()).toBeVisible();
    await expect(win.locator('#knowledge-chapters .selectlist__item.is-selected')).toBeVisible();

    // 学习路径与术语表快捷入口（纯静态数据，锁定态可用）
    await expect(win.locator('#knowledge-paths .pathchip').first()).toBeVisible();

    // 正文级全文检索：「滚雪球」不出现在任何章节标题，只命中正文
    await win.fill('#knowledge-search', '滚雪球');
    await expect(win.locator('#knowledge-chapters .knowledge__treediv')).toContainText('正文命中');
    await win.locator('#knowledge-chapters .knowledge__hit').first().click();
    await expect(win.locator('.knowledge__article')).toContainText('滚雪球');
    await expect(win.locator('#knowledge-pager button').first()).toBeVisible();

    // 清空搜索恢复全列表
    await win.fill('#knowledge-search', '');
    await expect(win.locator('#knowledge-chapters .selectlist__item')).not.toHaveCount(0);

    // 场景卡「查看完整章节」→ 跳转方法论视图并定位章节
    await win.click('#nav-register');
    await win.locator('#card-interview .methodcard__foot button').click();
    await expect(win.locator('#view-knowledge')).toHaveClass(/is-active/);
    await expect(win.locator('#knowledge-content')).toContainText('访谈');
  } finally {
    await electronApp.close();
    rmSync(home, { recursive: true, force: true });
  }
});

/* 档案库备忘录栏的场景卡片：需解锁 + 演示数据 + 选中访谈后才出现 */
test('方法论：档案库备忘录场景卡随访谈详情出现', async () => {
  const home = mkdtempSync(join(tmpdir(), 'of-e2e-know2-'));
  const electronApp = await _electron.launch({
    args: [join(here, '../out/main/index.js'), `--openfield-home=${home}`],
    executablePath: electronPath as unknown as string,
  });
  const win = await electronApp.firstWindow();

  try {
    await win.fill('#pass', 'e2e-passphrase-1');
    await win.click('#btn-create');
    await expect(win.locator('#status')).toContainText('"unlocked":true');

    await win.click('#btn-mock-load');
    await expect(win.locator('#status')).toContainText('演示数据已载入');

    await win.click('#nav-archive');
    await win.locator('#ar-events .selectlist__item', { hasText: 'evt-demo-kmg-mushuihua' }).click();
    await win.locator('#ar-encounters .selectlist__item', { hasText: 'enc-demo-002' }).click();
    await expect(win.locator('#ar-detail')).toBeVisible();
    await expect(win.locator('#card-memo .methodcard')).toBeVisible();
  } finally {
    await electronApp.close();
    rmSync(home, { recursive: true, force: true });
  }
});
