/* Vault 视图：解锁/创建/记住口令/状态/备份/恢复 + 设备代号与自动锁定设置。 */
import type { AppSettings, VaultStatus } from '../../../shared/types';
import { invoke, invokeQuiet } from '../ipc';
import { restoreErrorText, validateRestoreForm } from '../restore';
import { button, input, setReadout, tickNumber, toast, withLoading, $ } from '../ui';
import { refreshPending } from './inbox';

export function applyStatus(s: VaultStatus): void {
  tickNumber($('stat-events'), s.events);
  tickNumber($('stat-encounters'), s.encounters);
  tickNumber($('stat-inbox'), s.pendingInbox);
  const dot = $('vault-dot');
  dot.classList.toggle('is-unlocked', s.unlocked);
  dot.classList.toggle('is-locked', !s.unlocked);
  const stateText = s.unlocked ? 'UNLOCKED' : 'LOCKED';
  $('vault-chip-text').textContent = stateText;
  $('sb-state').textContent = stateText;
  $('sb-home').textContent = s.home;
  button('btn-restore').hidden = s.unlocked;
  if (s.unlocked) {
    $('restore-fields').hidden = true;
    button('btn-restore-run').hidden = true;
  }
}

export async function refreshStatus(): Promise<VaultStatus> {
  const s = await invoke<VaultStatus>('vault:status');
  applyStatus(s);
  return s;
}

function readoutStatus(s: VaultStatus): void {
  setReadout(JSON.stringify(s));
  applyStatus(s);
}

function unlockedFollowup(): void {
  void refreshPending();
  void loadSettings();
}

button('btn-create').addEventListener('click', () =>
  withLoading(button('btn-create'), async () => {
    readoutStatus(await invoke<VaultStatus>('vault:create', {
      passphrase: input('pass').value,
      remember: (input('remember-key') as HTMLInputElement).checked,
    }));
    unlockedFollowup();
  }),
);

button('btn-open').addEventListener('click', () =>
  withLoading(button('btn-open'), async () => {
    readoutStatus(await invoke<VaultStatus>('vault:open', {
      passphrase: input('pass').value,
      remember: (input('remember-key') as HTMLInputElement).checked,
    }));
    unlockedFollowup();
  }),
);

button('btn-unlock-saved').addEventListener('click', () =>
  withLoading(button('btn-unlock-saved'), async () => {
    readoutStatus(await invoke<VaultStatus>('vault:unlock-saved'));
    unlockedFollowup();
  }),
);

button('btn-forget-saved').addEventListener('click', () =>
  withLoading(button('btn-forget-saved'), async () => {
    await invoke('vault:forget-saved');
    setReadout('已清除记住的口令', 'is-ok');
  }),
);

button('btn-status').addEventListener('click', () =>
  withLoading(button('btn-status'), async () => {
    readoutStatus(await invoke<VaultStatus>('vault:status'));
  }),
);

button('btn-backup').addEventListener('click', () =>
  withLoading(button('btn-backup'), async () => {
    const { outPath } = await invoke<{ outPath: string }>('backup:export', {
      passphrase: input('pass').value,
    });
    setReadout(`备份已导出：${outPath}`, 'is-ok');
  }),
);

/* ── 备份恢复 ── */

let restorePath: string | null = null;

button('btn-restore').addEventListener('click', () =>
  withLoading(button('btn-restore'), async () => {
    const { path } = await invoke<{ path: string | null }>('backup:pick');
    restorePath = path;
    $('restore-fields').hidden = path === null;
    button('btn-restore-run').hidden = path === null;
    input('restore-file').value = path ?? '';
  }),
);

button('btn-restore-run').addEventListener('click', () =>
  withLoading(button('btn-restore-run'), async () => {
    const backupPassphrase = input('restore-backup-pass').value;
    const vaultPassphrase = input('restore-vault-pass').value;
    const problem = validateRestoreForm({
      backupPath: restorePath ?? '',
      backupPassphrase,
      vaultPassphrase,
      vaultPassphrase2: input('restore-vault-pass2').value,
    });
    if (problem) {
      setReadout(`错误：${problem}`, 'is-error');
      toast(problem);
      return;
    }
    // 不走 invoke()：restoreErrorText 要在通用错误面之前替换文案
    const res = (await window.openfield.invoke('backup:restore', {
      backupPath: restorePath,
      backupPassphrase,
      vaultPassphrase,
    })) as { ok: true; data: unknown } | { ok: false; error: string };
    if (!res.ok) {
      const text = restoreErrorText(res.error);
      setReadout(`错误：${text}`, 'is-error');
      toast(text);
      return;
    }
    setReadout('已从备份恢复：请用资料库口令解锁', 'is-ok');
    $('restore-fields').hidden = true;
    button('btn-restore-run').hidden = true;
    await refreshStatus();
  }),
);

/* ── A34 设置：设备代号 / 自动锁定 ── */

export async function loadSettings(): Promise<void> {
  const s = await invokeQuiet<AppSettings>('settings:get');
  if (s === null) return;
  input('set-alias').value = s.deviceAlias ?? '';
  input('set-autolock').value = String(s.autoLockMinutes);
}

button('btn-settings-save').addEventListener('click', () =>
  withLoading(button('btn-settings-save'), async () => {
    const alias = input('set-alias').value; // 空串 = 清除代号（回落主机名）
    const minutesRaw = input('set-autolock').value.trim();
    if (minutesRaw !== '' && !/^\d+$/.test(minutesRaw)) {
      setReadout('错误：自动锁定分钟数须为非负整数（0 = 关闭）', 'is-error');
      return;
    }
    const saved = await invoke<AppSettings>('settings:set', {
      deviceAlias: alias,
      ...(minutesRaw !== '' ? { autoLockMinutes: Number.parseInt(minutesRaw, 10) } : {}),
    });
    setReadout(`设置已保存：设备代号 ${saved.deviceAlias ?? '（未设，使用主机名）'} · 自动锁定 ${saved.autoLockMinutes === 0 ? '关闭' : `${saved.autoLockMinutes} 分钟`}`, 'is-ok');
  }),
);
