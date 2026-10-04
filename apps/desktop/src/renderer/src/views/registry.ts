/* 采集登记视图：事件 / 访谈登记 + 受访者建档 / 知情同意 / 真名映射（真名仅入加密库独立表）。 */
import { invoke } from '../ipc';
import { button, input, setReadout, withLoading, $ } from '../ui';
import { refreshStatus } from './vault';

button('btn-event').addEventListener('click', () =>
  withLoading(button('btn-event'), async () => {
    await invoke('events:create', {
      id: input('ev-id').value,
      date: input('ev-date').value,
      cityCode: input('ev-city').value,
      locationName: input('ev-loc').value,
      contextNote: input('ev-note').value || undefined,
    });
    setReadout('事件已登记', 'is-ok');
    await refreshStatus();
  }),
);

button('btn-encounter').addEventListener('click', () =>
  withLoading(button('btn-encounter'), async () => {
    await invoke('encounters:create', {
      id: input('enc-id').value,
      eventId: input('enc-event').value,
      participantRef: input('enc-participant').value,
      samplingReason: input('enc-reason').value,
      startedAt: Date.now(),
      note: input('enc-note').value || undefined,
    });
    setReadout('访谈已登记', 'is-ok');
    await refreshStatus();
  }),
);

button('btn-participant').addEventListener('click', () =>
  withLoading(button('btn-participant'), async () => {
    const referral = input('pt-referral').value
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const scope: string[] = [];
    if (($('pt-scope-recording') as HTMLInputElement).checked) scope.push('recording');
    if (($('pt-scope-portrait') as HTMLInputElement).checked) scope.push('portrait');
    if (($('pt-scope-publication') as HTMLInputElement).checked) scope.push('publication');
    const participant = await invoke<{ pseudonym: string }>('participants:upsert', {
      pseudonym: input('pt-pseudonym').value,
      industry: input('pt-industry').value || undefined,
      region: input('pt-region').value || undefined,
      referralChain: referral,
      consentScope: scope,
    });
    setReadout(`受访者已建档：${participant.pseudonym}`, 'is-ok');
  }),
);

button('btn-consent').addEventListener('click', () =>
  withLoading(button('btn-consent'), async () => {
    const consent = await invoke<{ id: string }>('consents:record', {
      encounterId: input('consent-enc').value,
      templateType: ($('consent-type') as HTMLSelectElement).value,
      scope: input('consent-scope').value,
    });
    setReadout(`同意已记录：${consent.id}`, 'is-ok');
  }),
);

button('btn-real-name').addEventListener('click', () =>
  withLoading(button('btn-real-name'), async () => {
    const pseudonym = input('pt-pseudonym').value;
    const realName = input('pt-real-name').value;
    if (!pseudonym.trim() || !realName.trim()) {
      setReadout('错误：笔名与真名均不能为空', 'is-error');
      return;
    }
    await invoke('participants:set-real-name', { pseudonym, realName });
    setReadout(`真名映射已记录：${pseudonym}（仅存加密库）`, 'is-ok');
    input('pt-real-name').value = '';
  }),
);
