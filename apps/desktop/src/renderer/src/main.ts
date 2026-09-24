import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import { restoreErrorText, validateRestoreForm } from './restore';
import { bindKnowledgeDeps, initKnowledge, mountMethodCards } from './knowledge';
import type { IpcResult } from '../../shared/ipc';
import type {
  Artifact as ArtifactRow,
  ConsentRecord as ConsentRow,
  Encounter as EncounterRow,
  EvidenceEntry as EvidenceEntryRow,
  FieldEvent as FieldEventRow,
  InboxItem as PendingItem,
  Memo as MemoRow,
  Participant as ParticipantRow,
} from '@openfield/core';
import type { DetailPayload, MockFootprint, MockSummary, ResearchPayload, TimeSyncPayload, TimelineRow, VaultStatus } from '../../shared/types';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺元素 #${id}`);
  return el;
};

const statusEl = $('status') as HTMLPreElement;

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const res = (await window.openfield.invoke(channel, payload)) as IpcResult<T>;
  if (!res.ok) {
    setReadout(`错误：${res.error}`, 'is-error');
    toast(res.error);
    throw new Error(res.error);
  }
  return res.data;
}

/* 静默版：锁定态下轮询类查询失败时不打扰（读出行与 toast 都不出） */
async function invokeQuiet<T>(channel: string, payload?: unknown): Promise<T | null> {
  const res = (await window.openfield.invoke(channel, payload)) as IpcResult<T>;
  return res.ok ? res.data : null;
}

function setReadout(text: string, tone?: 'is-error' | 'is-ok'): void {
  statusEl.textContent = text;
  statusEl.classList.remove('is-error', 'is-ok');
  if (tone) statusEl.classList.add(tone);
}

function toast(message: string): void {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'alert');
  const text = message.length > 160 ? `${message.slice(0, 160)}…` : message;
  el.textContent = `无法完成：${text}`;
  box.appendChild(el);
  window.setTimeout(() => el.remove(), 6000);
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function tickNumber(el: HTMLElement, target: number): void {
  if (reduceMotion || target === 0) {
    el.textContent = String(target);
    return;
  }
  const start = performance.now();
  const dur = 400;
  const step = (now: number): void => {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = String(Math.round(target * p));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function withLoading(btn: HTMLButtonElement, fn: () => Promise<void>): Promise<void> {
  btn.classList.add('is-loading');
  btn.disabled = true;
  try {
    await fn();
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

/* 实体与载荷类型统一取自 @openfield/core 与 shared/types（此前为手工复制，实体演进修必漂移）。
   下方不再声明任何本地数据 interface。 */

function input(id: string): HTMLInputElement {
  return $(id) as HTMLInputElement;
}

function button(id: string): HTMLButtonElement {
  return $(id) as HTMLButtonElement;
}

/* ── 视图路由 ── */

const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.rail__link'));
const views = Array.from(document.querySelectorAll<HTMLElement>('.view'));

function showView(name: string): void {
  for (const btn of navButtons) {
    const active = btn.dataset.view === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  for (const view of views) {
    view.classList.toggle('is-active', view.id === `view-${name}`);
  }
  if (name === 'archive') void loadArchive();
  if (name === 'inbox') void refreshPending();
  if (name === 'verify') void loadEvidenceLog();
  if (name === 'research') void loadResearch();
  if (name === 'overview') void refreshMockStatus();
  if (name === 'knowledge') void initKnowledge();
}

for (const btn of navButtons) {
  btn.addEventListener('click', () => showView(btn.dataset.view ?? 'overview'));
}

/* ── Vault ── */

function applyStatus(s: VaultStatus): void {
  tickNumber($('stat-events'), s.events);
  tickNumber($('stat-encounters'), s.encounters);
  tickNumber($('stat-inbox'), s.pendingInbox);
  const dot = $('vault-dot');
  dot.classList.toggle('is-unlocked', s.unlocked);
  dot.classList.toggle('is-locked', !s.unlocked);
  const stateText = s.unlocked ? 'UNLOCKED' : 'LOCKED';
  $('vault-chip-text').textContent = stateText;
  $('sb-state').textContent = stateText;
  $('sb-home').textContent = s.home;
  button('btn-restore').hidden = s.unlocked;
  if (s.unlocked) {
    $('restore-fields').hidden = true;
    button('btn-restore-run').hidden = true;
  }
}

async function refreshStatus(): Promise<VaultStatus> {
  const s = await invoke<VaultStatus>('vault:status');
  applyStatus(s);
  return s;
}

function readoutStatus(s: VaultStatus): void {
  statusEl.textContent = JSON.stringify(s);
  statusEl.classList.remove('is-error', 'is-ok');
  applyStatus(s);
}

button('btn-create').addEventListener('click', () =>
  withLoading(button('btn-create'), async () => {
    readoutStatus(await invoke<VaultStatus>('vault:create', { passphrase: input('pass').value }));
    void refreshPending();
  }),
);

button('btn-open').addEventListener('click', () =>
  withLoading(button('btn-open'), async () => {
    readoutStatus(await invoke<VaultStatus>('vault:open', { passphrase: input('pass').value }));
    void refreshPending();
  }),
);

button('btn-status').addEventListener('click', () =>
  withLoading(button('btn-status'), async () => {
    readoutStatus(await invoke<VaultStatus>('vault:status'));
  }),
);

button('btn-backup').addEventListener('click', () =>
  withLoading(button('btn-backup'), async () => {
    const { outPath } = await invoke<{ outPath: string }>('backup:export', {
      passphrase: input('pass').value,
    });
    setReadout(`备份已导出：${outPath}`, 'is-ok');
  }),
);

/* ── 备份恢复 ── */

let restorePath: string | null = null;

button('btn-restore').addEventListener('click', () =>
  withLoading(button('btn-restore'), async () => {
    const { path } = await invoke<{ path: string | null }>('backup:pick');
    restorePath = path;
    $('restore-fields').hidden = path === null;
    button('btn-restore-run').hidden = path === null;
    input('restore-file').value = path ?? '';
  }),
);

button('btn-restore-run').addEventListener('click', () =>
  withLoading(button('btn-restore-run'), async () => {
    const backupPassphrase = input('restore-backup-pass').value;
    const vaultPassphrase = input('restore-vault-pass').value;
    const problem = validateRestoreForm({
      backupPath: restorePath ?? '',
      backupPassphrase,
      vaultPassphrase,
      vaultPassphrase2: input('restore-vault-pass2').value,
    });
    if (problem) {
      setReadout(`错误：${problem}`, 'is-error');
      toast(problem);
      return;
    }
    // 不走 invoke()：restoreErrorText 要在通用错误面之前替换文案
    const res = (await window.openfield.invoke('backup:restore', {
      backupPath: restorePath,
      backupPassphrase,
      vaultPassphrase,
    })) as IpcResult<unknown>;
    if (!res.ok) {
      const text = restoreErrorText(res.error);
      setReadout(`错误：${text}`, 'is-error');
      toast(text);
      return;
    }
    setReadout('已从备份恢复：请用资料库口令解锁', 'is-ok');
    $('restore-fields').hidden = true;
    button('btn-restore-run').hidden = true;
    await refreshStatus();
  }),
);

/* ── 登记 ── */

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

/* ── 受访者建档 / 知情同意 ── */

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

/* ── 危险区 / 时间同步 ── */

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

/* ── 演示数据 ── */

async function refreshMockStatus(): Promise<void> {
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

/* ── 收件箱 ── */

function emptyRow(title: string, line: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'empty';
  const t = document.createElement('span');
  t.className = 'empty__title';
  t.textContent = title;
  const p = document.createElement('span');
  p.textContent = line;
  li.append(t, p);
  return li;
}

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

button('btn-scan').addEventListener('click', () =>
  withLoading(button('btn-scan'), async () => {
    $('scan').textContent = JSON.stringify(await invoke('inbox:scan'));
    await refreshPending();
    await refreshStatus();
  }),
);

/* ── 证据链 ── */

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

/* ── 证据链日志 ── */

async function loadEvidenceLog(): Promise<void> {
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

/* ── 档案库 ── */

function renderSelectList(
  ul: HTMLElement,
  rows: { title: string; meta: string }[],
  emptyTitle: string,
  emptyLine: string,
  onPick?: (index: number) => void,
): void {
  ul.textContent = '';
  if (rows.length === 0) {
    ul.appendChild(emptyRow(emptyTitle, emptyLine));
    return;
  }
  rows.forEach((row, index) => {
    const li = document.createElement('li');
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'selectlist__item';
    const title = document.createElement('span');
    title.className = 'selectlist__title';
    title.textContent = row.title;
    const meta = document.createElement('span');
    meta.className = 'selectlist__meta';
    meta.textContent = row.meta;
    item.append(title, meta);
    if (onPick) {
      item.addEventListener('click', () => {
        for (const other of ul.querySelectorAll('.selectlist__item')) {
          other.classList.remove('is-selected');
        }
        item.classList.add('is-selected');
        onPick(index);
      });
    }
    li.appendChild(item);
    ul.appendChild(li);
  });
}

let archiveEvents: FieldEventRow[] = [];
let selectedEncounterId: string | null = null;

async function loadArchive(): Promise<void> {
  const events = await invokeQuiet<FieldEventRow[]>('archive:events');
  if (events === null) {
    archiveEvents = [];
    renderSelectList($('ar-events'), [], '资料库已锁定', '解锁后即可在此回看全部事件。');
    renderSelectList($('ar-encounters'), [], '选择一个事件', '点击左侧事件查看其下的访谈。');
    renderSelectList($('ar-artifacts'), [], '选择一条访谈', '点击中间的访谈查看采集物与引用。');
    return;
  }
  archiveEvents = events;
  renderSelectList(
    $('ar-events'),
    archiveEvents.map((e) => ({ title: e.id, meta: `${e.date} · ${e.cityCode} · ${e.locationName}` })),
    '暂无事件',
    '在「采集登记」中登记第一个事件。',
  );
  renderSelectList($('ar-encounters'), [], '选择一个事件', '点击左侧事件查看其下的访谈。');
  renderSelectList($('ar-artifacts'), [], '选择一条访谈', '点击中间的访谈查看采集物与引用。');
}

$('ar-events').addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest('.selectlist__item');
  if (!item) return;
  const index = Array.from($('ar-events').querySelectorAll('.selectlist__item')).indexOf(item);
  const ev: FieldEventRow | undefined = archiveEvents[index];
  if (!ev) return;
  void invoke<EncounterRow[]>('archive:encounters', { eventId: ev.id }).then((rows) => {
    renderSelectList(
      $('ar-encounters'),
      rows.map((c) => ({ title: `${c.id} · ${c.participantRef}`, meta: c.samplingReason })),
      '该事件下暂无访谈',
      '在「采集登记」中把访谈归入此事件。',
      (i) => {
        const enc: EncounterRow | undefined = rows[i];
        if (!enc) return;
        selectedEncounterId = enc.id;
        void invoke<ArtifactRow[]>('archive:artifacts', { encounterId: enc.id }).then((arts) => {
          renderSelectList(
            $('ar-artifacts'),
            arts.map((a) => ({
              title: a.refId ? `${a.id} → ${a.refId}` : a.id,
              meta: `${a.type} · ${(a.size / 1024).toFixed(1)} KB · ${new Date(a.capturedAt).toLocaleString('zh-CN')}`,
            })),
            '该访谈下暂无采集物',
            '从「收件箱」确认入库的素材会出现在这里。',
          );
        });
        void loadEncounterDetail(enc.id);
      },
    );
  });
});

button('btn-archive-refresh').addEventListener('click', () =>
  withLoading(button('btn-archive-refresh'), async () => {
    await loadArchive();
  }),
);

button('btn-journal').addEventListener('click', () =>
  withLoading(button('btn-journal'), async () => {
    const today = new Date().toLocaleDateString('sv');
    const memo = await invoke<{ id: string }>('journals:build', { date: today });
    setReadout(`田野日志已生成：${memo.id}（草稿，待补写反思后确认）`, 'is-ok');
    if (selectedEncounterId) void loadEncounterDetail(selectedEncounterId);
  }),
);

/* 访谈详情：受访者 / 引荐链 / 知情同意 / 备忘录 */

const CONSENT_LABEL: Record<ConsentRow['templateType'], string> = {
  recording: '录音',
  portrait: '肖像',
  publication: '发表',
};

const MEMO_LABEL: Record<MemoRow['type'], string> = {
  reflexive: '反身性',
  analytical: '分析',
  daily: '田野日志',
  quicknote: '速记',
};

function tag(text: string, tone?: 'ok' | 'withdrawn' | 'accent'): HTMLElement {
  const el = document.createElement('span');
  el.className = tone ? `tag tag--${tone}` : 'tag';
  el.textContent = text;
  return el;
}

function detailLine(parts: (string | undefined)[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'detail__line';
  const [first, ...rest] = parts.filter((p): p is string => p !== undefined && p !== '');
  const b = document.createElement('b');
  b.textContent = first ?? '';
  el.appendChild(b);
  if (rest.length > 0) {
    el.appendChild(document.createTextNode(` · ${rest.join(' · ')}`));
  }
  return el;
}

function clearElement(el: HTMLElement): void {
  el.textContent = '';
}

async function loadEncounterDetail(encounterId: string): Promise<void> {
  const detail = await invoke<DetailPayload>('archive:detail', { encounterId });
  $('ar-detail').hidden = false;

  const pBox = $('ar-participant');
  clearElement(pBox);
  const p = detail.participant;
  if (!p) {
    const empty = document.createElement('span');
    empty.textContent = '该受访者未建档。';
    pBox.appendChild(empty);
  } else {
    pBox.appendChild(detailLine([p.pseudonym, p.industry, p.region]));
    const chainLabel = document.createElement('span');
    chainLabel.className = 'archive__label';
    chainLabel.textContent = '引荐链（滚雪球）';
    pBox.appendChild(chainLabel);
    const chain = document.createElement('div');
    chain.className = 'chain';
    if (p.referralChain && p.referralChain.length > 0) {
      p.referralChain.forEach((ref, index) => {
        if (index > 0) {
          const arrow = document.createElement('span');
          arrow.className = 'chain__arrow';
          arrow.textContent = '→';
          chain.appendChild(arrow);
        }
        chain.appendChild(tag(ref));
      });
      const arrow = document.createElement('span');
      arrow.className = 'chain__arrow';
      arrow.textContent = '→';
      chain.appendChild(arrow);
      chain.appendChild(tag(p.pseudonym, 'accent'));
    } else {
      const seed = document.createElement('span');
      seed.textContent = '种子受访者（无引荐）';
      chain.appendChild(seed);
    }
    pBox.appendChild(chain);
  }

  const cBox = $('ar-consents');
  clearElement(cBox);
  if (detail.consents.length === 0) {
    const empty = document.createElement('span');
    empty.textContent = '未记录同意书。';
    cBox.appendChild(empty);
  }
  for (const c of detail.consents) {
    const row = document.createElement('div');
    row.className = 'tagrow';
    row.appendChild(tag(CONSENT_LABEL[c.templateType] ?? c.templateType, c.withdrawnAt ? 'withdrawn' : 'ok'));
    const scope = document.createElement('span');
    scope.className = 'detail__line';
    scope.textContent = c.withdrawnAt ? `${c.scope}（已撤回）` : c.scope;
    row.appendChild(scope);
    if (!c.withdrawnAt) {
      const withdrawBtn = document.createElement('button');
      withdrawBtn.className = 'btn btn--sm btn--danger-quiet';
      withdrawBtn.textContent = '撤回';
      withdrawBtn.addEventListener('click', () =>
        withLoading(withdrawBtn, async () => {
          await invoke('consents:withdraw', { consentId: c.id });
          setReadout(`同意已撤回：${c.id}（撤回事实已入证据链）`, 'is-ok');
          await loadEncounterDetail(encounterId);
        }),
      );
      row.appendChild(withdrawBtn);
    }
    cBox.appendChild(row);
  }

  const mBox = $('ar-memos');
  clearElement(mBox);
  if (detail.memos.length === 0) {
    const empty = document.createElement('span');
    empty.textContent = '暂无备忘录。';
    mBox.appendChild(empty);
  }
  for (const m of detail.memos) {
    const memo = document.createElement('div');
    memo.className = 'memo';
    const meta = document.createElement('span');
    meta.className = 'memo__meta';
    meta.textContent = `${MEMO_LABEL[m.type] ?? m.type} · ${m.confirmedAt ? '已确认' : '草稿（待人工确认）'}`;
    const body = document.createElement('span');
    body.className = 'memo__body';
    body.textContent = m.content;
    memo.append(meta, body);
    if (!m.confirmedAt) {
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn--sm';
      confirmBtn.textContent = '确认入档';
      confirmBtn.addEventListener('click', () =>
        withLoading(confirmBtn, async () => {
          await invoke('memos:confirm', { memoId: m.id });
          setReadout(`备忘录已确认入档：${m.id}`, 'is-ok');
          await loadEncounterDetail(encounterId);
        }),
      );
      memo.appendChild(confirmBtn);
    }
    mBox.appendChild(memo);
  }
}

/* ── 研究台 ── */

// 报道档案深读的结构化编码骨架（方法论 · 焦点访谈田野方法论 六步工作流）
const CODING_TEMPLATE = '【结构化编码 · 报道档案深读】\n时间：\n地点：\n主体：\n行动：\n回应：';

const TIMELINE_LABEL: Record<TimelineRow['kind'], string> = {
  event: '事件',
  encounter: '访谈',
  artifact: '采集物',
  memo: '备忘录',
};

let research: ResearchPayload | null = null;
let activeThemeFilter: string | null = null;

function parseThemeList(raw: string): string[] {
  return [...new Set(raw.split(/[,，]/).map((s) => s.trim()).filter((s) => s.length > 0))];
}

function jumpToEncounter(encounterId: string): void {
  showView('archive');
  selectedEncounterId = encounterId;
  void loadEncounterDetail(encounterId);
}

function renderThemeChips(): void {
  const box = $('rs-theme-chips');
  clearElement(box);
  const counts = research?.themeCounts ?? [];
  if (counts.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'field__help';
    empty.textContent = research === null
      ? '资料库已锁定。'
      : '尚无主题编码：撰写备忘录时填写主题标签，或对下方备忘录点「编码」。';
    box.appendChild(empty);
    return;
  }
  for (const { theme, count } of counts) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `tag chip${activeThemeFilter === theme ? ' is-selected' : ''}`;
    chip.textContent = `${theme} ×${count}`;
    chip.addEventListener('click', () => {
      activeThemeFilter = activeThemeFilter === theme ? null : theme;
      renderThemeChips();
      renderResearchMemos();
    });
    box.appendChild(chip);
  }
}

function renderResearchMemos(): void {
  const ul = $('rs-memos');
  ul.textContent = '';
  const memos = research?.memos ?? [];
  if (memos.length === 0) {
    ul.appendChild(emptyRow('暂无备忘录', '在上方工作台写下第一条备忘录。'));
    return;
  }
  const visible = activeThemeFilter
    ? memos.filter((m) => (m.themes ?? []).includes(activeThemeFilter as string))
    : memos;
  if (visible.length === 0) {
    ul.appendChild(emptyRow('该主题下暂无备忘录', '点击主题标签取消筛选。'));
    return;
  }
  for (const m of visible) {
    const memo = document.createElement('div');
    memo.className = 'memo';
    const meta = document.createElement('span');
    meta.className = 'memo__meta';
    meta.textContent = `${MEMO_LABEL[m.type] ?? m.type} · ${m.confirmedAt ? '已确认' : '草稿（待人工确认）'} · ${new Date(m.createdAt).toLocaleString('zh-CN')}`;
    const body = document.createElement('span');
    body.className = 'memo__body';
    body.textContent = m.content;
    memo.append(meta, body);
    for (const t of m.themes ?? []) memo.appendChild(tag(t, 'accent'));
    const actions = document.createElement('div');
    actions.className = 'tagrow';
    if (!m.confirmedAt) {
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn--sm';
      confirmBtn.textContent = '确认入档';
      confirmBtn.addEventListener('click', () =>
        withLoading(confirmBtn, async () => {
          await invoke('memos:confirm', { memoId: m.id });
          setReadout(`备忘录已确认入档：${m.id}`, 'is-ok');
          await loadResearch();
        }),
      );
      actions.appendChild(confirmBtn);
    }
    const codeBtn = document.createElement('button');
    codeBtn.className = 'btn btn--sm';
    codeBtn.textContent = '编码';
    codeBtn.addEventListener('click', () => {
      const existing = memo.querySelector('.memo__code');
      if (existing) {
        existing.remove();
        return;
      }
      const box = document.createElement('div');
      box.className = 'tagrow memo__code';
      const inp = document.createElement('input');
      inp.className = 'input';
      inp.placeholder = '主题标签，逗号分隔';
      inp.value = (m.themes ?? []).join(', ');
      const save = document.createElement('button');
      save.className = 'btn btn--sm btn--primary';
      save.textContent = '保存编码';
      save.addEventListener('click', () =>
        withLoading(save, async () => {
          await invoke('research:memo-code', { memoId: m.id, themes: parseThemeList(inp.value) });
          setReadout(`编码已保存并入链：${m.id}`, 'is-ok');
          await loadResearch();
        }),
      );
      box.append(inp, save);
      memo.appendChild(box);
      inp.focus();
    });
    actions.appendChild(codeBtn);
    memo.appendChild(actions);
    ul.appendChild(memo);
  }
}

function renderTimeline(rows: TimelineRow[]): void {
  const ul = $('rs-timeline');
  ul.textContent = '';
  if (rows.length === 0) {
    ul.appendChild(emptyRow('暂无记录', '登记事件、访谈或入库采集物后，这里会按时间还原田野现场。'));
    return;
  }
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = 'timeline';
    li.appendChild(tag(TIMELINE_LABEL[row.kind] ?? row.kind));
    const body = document.createElement('div');
    body.className = 'timeline__body';
    const t = document.createElement('span');
    t.className = 'rows__id';
    t.textContent = `${new Date(row.at).toLocaleString('zh-CN')} · ${row.title}`;
    const d = document.createElement('span');
    d.className = 'rows__path';
    d.textContent = row.detail;
    body.append(t, d);
    const right = document.createElement('div');
    right.className = 'tagrow';
    for (const theme of row.themes ?? []) right.appendChild(tag(theme, 'accent'));
    if (row.kind === 'memo') right.appendChild(tag(row.confirmed ? '已确认' : '草稿', row.confirmed ? 'ok' : undefined));
    li.append(body, right);
    if (row.kind === 'encounter') {
      li.classList.add('is-clickable');
      li.addEventListener('click', () => jumpToEncounter(row.id));
    } else if (row.encounterId) {
      li.classList.add('is-clickable');
      li.addEventListener('click', () => jumpToEncounter(row.encounterId as string));
    } else if (row.kind === 'event') {
      li.classList.add('is-clickable');
      li.addEventListener('click', () => showView('archive'));
    }
    ul.appendChild(li);
  }
}

async function loadResearch(): Promise<void> {
  const data = await invokeQuiet<ResearchPayload>('research:load');
  research = data;
  if (data === null) {
    activeThemeFilter = null;
    renderThemeChips();
    const ul = $('rs-memos');
    ul.textContent = '';
    ul.appendChild(emptyRow('资料库已锁定', '解锁后即可在此撰写备忘录与做主题编码。'));
    const tl = $('rs-timeline');
    tl.textContent = '';
    tl.appendChild(emptyRow('资料库已锁定', '解锁后这里会按时间还原田野现场。'));
    return;
  }
  if (activeThemeFilter && !data.themeCounts.some((c) => c.theme === activeThemeFilter)) {
    activeThemeFilter = null;
  }
  renderThemeChips();
  renderResearchMemos();
  renderTimeline(data.timeline);
}

button('btn-coding-template').addEventListener('click', () => {
  const ta = $('rs-memo-content') as HTMLTextAreaElement;
  if (!ta.value.trim()) {
    ta.value = CODING_TEMPLATE;
  } else if (!ta.value.includes(CODING_TEMPLATE)) {
    ta.value = `${ta.value.replace(/\s*$/, '')}\n\n${CODING_TEMPLATE}`;
  }
  ta.focus();
});

button('btn-memo-create').addEventListener('click', () =>
  withLoading(button('btn-memo-create'), async () => {
    const content = ($('rs-memo-content') as HTMLTextAreaElement).value;
    if (!content.trim()) {
      setReadout('错误：备忘录内容不能为空', 'is-error');
      return;
    }
    const { memo } = await invoke<{ memo: MemoRow }>('research:memo-create', {
      type: ($('rs-memo-type') as HTMLSelectElement).value,
      content,
      themes: parseThemeList(input('rs-memo-themes').value),
      linkedArtifactIds: parseThemeList(input('rs-memo-artifacts').value),
    });
    setReadout(`备忘录已创建并入链：${memo.id}`, 'is-ok');
    ($('rs-memo-content') as HTMLTextAreaElement).value = '';
    input('rs-memo-themes').value = '';
    input('rs-memo-artifacts').value = '';
    await loadResearch();
  }),
);

/* ── 启动 ── */

window.addEventListener('unhandledrejection', (e) => {
  const message = e.reason instanceof Error ? e.reason.message : String(e.reason);
  setReadout(`错误：${message}`, 'is-error');
});

void refreshStatus().then(() => refreshPending());
bindKnowledgeDeps({ showView });
mountMethodCards();
window.openfield.onInboxChanged(() => {
  void refreshPending();
  void refreshStatus();
});
