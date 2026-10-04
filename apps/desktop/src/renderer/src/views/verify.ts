/* 证据链视图：整链核验、引用生成、链日志预览。 */
import type { EvidenceEntry as EvidenceEntryRow } from '@openfield/core';
import { invoke, invokeQuiet } from '../ipc';
import { registerViewLoader } from '../router';
import { button, input, setReadout, withLoading, $ } from '../ui';

button('btn-verify').addEventListener('click', () =>
  withLoading(button('btn-verify'), async () => {
    const report = await invoke<{ chainOk: boolean }>('verify:run');
    $('report').textContent = JSON.stringify(report, null, 2);
    const chip = $('verify-chip');
    chip.textContent = report.chainOk ? 'CHAIN OK' : 'ISSUES';
    chip.classList.toggle('is-ok', report.chainOk);
  }),
);

button('btn-cite').addEventListener('click', () =>
  withLoading(button('btn-cite'), async () => {
    if (!input('cite-art').value.trim()) {
      setReadout('错误：尚未填写采集物 ID。确认入库后会自动填入，或手动输入 art-…', 'is-error');
      return;
    }
    const out = await invoke<{ refId: string }>('citation:make', {
      artifactId: input('cite-art').value,
    });
    $('cite-out').textContent = out.refId;
  }),
);

$('btn-cite-copy').addEventListener('click', () => {
  const btn = button('btn-cite-copy');
  const refId = $('cite-out').textContent;
  if (!refId) return;
  void navigator.clipboard.writeText(refId);
  btn.textContent = '已复制';
  window.setTimeout(() => {
    btn.textContent = '复制';
  }, 2500);
});

export async function loadEvidenceLog(): Promise<void> {
  const entries = await invokeQuiet<EvidenceEntryRow[]>('evidence:list');
  const chip = $('evlog-chip');
  const pre = $('evlog');
  if (entries === null) {
    chip.textContent = 'LOCKED';
    chip.className = 'graphite__chip';
    pre.textContent = '';
    return;
  }
  chip.textContent = `${entries.length} ENTRIES`;
  chip.className = 'graphite__chip is-ok';
  pre.textContent = entries
    .map((e) => `${String(e.seq).padStart(4, '0')}  ${new Date(e.ts).toLocaleString('zh-CN')}  ${e.action.padEnd(18, ' ')} ${e.actor}  ${e.payloadHash.slice(0, 12)}…`)
    .join('\n');
}

registerViewLoader('verify', loadEvidenceLog);
