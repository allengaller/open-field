import { expect, test, _electron } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const here = dirname(fileURLToPath(import.meta.url));

test('研究台融合：主题编码 → 备忘录入链 → 事件链时间轴 → 档案联动 → 链完整', async () => {
  const home = mkdtempSync(join(tmpdir(), 'of-e2e-research-'));
  const electronApp = await _electron.launch({
    args: [join(here, '../out/main/index.js'), `--openfield-home=${home}`],
    executablePath: electronPath as unknown as string,
  });
  const win = await electronApp.firstWindow();

  try {
    await win.fill('#pass', 'e2e-passphrase-1');
    await win.click('#btn-create');
    await expect(win.locator('#status')).toContainText('"unlocked":true');

    // 演示数据自带两条带主题编码的备忘录
    await win.click('#btn-mock-load');
    await expect(win.locator('#status')).toContainText('演示数据已载入');

    await win.click('#nav-research');
    await expect(win.locator('#card-coding .methodcard')).toBeVisible(); // 报道档案深读方法卡片嵌入编码台
    await expect(win.locator('#rs-theme-chips .chip', { hasText: '报价结构' })).toContainText('×1');

    // 报道档案深读五字段模板一键填入
    await win.click('#btn-coding-template');
    await expect(win.locator('#rs-memo-content')).toHaveValue(/【结构化编码 · 报道档案深读】/);
    await expect(win.locator('#rs-memo-content')).toHaveValue(/回应：/);

    // 创建分析备忘录：关联采集物 + 双主题（占地叙事为新孤证主题）
    await win.selectOption('#rs-memo-type', 'analytical');
    await win.fill('#rs-memo-themes', '占地叙事, 报价结构');
    await win.fill('#rs-memo-artifacts', 'art-demo-note-001');
    await win.fill(
      '#rs-memo-content',
      '【结构化编码 · 报道档案深读】\n时间：2026-09\n地点：昆明木水花市场\n主体：摊贩与中间商\n行动：口头议价与占地续约\n回应：未见书面契约，需第二轮田野复核。',
    );
    await win.click('#btn-memo-create');
    await expect(win.locator('#status')).toContainText('备忘录已创建并入链：memo-');

    // 主题计数联动：报价结构 ×2，孤证主题占地叙事 ×1
    await expect(win.locator('#rs-theme-chips .chip', { hasText: '报价结构' })).toContainText('×2');
    await expect(win.locator('#rs-theme-chips .chip', { hasText: '占地叙事' })).toContainText('×1');

    // 点击主题筛选：孤证主题只剩新建的 1 条；再点取消筛选恢复全量
    await win.locator('#rs-theme-chips .chip', { hasText: '占地叙事' }).click();
    await expect(win.locator('#rs-memos .memo')).toHaveCount(1);
    await win.locator('#rs-theme-chips .chip', { hasText: '占地叙事' }).click();
    // 演示数据共 6 条：2 条主题备忘录 + 3 条田野日志（无主题，不受筛选影响）+ 1 条新建
    await expect(win.locator('#rs-memos .memo')).toHaveCount(6);

    // 编码入链：给演示反身性备忘录追加主题
    const reflexive = win.locator('#rs-memos .memo', { hasText: '反身性备忘' });
    await reflexive.getByRole('button', { name: '编码', exact: true }).click();
    await reflexive.locator('.memo__code input').fill('反身性, 提问框架, 中间商叙事');
    await reflexive.getByRole('button', { name: '保存编码' }).click();
    await expect(win.locator('#status')).toContainText('编码已保存并入链');
    await expect(win.locator('#rs-theme-chips .chip', { hasText: '中间商叙事' })).toContainText('×1');

    // 确认入档：演示分析备忘录
    const analytical = win.locator('#rs-memos .memo', { hasText: '报价的三档结构' });
    await analytical.getByRole('button', { name: '确认入档' }).click();
    await expect(win.locator('#status')).toContainText('备忘录已确认入档');

    // 事件链时间轴：备忘录按 ID 成行、确认态可见，新备忘录内容截断入轴
    const analyticalRow = win.locator('#rs-timeline li.timeline', { hasText: 'memo-demo-analytical-001' });
    await expect(analyticalRow).toContainText('已确认');
    await expect(win.locator('#rs-timeline')).toContainText('需第二轮田野复核');

    // 时间轴点回档案库：备忘录行经关联采集物反查访谈，直接展开对应访谈详情
    await analyticalRow.click();
    await expect(win.locator('#ar-detail')).toBeVisible();
    await expect(win.locator('#ar-memos')).toContainText('报价的三档结构');
    await expect(win.locator('#ar-memos')).toContainText('需第二轮田野复核');

    // 撰写与编码均留痕：链完整
    await win.click('#nav-verify');
    await win.click('#btn-verify');
    await expect(win.locator('#report')).toContainText('"chainOk": true');
    await expect(win.locator('#evlog')).toContainText('CREATE_MEMO');
    await expect(win.locator('#evlog')).toContainText('MEMO_CODE');
  } finally {
    await electronApp.close();
    rmSync(home, { recursive: true, force: true });
  }
});
