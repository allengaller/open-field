import { mkdirSync } from 'node:fs';
import { watch } from 'chokidar';
import type { AppState } from './state';
import { scanOnce, type ScanSummary } from './services/inbox';

export function startInboxWatcher(state: AppState, onSummary: (s: ScanSummary) => void): () => void {
  mkdirSync(state.paths.inboxDir, { recursive: true }); // A16：chokidar 对不存在的目录永不生效（ENOENT 被内部吞掉），先确保目录在
  let timer: NodeJS.Timeout | null = null;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!state.unlocked) return;
      scanOnce(state.getDb(), { inboxDir: state.paths.inboxDir, quarantineDir: state.paths.quarantineDir })
        .then((s) => {
          if (s.pending + s.quarantined + s.appliedBundles > 0) onSummary(s);
        })
        .catch((err) => {
          // 文件事件会集中爆发，单次失败交给下次触发；scanOnce 对目录缺失返回空。
          // 失败必须可见（A11 同一原则）：静默吞掉会让「收件箱没在工作」无从察觉。
          console.warn('[inbox] watcher 触发的扫描失败，等待下次文件事件重试：', err);
        });
    }, 300);
  };

  const watcher = watch(state.paths.inboxDir, {
    depth: 0,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  watcher.on('add', schedule).on('change', schedule).on('unlink', schedule);

  return () => {
    if (timer) clearTimeout(timer);
    void watcher.close();
  };
}
