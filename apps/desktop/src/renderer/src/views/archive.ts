/* 档案库视图：事件 → 访谈 → 采集物三级列表 + 访谈详情（受访者 / 引荐链 / 同意书 / 备忘录）。 */
import type {
  Artifact as ArtifactRow,
  ConsentRecord as ConsentRow,
  Encounter as EncounterRow,
  FieldEvent as FieldEventRow,
  Memo as MemoRow,
} from '@openfield/core';
import type { DetailPayload } from '../../../shared/types';
import { invoke, invokeQuiet } from '../ipc';
import { registerViewLoader } from '../router';
import { button, clearElement, detailLine, emptyRow, setReadout, tag, withLoading, $ } from '../ui';

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

export async function loadArchive(): Promise<void> {
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

export const MEMO_LABEL: Record<MemoRow['type'], string> = {
  reflexive: '反身性',
  analytical: '分析',
  daily: '田野日志',
  quicknote: '速记',
};

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

/* 研究台时间线跳转入口：切到档案库并直达该访谈详情 */
export function openEncounter(encounterId: string): void {
  selectedEncounterId = encounterId;
  void loadEncounterDetail(encounterId);
}

registerViewLoader('archive', loadArchive);
