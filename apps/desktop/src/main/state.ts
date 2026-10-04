import type Database from 'better-sqlite3-multiple-ciphers';
import { existsSync, mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { openVault, resolveVaultPaths } from './services/vault';
import { actorIdOf } from './services/settings';
import type { VaultStatus } from '../shared/types';

export type { VaultStatus };

export class AppState {
  readonly paths: ReturnType<typeof resolveVaultPaths>;
  /** 兜底设备标识：仅当 vault 未解锁（读不到 app_settings）时使用 */
  readonly deviceId = hostname();
  private db: Database.Database | null = null;

  constructor(readonly home: string) {
    this.paths = resolveVaultPaths(home);
  }

  /** 证据链 actor / 采集物 deviceId 的实际取值：设备代号优先，回落主机名（A34） */
  get actorId(): string {
    return this.db ? actorIdOf(this.db, this.deviceId) : this.deviceId;
  }

  hasVault(): boolean {
    return existsSync(this.paths.vaultDb);
  }

  get unlocked(): boolean {
    return this.db !== null;
  }

  createVault(passphrase: string): void {
    if (this.db) throw new Error('vault 已解锁');
    this.db = openVault(this.paths, passphrase, true);
    this.ensureDirs();
  }

  openVault(passphrase: string): void {
    if (this.db) throw new Error('vault 已解锁');
    this.db = openVault(this.paths, passphrase, false);
    this.ensureDirs();
  }

  private ensureDirs(): void {
    for (const dir of [this.paths.originalsRoot, this.paths.inboxDir, this.paths.quarantineDir, this.paths.backupsDir]) {
      mkdirSync(dir, { recursive: true });
    }
  }

  getDb(): Database.Database {
    if (!this.db) throw new Error('vault 未解锁');
    return this.db;
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  status(): VaultStatus {
    const db = this.db;
    if (!db) return { home: this.home, hasVault: this.hasVault(), unlocked: false, events: 0, encounters: 0, pendingInbox: 0 };
    const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
    return {
      home: this.home,
      hasVault: true,
      unlocked: true,
      events: count('SELECT COUNT(*) AS n FROM field_events'),
      encounters: count('SELECT COUNT(*) AS n FROM encounters'),
      pendingInbox: count("SELECT COUNT(*) AS n FROM inbox_items WHERE status = 'pending'"),
    };
  }
}
