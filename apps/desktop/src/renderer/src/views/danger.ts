/* 危险区：被试清除（purge）+ NTP 时间同步。 */
import type { TimeSyncPayload } from '../../../shared/types';
import { invoke } from '../ipc';
import { button, input, setReadout, withLoading } from '../ui';
import { refreshMockStatus } from './mock';
import { refreshStatus } from './vault';

button('btn-purge').addEventListener('click', () =>
  withLoading(button('btn-purge'), async () => {
    const pseudonym = input('purge-pseudonym').value;
    const scope = await invoke<{ encounters: number; consents: number; artifacts: number; memos: number }>('purge:subject', {
      pseudonym,
      confirmToken: input('purge-confirm').value,
    });
    setReadout(
      `清除完成：${pseudonym}（访谈 ${scope.encounters} · 同意书 ${scope.consents} · 采集物 ${scope.artifacts} · 备忘录 ${scope.memos}）。清除动作已留痕。`,
      'is-ok',
    );
    await refreshStatus();
    void refreshMockStatus();
    input('purge-pseudonym').value = '';
    input('purge-confirm').value = '';
  }),
);

button('btn-timesync').addEventListener('click', () =>
  withLoading(button('btn-timesync'), async () => {
    const { record } = await invoke<TimeSyncPayload>('time:sync');
    setReadout(`时间已同步：NTP ${record.ntpServer} 偏移 ${record.offsetMs}ms`, 'is-ok');
  }),
);
