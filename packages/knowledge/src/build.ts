import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_CONFIGS } from './cards';
import {
  chapterIdOf,
  countEvidence,
  decorateEvidence,
  dominantEvidence,
  extractAbstract,
  extractH1,
  firstParagraph,
  injectHeadingId,
  liTexts,
  boldHeaders,
  renderMd,
  rewriteLinks,
  splitSections,
  assertSafeHtml,
  stripTags,
} from './parse';
import { parseLearningPaths } from './paths';
import type {
  ChapterBody,
  ChapterMeta,
  CollectionFile,
  KnowledgeManifest,
  LearningPath,
  MethodCard,
  OutlineNode,
} from './index';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

interface CollectionDef {
  id: 'fieldwork' | 'sociology';
  title: string;
  description: string;
  root: string;
}

const COLLECTIONS: CollectionDef[] = [
  {
    id: 'fieldwork',
    title: '田野方法 · 方法论语料库',
    description: '12 章田野方法论语料：定义、学派、进入田野、观察笔记、访谈、分析、伦理与写作模板。',
    root: join(REPO_ROOT, 'docs', '田野方法'),
  },
  {
    id: 'sociology',
    title: '社会学田野 · 知识库',
    description: '15 板块学术知识库：社会学理论、研究方法、中国田野、数字民族志、研究伦理、编码分析与经典案例。',
    root: join(REPO_ROOT, 'docs', '社会学田野'),
  },
];

/* 章节选取规则（两库通用，保证确定性排序）：
   1) 顶层编号文件 NN-*.md；2) 编号子目录内 *.md；3) 顶层其余 .md（README 除外）；4) 其余子目录内 *.md */
function listChapterPaths(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true }).map((e) => ({
    name: e.name,
    isDir: e.isDirectory(),
  }));
  const numberedFiles = entries.filter((e) => !e.isDir && /^\d+-/.test(e.name) && e.name.endsWith('.md')).map((e) => e.name);
  const numberedDirs = entries.filter((e) => e.isDir && /^\d+-/.test(e.name)).map((e) => e.name);
  const otherFiles = entries
    .filter((e) => !e.isDir && e.name.endsWith('.md') && e.name !== 'README.md' && !/^\d+-/.test(e.name))
    .map((e) => e.name);
  const otherDirs = entries.filter((e) => e.isDir && !/^\d+-/.test(e.name)).map((e) => e.name);
  const filesIn = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name)
      .sort()
      .map((n) => `${dir}/${n}`);

  return [
    ...numberedFiles.sort(),
    ...numberedDirs.sort().flatMap(filesIn),
    ...otherFiles.sort(),
    ...otherDirs.sort().flatMap(filesIn),
  ];
}

interface RenderedChapter {
  meta: ChapterMeta;
  body: ChapterBody;
  sectionHtmlByNumber: Map<string, string>;
}

function renderChapter(coll: CollectionDef, relPath: string, knownChapters: Set<string>): RenderedChapter {
  const md = readFileSync(join(coll.root, relPath), 'utf8');
  const title = extractH1(md) ?? relPath;
  const chapterId = chapterIdOf(relPath);
  const chapterDir = dirname(relPath) === '.' ? '' : dirname(relPath);
  const sections = splitSections(md, title);

  let missing = 0;
  const htmlParts: string[] = [];
  const outline: OutlineNode[] = [];
  const search: ChapterBody['search'] = [];
  const sectionHtmlByNumber = new Map<string, string>();

  for (const section of sections) {
    let html = decorateEvidence(renderMd(section.md));
    if (section.id !== null && section.level !== 0) {
      html = injectHeadingId(html, section.id, section.level);
      outline.push({ id: section.id, title: section.title, level: section.level });
      search.push({ chapterId, anchor: section.id, title: section.title, text: stripTags(html) });
      if (section.number) sectionHtmlByNumber.set(section.number, html);
    } else if (section.level === 0 && html.trim().length > 0) {
      search.push({ chapterId, anchor: null, title, text: stripTags(html) });
    }
    const r = rewriteLinks(html, { collectionId: coll.id, chapterDir, collectionRoot: '.', knownChapters });
    missing += r.missing;
    htmlParts.push(r.html);
  }

  const html = htmlParts.join('\n');
  assertSafeHtml(html, `${coll.id}/${relPath}`);

  const meta: ChapterMeta = {
    id: chapterId,
    title,
    order: 0,
    sourcePath: relPath,
    abstract: extractAbstract(md),
    outline,
    evidence: countEvidence(md),
    missingLinks: missing,
  };
  const body: ChapterBody = { id: chapterId, html, search };
  return { meta, body, sectionHtmlByNumber };
}

function buildCard(cfg: (typeof CARD_CONFIGS)[number], chapters: Map<string, RenderedChapter>): MethodCard {
  const key = `${cfg.source.collectionId}/${cfg.source.chapterPath}`;
  const chapter = chapters.get(key);
  if (!chapter) throw new Error(`卡片章节缺失：${key}`);
  const meta = chapter.meta;
  const anchor = cfg.source.sectionNumber ? `sec-${cfg.source.sectionNumber}` : meta.outline[0]?.id ?? '';
  const node = meta.outline.find((o) => o.id === anchor);
  if (!node) throw new Error(`卡片小节缺失：${key}#${anchor}`);
  /* 目标节的内容通常在其子小节（### x.y）中，按文档序聚合整个 h2 子树 */
  let html: string;
  if (cfg.source.sectionNumber) {
    const parts: string[] = [];
    for (const [num, secHtml] of chapter.sectionHtmlByNumber) {
      if (num === cfg.source.sectionNumber || num.startsWith(`${cfg.source.sectionNumber}.`)) {
        parts.push(secHtml);
      }
    }
    html = parts.join('\n');
  } else {
    html = chapter.body.html;
  }
  if (!html) throw new Error(`卡片小节内容缺失：${key}#${anchor}`);
  let points = liTexts(html, 3, 120);
  if (points.length === 0) points = boldHeaders(html, 3);
  if (points.length === 0) {
    const p = firstParagraph(html, 120);
    if (p.length > 0) points = [p];
  }
  if (points.length === 0) throw new Error(`卡片无要点：${cfg.id}`);
  return {
    id: cfg.id,
    title: cfg.title,
    badge: dominantEvidence(countEvidence(html)),
    points,
    source: { collectionId: cfg.source.collectionId, chapterId: meta.id, anchor },
  };
}

function main(): void {
  const manifestChapters: KnowledgeManifest['collections'] = [];
  const collectionFiles: CollectionFile[] = [];
  const chaptersByKey = new Map<string, RenderedChapter>();
  let sociologyFirstByDir: Map<string, { chapterId: string }> | null = null;

  for (const coll of COLLECTIONS) {
    const relPaths = listChapterPaths(coll.root);
    const knownChapters = new Set(relPaths.map((p) => `${coll.id}/${p}`));
    const rendered = relPaths.map((p, i) => {
      const r = renderChapter(coll, p, knownChapters);
      r.meta.order = i + 1;
      chaptersByKey.set(`${coll.id}/${p}`, r);
      return r;
    });

    if (coll.id === 'sociology') {
      /* 学习路径映射：板块号 NN → 该板块首个章节文件 */
      sociologyFirstByDir = new Map();
      for (const [i, p] of relPaths.entries()) {
        const m = p.match(/^(\d+)-/);
        if (m && !sociologyFirstByDir.has(m[1]!)) {
          sociologyFirstByDir.set(m[1]!, { chapterId: rendered[i]!.meta.id });
        }
      }
    }

    manifestChapters.push({
      id: coll.id,
      title: coll.title,
      description: coll.description,
      chapters: rendered.map((r) => r.meta),
    });
    collectionFiles.push({ collectionId: coll.id, chapters: rendered.map((r) => r.body) });
  }

  const readme = readFileSync(join(COLLECTIONS[1]!.root, 'README.md'), 'utf8');
  const learningPaths: LearningPath[] = parseLearningPaths(readme, (n) => {
    const hit = sociologyFirstByDir?.get(n);
    return hit ? { collectionId: 'sociology', chapterId: hit.chapterId } : null;
  });

  const cards = CARD_CONFIGS.map((cfg) => buildCard(cfg, chaptersByKey));

  const manifest: KnowledgeManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    collections: manifestChapters,
    learningPaths,
    cards,
  };

  mkdirSync(join(OUT_DIR, 'collection'), { recursive: true });
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of collectionFiles) {
    writeFileSync(join(OUT_DIR, 'collection', `${file.collectionId}.json`), `${JSON.stringify(file)}\n`);
  }

  const totalChapters = manifestChapters.reduce((n, c) => n + c.chapters.length, 0);
  const totalMissing = manifestChapters.reduce(
    (n, c) => n + c.chapters.reduce((m, ch) => m + ch.missingLinks, 0),
    0,
  );
  const markers = manifestChapters.reduce(
    (n, c) =>
      n +
      c.chapters.reduce((m, ch) => m + ch.evidence.verify + ch.evidence.consensus + ch.evidence.practice, 0),
    0,
  );
  console.log(
    `knowledge build: ${COLLECTIONS.length} collections, ${totalChapters} chapters, ${markers} evidence markers, ${totalMissing} missing links neutralized, ${cards.length} cards, ${learningPaths.length} learning paths`,
  );
}

main();
