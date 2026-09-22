import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, _electron } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const appBinary = join(here, '../release/mac-arm64/OpenField.app/Contents/MacOS/OpenField');

test('打包产物冒烟：窗口出现且能建库（native ABI 闸门）', async () => {
  test.skip(!existsSync(appBinary), '未找到打包产物：先运行 pnpm dist:dir');

  const home = mkdtempSync(join(tmpdir(), 'of-packaged-'));
  const electronApp = await _electron.launch({
    executablePath: appBinary,
    args: [`--openfield-home=${home}`],
  });
  const win = await electronApp.firstWindow();

  try {
    await win.fill('#pass', 'e2e-passphrase-1');
    await win.click('#btn-create');
    await expect(win.locator('#status')).toContainText('"unlocked":true');
  } finally {
    await electronApp.close();
    rmSync(home, { recursive: true, force: true });
  }
});
