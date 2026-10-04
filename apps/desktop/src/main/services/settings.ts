import type Database from 'better-sqlite3-multiple-ciphers';
import { Actor } from '@openfield/core';

// A34 应用级设置（app_settings 表，v4 迁移）。设备代号替代 hostname() 进入
// 证据链 actor 与采集物 deviceId：主机名常含用户真名（如 allens-macbook），
// 属于不应入链的隐私；代号为用户自设的链安全字符串。

export const DEFAULT_AUTO_LOCK_MINUTES = 15;
const MAX_AUTO_LOCK_MINUTES = 24 * 60;

export interface AppSettings {
  deviceAlias: string | null;
  autoLockMinutes: number;
}

function readSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value?: unknown } | undefined;
  return typeof row?.value === 'string' ? row.value : null;
}

export function getSettings(db: Database.Database): AppSettings {
  // 读路径不抛错：历史脏值回退默认，设置损坏不挡解锁
  const rawAlias = readSetting(db, 'device_alias');
  const alias = rawAlias !== null && Actor.safeParse(rawAlias).success ? rawAlias : null;
  const rawLock = Number.parseInt(readSetting(db, 'auto_lock_minutes') ?? '', 10);
  const autoLockMinutes =
    Number.isInteger(rawLock) && rawLock >= 0 && rawLock <= MAX_AUTO_LOCK_MINUTES ? rawLock : DEFAULT_AUTO_LOCK_MINUTES;
  return { deviceAlias: alias, autoLockMinutes };
}

/** 空串表示清除代号（回落 hostname）；其余值须过 Actor（链安全、1..128） */
export function setDeviceAlias(db: Database.Database, alias: string): void {
  const trimmed = alias.trim();
  if (trimmed === '') {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run('device_alias');
    return;
  }
  const parsed = Actor.safeParse(trimmed);
  if (!parsed.success) {
    throw new Error('设备代号不合法：1–128 字符，且不得含 |、换行（证据链 actor 要求）');
  }
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run('device_alias', trimmed);
}

/** 0 = 关闭自动锁定；上限 1440（一天） */
export function setAutoLockMinutes(db: Database.Database, minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_AUTO_LOCK_MINUTES) {
    throw new Error(`自动锁定分钟数不合法：0–${MAX_AUTO_LOCK_MINUTES} 的整数，0 为关闭`);
  }
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run('auto_lock_minutes', String(minutes));
}

/** 证据链 actor 与采集物 deviceId 的取值：设备代号优先，回落本机主机名 */
export function actorIdOf(db: Database.Database, fallback: string): string {
  return getSettings(db).deviceAlias ?? fallback;
}
