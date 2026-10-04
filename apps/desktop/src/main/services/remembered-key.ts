import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// A36 记住口令：safeStorage（OS 钥匙串）加密后落 userData，密文只能被本机解开，
// 与 vault home 绑定（拷贝到其他目录/机器无效）。抽 SafeStorageLike 接口是为了
// Node 单测可注入伪实现——electron 命名导出在测试环境为 undefined。
export interface SafeStorageLike {
  encryptString(plain: string): Buffer;
  decryptString(cipher: Buffer): string;
}

const FILE_NAME = 'remembered.bin';

interface Envelope {
  v: 1;
  home: string;
  cipher: string; // base64
}

export function rememberedKeyPath(dir: string): string {
  return join(dir, FILE_NAME);
}

export function saveRememberedKey(dir: string, home: string, passphrase: string, storage: SafeStorageLike): void {
  const envelope: Envelope = {
    v: 1,
    home,
    cipher: storage.encryptString(passphrase).toString('base64'),
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(rememberedKeyPath(dir), JSON.stringify(envelope), { mode: 0o600 });
}

export function hasRememberedKey(dir: string, home: string): boolean {
  const p = rememberedKeyPath(dir);
  if (!existsSync(p)) return false;
  try {
    const env = JSON.parse(readFileSync(p, 'utf8')) as Envelope;
    return env.v === 1 && env.home === home;
  } catch {
    return false;
  }
}

export function readRememberedKey(dir: string, home: string, storage: SafeStorageLike): string | null {
  const p = rememberedKeyPath(dir);
  if (!existsSync(p)) return null;
  try {
    const env = JSON.parse(readFileSync(p, 'utf8')) as Envelope;
    if (env.v !== 1 || env.home !== home) return null;
    return storage.decryptString(Buffer.from(env.cipher, 'base64'));
  } catch {
    // 密文解读失败（钥匙串密钥已轮换 / 文件损坏）：记住文件视为过期，立即清除
    rmSync(p, { force: true });
    return null;
  }
}

export function forgetRememberedKey(dir: string, home: string): void {
  // 仅当文件属于该 home 时删除——一台机器可能先后用过多个 vault 位置
  if (hasRememberedKey(dir, home)) rmSync(rememberedKeyPath(dir), { force: true });
}
