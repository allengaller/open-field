/* 演示数据视图（概览页面板）：载入 / 清除 / 足迹徽标。 */
import type { MockFootprint, MockSummary } from '../../../shared/types';
import { invoke, invokeQuiet } from '../ipc';
import { registerViewLoader } from '../router';
import { button, setReadout, withLoading, $ } from '../ui';
import { loadArchive } from './archive';
import { refreshStatus } from './vault';

export async function refreshMockStatus(): Promise<void> {
  const fp = await invokeQuiet<MockFootprint>('mock:status');
  const el = $('mock-status');
  if (fp === null) {
    el.textContent = 'LOCKED';
    el.className = 'tag';
    return;
  }
  if (fp.artifacts > 0 || fp.events > 0) {
    el.textContent = `已载入：事件 ${fp.events} · 访谈 ${fp.encounters} · 采集物 ${fp.artifacts}`;
    el.className = 'tag tag--ok';
  } else {
    el.textContent = '未载入';
    el.className = 'tag';
  }
}

button('btn-mock-load').addEventListener('click', () =>
  withLoading(button('btn-mock-load'), async () => {
    const s = await invoke<MockSummary>('mock:load');
    setReadout(
      `演示数据已载入：事件 ${s.events} · 受访者 ${s.participants} · 访谈 ${s.encounters} · 采集物 ${s.artifacts} · 同意书 ${s.consents} · 备忘录 ${s.memos} · 引用 ${s.citations} · 待定收件 ${s.inboxFiles}`,
      'is-ok',
    );
    await refreshStatus();
    void refreshMockStatus();
    if ($('view-archive').classList.contains('is-active')) await loadArchive();
  }),
);

button('btn-mock-clear').addEventListener('click', () =>
  withLoading(button('btn-mock-clear'), async () => {
    await invoke('mock:clear');
    setReadout('演示数据已清除（证据链日志按 append-only 铁律保留）', 'is-ok');
    await refreshStatus();
    void refreshMockStatus();
    if ($('view-archive').classList.contains('is-active')) await loadArchive();
  }),
);

registerViewLoader('overview', refreshMockStatus);
