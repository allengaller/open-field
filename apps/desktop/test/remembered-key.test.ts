import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  forgetRememberedKey, hasRememberedKey, readRememberedKey, rememberedKeyPath, saveRememberedKey,
  type SafeStorageLike,
} from '../src/main/services/remembered-key';

const homes: string[] = [];
afterEach(() => {
  while (homes.length) rmSync(homes.pop()!, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'of-remembered-'));
  homes.push(dir);
  return dir;
}

// 伪 safeStorage：加解密用对称变换模拟（真实实现由 OS 钥匙串保证，这里只测信封逻辑）
const goodStorage: SafeStorageLike = {
  encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decryptString: (cipher) => {
    const s = cipher.toString('utf8');
    if (!s.startsWith('enc:')) throw new Error('decrypt failed');
    return s.slice(4);
  },
};
const brokenStorage: SafeStorageLike = {
  ...goodStorage,
  decryptString: () => {
    throw new Error('keychain key rotated');
  },
};

describe('remembered-key (A36)', () => {
  it('保存→存在检查→读回闭环，明文不出现在文件里', () => {
    const dir = scratch();
    expect(hasRememberedKey(dir, '/home')).toBe(false);
    saveRememberedKey(dir, '/home', 'my-pass-123', goodStorage);
    expect(hasRememberedKey(dir, '/home')).toBe(true);
    expect(readRememberedKey(dir, '/home', goodStorage)).toBe('my-pass-123');
    expect(readFileSync(rememberedKeyPath(dir), 'utf8')).not.toContain('my-pass-123');
  });

  it('home 不匹配返回 null（密文与目录绑定，拷贝无效）', () => {
    const dir = scratch();
    saveRememberedKey(dir, '/home-a', 'my-pass-123', goodStorage);
    expect(hasRememberedKey(dir, '/home-b')).toBe(false);
    expect(readRememberedKey(dir, '/home-b', goodStorage)).toBe(null);
  });

  it('解读失败（钥匙串密钥轮换）→ null 且文件即删', () => {
    const dir = scratch();
    saveRememberedKey(dir, '/home', 'my-pass-123', goodStorage);
    expect(readRememberedKey(dir, '/home', brokenStorage)).toBe(null);
    expect(existsSync(rememberedKeyPath(dir))).toBe(false);
  });

  it('信封损坏（非 JSON）→ has false / read null，不抛错', () => {
    const dir = scratch();
    saveRememberedKey(dir, '/home', 'my-pass-123', goodStorage);
    const p = rememberedKeyPath(dir);
    writeFileSync(p, 'garbage');
    expect(hasRememberedKey(dir, '/home')).toBe(false);
    expect(readRememberedKey(dir, '/home', goodStorage)).toBe(null);
  });

  it('forget 只删属于该 home 的文件', () => {
    const dir = scratch();
    saveRememberedKey(dir, '/home-a', 'my-pass-123', goodStorage);
    forgetRememberedKey(dir, '/home-b');
    expect(existsSync(rememberedKeyPath(dir))).toBe(true);
    forgetRememberedKey(dir, '/home-a');
    expect(existsSync(rememberedKeyPath(dir))).toBe(false);
  });
});
