import Database from 'better-sqlite3-multiple-ciphers';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applyMigrations } from './migrations';

export interface VaultPaths {
  vaultDb: string;
  originalsRoot: string;
  inboxDir: string;
  quarantineDir: string;
  backupsDir: string;
}

export function resolveVaultPaths(home: string): VaultPaths {
  return {
    vaultDb: join(home, 'vault.db'),
    originalsRoot: join(home, 'originals'),
    inboxDir: join(home, 'inbox'),
    quarantineDir: join(home, 'quarantine'),
    backupsDir: join(home, 'backups'),
  };
}

export class VaultError extends Error {
  constructor(readonly code: 'wrong-key' | 'io', message: string) {
    super(message);
  }
}

// SQLite3MultipleCiphers 的 SQLCipher v4 兼容模式：cipher/legacy 必须在 key 之前、
// 首次真实读取之前生效（README 口径）。错误口令在首次读取时以 SQLITE_NOTADB 暴露。
const CIPHER_PRAGMAS = ["cipher='sqlcipher'", 'legacy=4'] as const;

export function openVault(paths: VaultPaths, passphrase: string, create: boolean): Database.Database {
  if (passphrase.length < 8) throw new VaultError('io', 'vault 口令至少 8 个字符');
  if (!create && !existsSync(paths.vaultDb)) throw new VaultError('io', `vault 不存在：${paths.vaultDb}`);
  mkdirSync(dirname(paths.vaultDb), { recursive: true });

  const db = new Database(paths.vaultDb);
  try {
    for (const p of CIPHER_PRAGMAS) db.pragma(p);
    db.pragma(`key='${passphrase.replaceAll("'", "''")}'`);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.prepare('SELECT COUNT(*) FROM sqlite_master').get(); // 错误口令在此暴露
    applyMigrations(db);
    return db;
  } catch (err) {
    db.close();
    const msg = err instanceof Error ? err.message : String(err);
    if (/not a database|malformed|encrypted|corrupt/i.test(msg)) {
      throw new VaultError('wrong-key', 'vault 口令错误或文件已损坏（无找回，见规格 §5）');
    }
    throw err;
  }
}

export function closeVault(db: Database.Database): void {
  db.close();
}

export function backupVault(db: Database.Database, outPath: string): void {
  if (existsSync(outPath)) throw new VaultError('io', `备份目标已存在：${outPath}`);
  mkdirSync(dirname(outPath), { recursive: true });
  // VACUUM INTO 沿用当前连接的口令与加密参数，产出即加密副本
  db.exec(`VACUUM INTO '${outPath.replaceAll("'", "''")}'`);
}
