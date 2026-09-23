import manifestJson from '@openfield/knowledge/manifest.json';
import { COLLECTION_IDS } from '@openfield/knowledge';
import type { ChapterMeta, CollectionFile, KnowledgeManifest, MethodCard } from '@openfield/knowledge';

/* resolveJsonModule 会推导 JSON 字面量类型；这里统一收口为包内类型 */
export const manifest = manifestJson as unknown as KnowledgeManifest;

const collectionCache = new Map<string, CollectionFile>();

/* bare-specifier 模板字面量打包器无法静态分析，用静态映射按需分包 */
const COLLECTION_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  fieldwork: () => import('./knowledge/fieldwork'),
  sociology: () => import('./knowledge/sociology'),
};

async function loadCollection(cid: string): Promise<CollectionFile | null> {
  const cached = collectionCache.get(cid);
  if (cached) return cached;
  if (!(COLLECTION_IDS as readonly string[]).includes(cid)) return null;
  const loader = COLLECTION_LOADERS[cid];
  if (!loader) return null;
  const file = (await loader()).default as CollectionFile;
  collectionCache.set(cid, file);
  return file;
}

export function collectionMeta(cid: string): KnowledgeManifest['collections'][number] | null {
  return manifest.collections.find((c) => c.id === cid) ?? null;
}

export function findChapterBySourcePath(cid: string, sourcePath: string): { collectionId: string; chapterId: string } | null {
  const hit = collectionMeta(cid)?.chapters.find((c) => c.sourcePath === sourcePath);
  return hit ? { collectionId: cid, chapterId: hit.id } : null;
}

/* klink 的 data-target（"<collectionId>/<相对路径>.md"）→ 章节定位 */
export function parseLinkTarget(target: string): { collectionId: string; chapterId: string } | null {
  const slash = target.indexOf('/');
  if (slash <= 0) return null;
  const cid = target.slice(0, slash);
  if (!(COLLECTION_IDS as readonly string[]).includes(cid)) return null;
  const chapterId = target
    .slice(slash + 1)
    .replace(/\.md$/, '')
    .replace(/\//g, '--');
  return { collectionId: cid, chapterId };
}

export const EVIDENCE_LABELS: Record<MethodCard['badge'], string> = {
  verify: '核验',
  consensus: '通行共识',
  practice: '操作性建议',
};

export const EVIDENCE_DESCRIPTIONS: Record<MethodCard['badge'], string> = {
  verify: '经过一手材料核验的表述',
  consensus: '教科书级通行共识',
  practice: '可执行的田野操作建议',
};

export const METHOD_CARD_IDS = [
  'interview-guide',
  'interview-toolbox',
  'consent-ethics',
  'memo-coding',
  'grounded-theory',
  'observation-notes',
  'triangulation',
  'snowball',
] as const;

export function methodCardById(id: string): MethodCard | null {
  return manifest.cards.find((c) => c.id === id) ?? null;
}

export function learningPathChapterIds(pathId: string): { collectionId: string; chapterId: string }[] {
  return manifest.learningPaths.find((p) => p.id === pathId)?.chapters ?? [];
}

export interface KnowledgeHit {
  collectionId: string;
  chapterId: string;
  chapterTitle: string;
  anchor: string | null;
  sectionTitle: string;
  snippet: string;
}

/* 全文检索：标题/摘要命中记为章节级（anchor=null，snippet=摘要），正文 SearchEntry 命中记为节级。
   全库（两合集）扫完再截断，保证 fieldwork→sociology、章节序的确定性排序 */
export async function searchKnowledge(query: string, limit = 12): Promise<KnowledgeHit[]> {
  const q = query.trim();
  if (!q) return [];
  const hits: KnowledgeHit[] = [];
  for (const coll of manifest.collections) {
    const body = await loadCollection(coll.id);
    const bodyById = new Map((body?.chapters ?? []).map((ch) => [ch.id, ch]));
    for (const meta of coll.chapters) {
      if (meta.title.includes(q) || meta.abstract.includes(q)) {
        hits.push({
          collectionId: coll.id,
          chapterId: meta.id,
          chapterTitle: meta.title,
          anchor: null,
          sectionTitle: meta.title,
          snippet: truncate(meta.abstract, 80),
        });
      }
      const chap = bodyById.get(meta.id);
      if (!chap) continue;
      for (const s of chap.search) {
        if (s.anchor === null) continue;
        const idx = s.text.indexOf(q);
        if (idx < 0) continue;
        const start = Math.max(0, idx - 20);
        const end = Math.min(s.text.length, idx + q.length + 40);
        hits.push({
          collectionId: coll.id,
          chapterId: meta.id,
          chapterTitle: meta.title,
          anchor: s.anchor,
          sectionTitle: s.title,
          // 截断窗口可能切进【证据标记】，丢弃被切断的残段
          snippet: `${start > 0 ? '…' : ''}${s.text
            .slice(start, end)
            .replace(/【[^】]*$/, '')
            .replace(/^[^【】]*】/, '')}${end < s.text.length ? '…' : ''}`,
        });
      }
    }
  }
  return hits.slice(0, limit);
}

/* ── DOM 渲染层（仅方法论文视图使用；纯静态内容，无 IPC，锁定态可用） ── */

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function badge(kind: MethodCard['badge']): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = `ev ev--${kind}`;
  span.textContent = EVIDENCE_LABELS[kind];
  return span;
}

export interface KnowledgeDeps {
  showView: (name: string) => void;
}

/* 启动时即绑定 showView：场景卡片的「查看完整章节」在任何视图下都能直接跳转 */
export function bindKnowledgeDeps(d: KnowledgeDeps): void {
  deps = d;
}

let inited = false;
let deps: KnowledgeDeps | null = null;
let currentCid: string = COLLECTION_IDS[0] ?? 'fieldwork';
let currentChapterId: string | null = null;

function chapterMeta(cid: string, chapterId: string) {
  return collectionMeta(cid)?.chapters.find((c) => c.id === chapterId) ?? null;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function renderMethodCard(card: MethodCard): HTMLElement {
  const article = document.createElement('article');
  article.className = 'methodcard';
  article.dataset.card = card.id;

  const head = document.createElement('div');
  head.className = 'methodcard__head';
  const title = document.createElement('h4');
  title.textContent = card.title;
  head.append(badge(card.badge), title);
  article.appendChild(head);

  const points = document.createElement('ul');
  points.className = 'methodcard__points';
  for (const point of card.points) {
    const li = document.createElement('li');
    li.textContent = point;
    points.appendChild(li);
  }
  article.appendChild(points);

  const foot = document.createElement('div');
  foot.className = 'methodcard__foot';
  const meta = collectionMeta(card.source.collectionId);
  const chapter = chapterMeta(card.source.collectionId, card.source.chapterId);
  const source = document.createElement('span');
  source.className = 'methodcard__source';
  source.textContent = chapter ? `${meta?.title ?? ''} · ${chapter.title}` : card.source.chapterId;
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn btn--sm';
  openBtn.textContent = '查看完整章节';
  openBtn.addEventListener('click', () => {
    deps?.showView('knowledge');
    void openChapter(card.source.collectionId, card.source.chapterId, card.source.anchor);
  });
  foot.append(source, openBtn);
  article.appendChild(foot);
  return article;
}

/* 三处上下文场景卡片：采集登记（访谈 / 知情同意）+ 档案库备忘录栏 */
export function mountMethodCards(): void {
  const mounts: Record<string, string> = {
    'card-interview': 'interview-guide',
    'card-consent': 'consent-ethics',
    'card-memo': 'memo-coding',
  };
  for (const [mountId, cardId] of Object.entries(mounts)) {
    const mount = el(mountId);
    const card = methodCardById(cardId);
    if (!mount || !card) continue;
    mount.replaceChildren(renderMethodCard(card));
  }
}

/* 学习路径 + 术语表快捷入口（纯静态数据，锁定态可用） */
function renderPaths(): void {
  const box = el('knowledge-paths');
  if (!box) return;
  const chips: HTMLButtonElement[] = manifest.learningPaths.map((p) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pathchip';
    const title = document.createElement('span');
    title.className = 'pathchip__title';
    title.textContent = p.title;
    const meta = document.createElement('span');
    meta.className = 'pathchip__meta';
    const first = p.chapters[0];
    const firstTitle = first
      ? collectionMeta(first.collectionId)?.chapters.find((c) => c.id === first.chapterId)?.title
      : null;
    meta.textContent = `${p.chapters.length} 章 · 从「${truncate(firstTitle ?? p.id, 12)}」开始`;
    chip.append(title, meta);
    chip.addEventListener('click', () => {
      const start = learningPathChapterIds(p.id)[0];
      if (start) void openChapter(start.collectionId, start.chapterId);
    });
    return chip;
  });
  const glossaries = [
    ['fieldwork', '术语表.md', '术语表 · 田野方法'],
    ['sociology', '14-术语/术语.md', '术语表 · 社会学田野'],
  ] as const;
  for (const [cid, sourcePath, label] of glossaries) {
    const ref = findChapterBySourcePath(cid, sourcePath);
    if (!ref) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pathchip pathchip--term';
    chip.textContent = label;
    chip.addEventListener('click', () => {
      void openChapter(cid, ref.chapterId);
    });
    chips.push(chip);
  }
  box.replaceChildren(...chips);
}

/* 上一章 / 下一章翻页 */
function renderPager(cid: string, chapterId: string): void {
  const pager = el('knowledge-pager');
  if (!pager) return;
  const chapters = collectionMeta(cid)?.chapters ?? [];
  const idx = chapters.findIndex((c) => c.id === chapterId);
  const prev = idx > 0 ? chapters[idx - 1] : undefined;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : undefined;
  if (!prev && !next) {
    pager.replaceChildren();
    return;
  }
  const mk = (ch: ChapterMeta | undefined, label: string): HTMLElement => {
    if (!ch) return document.createElement('span');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--sm';
    btn.textContent = `${label} ${truncate(ch.title, 14)}`;
    btn.addEventListener('click', () => {
      void openChapter(cid, ch.id);
    });
    return btn;
  };
  pager.replaceChildren(mk(prev, '‹ 上一章'), mk(next, '下一章 ›'));
}

function renderLegend(): void {
  const box = el('knowledge-legend');
  if (!box) return;
  const entries: MethodCard['badge'][] = ['verify', 'consensus', 'practice'];
  box.replaceChildren(
    ...entries.map((kind) => {
      const row = document.createElement('span');
      row.className = 'knowledge__legend-item';
      row.append(badge(kind), document.createTextNode(EVIDENCE_DESCRIPTIONS[kind]));
      return row;
    }),
  );
}

function renderCollSelect(): void {
  const select = el('knowledge-collection') as HTMLSelectElement | null;
  if (!select) return;
  select.replaceChildren(
    ...manifest.collections.map((c) => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.title;
      return option;
    }),
  );
  select.value = currentCid;
  select.addEventListener('change', () => {
    currentCid = select.value;
    void renderChapterTree();
    void loadFirstChapter();
  });
}

function renderCardsStrip(): void {
  const box = el('knowledge-cards');
  if (!box) return;
  box.replaceChildren(...manifest.cards.map(renderMethodCard));
}

async function renderChapterTree(): Promise<void> {
  const ul = el('knowledge-chapters');
  if (!ul) return;
  const query = (el('knowledge-search') as HTMLInputElement | null)?.value.trim() ?? '';
  const coll = collectionMeta(currentCid);
  const filtered = (coll?.chapters ?? []).filter((c) => {
    if (!query) return true;
    return c.title.includes(query) || c.abstract.includes(query);
  });
  const nodes: HTMLElement[] = [];
  for (const c of filtered) {
    const li = document.createElement('li');
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'selectlist__item';
    if (c.id === currentChapterId) item.classList.add('is-selected');
    const title = document.createElement('span');
    title.className = 'selectlist__title';
    title.textContent = `${String(c.order).padStart(2, '0')} · ${c.title}`;
    const meta = document.createElement('span');
    meta.className = 'selectlist__meta';
    meta.textContent = truncate(c.abstract, 48);
    item.append(title, meta);
    item.addEventListener('click', () => {
      void openChapter(currentCid, c.id);
    });
    li.appendChild(item);
    nodes.push(li);
  }
  if (query) {
    const hits = (await searchKnowledge(query, 20)).filter((h) => h.anchor !== null);
    const divider = document.createElement('li');
    divider.className = 'knowledge__treediv';
    divider.textContent = `正文命中 ${hits.length} 处`;
    nodes.push(divider);
    for (const h of hits) {
      const li = document.createElement('li');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'selectlist__item knowledge__hit';
      const title = document.createElement('span');
      title.className = 'selectlist__title';
      title.textContent = `${h.chapterTitle} · ${h.sectionTitle}`;
      const meta = document.createElement('span');
      meta.className = 'selectlist__meta';
      const collLabel = h.collectionId === 'fieldwork' ? '田野方法' : '社会学田野';
      meta.textContent = `${collLabel} · ${truncate(h.snippet, 56)}`;
      item.append(title, meta);
      item.addEventListener('click', () => {
        void openChapter(h.collectionId, h.chapterId, h.anchor);
      });
      li.appendChild(item);
      nodes.push(li);
    }
  }
  if (nodes.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    const t = document.createElement('span');
    t.className = 'empty__title';
    t.textContent = '没有匹配的章节';
    const p = document.createElement('span');
    p.textContent = '换个关键词，或清空筛选框查看全部章节。';
    li.append(t, p);
    nodes.push(li);
  }
  ul.replaceChildren(...nodes);
}

async function loadFirstChapter(): Promise<void> {
  const first = collectionMeta(currentCid)?.chapters[0];
  if (first) await openChapter(currentCid, first.id, null, false);
}

async function openChapter(
  cid: string,
  chapterId: string,
  anchor?: string | null,
  scrollToContent = true,
): Promise<void> {
  currentCid = cid;
  currentChapterId = chapterId;
  const select = el('knowledge-collection') as HTMLSelectElement | null;
  if (select && select.value !== cid) select.value = cid;

  const body = await loadCollection(cid);
  const chapter = body?.chapters.find((c) => c.id === chapterId);
  const content = el('knowledge-content');
  if (!chapter || !content) return;

  content.replaceChildren();
  const head = document.createElement('div');
  head.className = 'knowledge__chapterhead';
  const meta = chapterMeta(cid, chapterId);
  const h3 = document.createElement('h3');
  h3.textContent = meta ? `${String(meta.order).padStart(2, '0')} · ${meta.title}` : chapterId;
  const sourcePath = document.createElement('span');
  sourcePath.className = 'knowledge__source mono';
  sourcePath.textContent = meta?.sourcePath ?? '';
  head.append(h3, sourcePath);
  content.appendChild(head);

  const article = document.createElement('div');
  article.className = 'knowledge__article';
  /* 构建期 assertSafeHtml 已保证无 <script / javascript:，来源为仓库内文档 */
  article.innerHTML = chapter.html;
  article.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest('a.klink');
    if (!(link instanceof HTMLAnchorElement)) return;
    e.preventDefault();
    const target = link.dataset.target;
    if (!target) return;
    const ref = parseLinkTarget(target);
    if (ref) void openChapter(ref.collectionId, ref.chapterId);
  });
  content.appendChild(article);
  if (anchor) {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (scrollToContent) {
    content.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  renderPager(cid, chapterId);
  renderOutline(cid, chapterId, anchor ?? null);
  void renderChapterTree();
}

function renderOutline(cid: string, chapterId: string, activeAnchor: string | null): void {
  const ul = el('knowledge-outline');
  if (!ul) return;
  const sections = chapterMeta(cid, chapterId)?.outline ?? [];
  if (sections.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '本节无小节';
    ul.replaceChildren(li);
    return;
  }
  ul.replaceChildren(
    ...sections.map((section) => {
      const li = document.createElement('li');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'selectlist__item';
      if (section.id === activeAnchor) item.classList.add('is-selected');
      const title = document.createElement('span');
      title.className = 'selectlist__title';
      title.textContent = section.title;
      item.appendChild(title);
      item.addEventListener('click', () => {
        document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(item);
      return li;
    }),
  );
}

export async function initKnowledge(): Promise<void> {
  if (inited) return;
  inited = true;
  renderLegend();
  renderPaths();
  renderCardsStrip();
  renderCollSelect();
  const search = el('knowledge-search') as HTMLInputElement | null;
  search?.addEventListener('input', () => {
    void renderChapterTree();
  });
  await renderChapterTree();
  await loadFirstChapter();
}
