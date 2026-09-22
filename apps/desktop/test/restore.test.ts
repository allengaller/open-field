import { describe, expect, it } from 'vitest';
import { restoreErrorText, validateRestoreForm } from '../src/renderer/src/restore';

describe('validateRestoreForm', () => {
  const base = {
    backupPath: '/tmp/backup-2026.ofbackup',
    backupPassphrase: 'backup-pass-1',
    vaultPassphrase: 'vault-pass-1',
    vaultPassphrase2: 'vault-pass-1',
  };

  it('合法表单返回 null', () => {
    expect(validateRestoreForm(base)).toBeNull();
  });

  it('未选择备份文件', () => {
    expect(validateRestoreForm({ ...base, backupPath: '' })).toContain('未选择');
  });

  it('备份口令过短', () => {
    expect(validateRestoreForm({ ...base, backupPassphrase: 'short' })).toContain('备份口令');
  });

  it('新库口令过短', () => {
    expect(validateRestoreForm({ ...base, vaultPassphrase: 'short' })).toContain('新库口令');
  });

  it('两次新库口令不一致', () => {
    expect(validateRestoreForm({ ...base, vaultPassphrase2: 'different-pass' })).toContain('不一致');
  });
});

describe('restoreErrorText', () => {
  it('目标已有资料库', () => {
    expect(restoreErrorText('目标目录已存在资料库，拒绝覆盖：/x/vault.db')).toContain('已存在资料库');
  });

  it('容器不是备份文件', () => {
    expect(restoreErrorText('不是 OpenField 备份文件')).toContain('损坏');
  });

  it('包内缺库', () => {
    expect(restoreErrorText('备份包内缺少 vault.db，文件不完整或损坏')).toContain('损坏');
  });

  it('KDF 参数异常归为损坏', () => {
    expect(restoreErrorText('备份容器的 KDF 参数超出合理范围（N=1, r=8, p=1）')).toContain('损坏');
  });

  it('GCM 认证失败归为口令不正确', () => {
    expect(restoreErrorText('Unsupported state or unable to authenticate data')).toContain('备份口令不正确');
  });

  it('未知错误透传', () => {
    expect(restoreErrorText('disk full')).toBe('disk full');
  });
});
