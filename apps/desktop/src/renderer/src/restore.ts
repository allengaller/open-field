export interface RestoreForm {
  backupPath: string;
  backupPassphrase: string;
  vaultPassphrase: string;
  vaultPassphrase2: string;
}

export function validateRestoreForm(f: RestoreForm): string | null {
  if (!f.backupPath) return '未选择备份文件';
  if (f.backupPassphrase.length < 8) return '备份口令至少 8 个字符';
  if (f.vaultPassphrase.length < 8) return '资料库口令至少 8 个字符';
  if (f.vaultPassphrase !== f.vaultPassphrase2) return '两次输入的资料库口令不一致';
  return null;
}

/* 服务层原始错误 → 用户文案（规格 §6 映射表，集中于此）。
   备份口令错误在 AES-256-GCM 层表现为 authenticate 失败，与「容器损坏」可区分；
   资料库口令（原口令确认）错误由 SQLCipher 打开失败报出。 */
export function restoreErrorText(raw: string): string {
  if (raw.includes('拒绝覆盖')) return '当前位置已存在资料库：恢复会替换整个资料库，请先迁移或删除旧库再试';
  if (raw.includes('口令错误或文件已损坏')) return '资料库口令不正确：备份内的资料库仍以原口令加密';
  if (raw.includes('不是 OpenField 备份文件') || raw.includes('缺少 vault.db') || raw.includes('KDF 参数')) {
    return '备份文件无法读取：可能已损坏';
  }
  if (/authenticat|Unsupported state/i.test(raw)) return '备份口令不正确';
  return raw;
}
