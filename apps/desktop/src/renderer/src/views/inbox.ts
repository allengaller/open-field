/* 收件箱视图：待定收件列表（确认入库 / 忽略）+ 手动扫描。 */
import type { InboxItem as PendingItem } from '@openfield/core';
import { invoke, invokeQuiet } from '../ipc';
import { registerViewLoader } from '../router';
import { button, emptyRow, input, setReadout, withLoading, $ } from '../ui';
import { refreshStatus } from './vault';

async function refreshPending(): Promise<void> {
  const items = await invokeQuiet<PendingItem[]>('inbox:list', {});
  const ul = $('pending');
  ul.textContent = '';
  if (items === null) {
    ul.appendChild(emptyRow('资料库已锁定', '解锁后收件箱会持续监视 inbox 目录的新文件。'));
    return;
  }
  const pending = items.filter((i) => i.status === 'pending');
  if (pending.length === 0) {
    ul.appendChild(emptyRow('收件箱已清空', 'inbox 目录有新文件时会自动出现在这里。'));
    return;
  }
  for (const item of pending) {
    const li = document.createElement('li');
    const id = document.createElement('span');
    id.className = 'rows__id';
    id.textContent = item.id;
    const path = document.createElement('span');
    path.className = 'rows__path';
    path.textContent = item.sourcePath;
    const suggestion = item.suggestedEncounterId ?? item.suggestedEventId;
    if (suggestion) {
      path.textContent += `  · 建议归入 ${suggestion}`;
    }
    const actions = document.createElement('div');
    actions.className = 'rows__actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn--sm btn--primary';
    confirmBtn.textContent = '确认入库';
    confirmBtn.addEventListener('click', () =>
      withLoading(confirmBtn, async () => {
        const artifact = await invoke<{ id: string }>('inbox:confirm', {
          itemId: item.id,
          encounterId: input('confirm-enc').value || item.suggestedEncounterId || undefined,
        });
        input('cite-art').value = artifact.id;
        setReadout(`已入库 ${artifact.id}，引用 ID 已填入证据链页`, 'is-ok');
        await refreshPending();
      }),
    );
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'btn btn--sm btn--danger-quiet';
    rejectBtn.textContent = '忽略';
    rejectBtn.addEventListener('click', () =>
      withLoading(rejectBtn, async () => {
        await invoke('inbox:reject', { itemId: item.id });
        await refreshPending();
      }),
    );
    actions.append(confirmBtn, rejectBtn);
    li.append(id, path, actions);
    ul.appendChild(li);
  }
}

export { refreshPending };

button('btn-scan').addEventListener('click', () =>
  withLoading(button('btn-scan'), async () => {
    $('scan').textContent = JSON.stringify(await invoke('inbox:scan'));
    await refreshPending();
    await refreshStatus();
  }),
);

registerViewLoader('inbox', refreshPending);
