/* 研究台视图：备忘录工作台 + 主题编码 + 时间线还原。 */
import type { Memo as MemoRow } from '@openfield/core';
import type { ResearchPayload, TimelineRow } from '../../../shared/types';
import { invoke, invokeQuiet } from '../ipc';
import { registerViewLoader, showView } from '../router';
import { button, clearElement, emptyRow, input, setReadout, tag, withLoading, $ } from '../ui';
import { MEMO_LABEL, openEncounter } from './archive';

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
  openEncounter(encounterId);
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

export async function loadResearch(): Promise<void> {
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

registerViewLoader('research', loadResearch);
