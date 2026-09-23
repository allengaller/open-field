import { marked } from 'marked';
import type { EvidenceCounts, EvidenceKind, OutlineNode } from './index';

const EVIDENCE_RE = /【(核验|通行共识|操作性建议)[^】]*】/g;

export function evidenceKind(label: string): EvidenceKind {
  if (label.startsWith('核验')) return 'verify';
  if (label.startsWith('通行共识')) return 'consensus';
  return 'practice';
}

export function countEvidence(text: string): EvidenceCounts {
  const counts: EvidenceCounts = { verify: 0, consensus: 0, practice: 0 };
  for (const m of text.matchAll(EVIDENCE_RE)) {
    counts[evidenceKind(m[1]!)] += 1;
  }
  return counts;
}

export function dominantEvidence(counts: EvidenceCounts): EvidenceKind {
  if (counts.verify >= counts.consensus && counts.verify >= counts.practice && counts.verify > 0) {
    return 'verify';
  }
  if (counts.practice > counts.consensus) return 'practice';
  return 'consensus';
}

export function stripMarkers(text: string): string {
  return text.replace(EVIDENCE_RE, '').trim();
}

export interface SourceSection {
  id: string | null;
  number: string | null;
  title: string;
  level: 0 | 2 | 3;
  md: string;
}

/* 按源码行切节：intro（无标题）+ 每个 ##/### 一节，#### 及以下并入当前节 */
export function splitSections(md: string, introTitle: string): SourceSection[] {
  const lines = md.split('\n');
  const sections: SourceSection[] = [];
  let current: SourceSection = { id: null, number: null, title: introTitle, level: 0, md: '' };
  let ordinal = 0;

  const flush = (): void => {
    current.md = current.md.replace(/^\n+|\n+$/g, '');
    if (current.md.length > 0) sections.push(current);
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    if (h2 || h3) {
      flush();
      const headingText = (h2 ? h2[1] : h3?.[1]) ?? '';
      const number = headingText.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? null;
      ordinal += 1;
      current = {
        id: number ? `sec-${number}` : `sec-s${ordinal}`,
        number,
        title: stripMarkers(headingText.replace(/^(\d+(?:\.\d+)?)[.．]?\s*/, '')),
        level: h2 ? 2 : 3,
        md: `${line}\n`,
      };
    } else {
      current.md += `${line}\n`;
    }
  }
  flush();
  return sections;
}

export function extractH1(md: string): string | null {
  return md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}

/* H1 之后紧随的连续引用块作为摘要 */
export function extractAbstract(md: string): string {
  const lines = md.split('\n');
  const h1Idx = lines.findIndex((l) => /^#\s+/.test(l));
  if (h1Idx < 0) return '';
  const quotes: string[] = [];
  for (let i = h1Idx + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.startsWith('> ')) {
      quotes.push(line.slice(2).trim());
    } else if (line.trim() === '' && quotes.length === 0) {
      continue;
    } else {
      break;
    }
  }
  return stripMarkers(quotes.join(' ')).replace(/\\n/g, ' ').trim();
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s+([：，。、；）])/g, '$1')
    .trim();
}

export function renderMd(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/* 证据标记 → 徽章 span */
export function decorateEvidence(html: string): string {
  return html.replace(EVIDENCE_RE, (m, label: string) => {
    const kind = evidenceKind(label);
    return `<span class="ev ev--${kind}" data-ev="${kind}">${m}</span>`;
  });
}

export function injectHeadingId(html: string, id: string, level: 2 | 3): string {
  return html.replace(new RegExp(`<h${level}>`), `<h${level} id="${id}">`);
}

const EXTERNAL_RE = /^(https?:)?\/\//i;

export interface LinkContext {
  collectionId: string;
  chapterDir: string;
  collectionRoot: string;
  knownChapters: Set<string>;
}

function normalizeRel(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

export interface RewriteResult {
  html: string;
  missing: number;
}

/* markdown 链接后处理：
   - 外链保留并加 target=_blank
   - 指向已知章节的相对链接 → class=klink + data-target="<collectionId>/<rel>"
   - 解析不到的（README 目录里约 60 个规划中文件）→ 纯文本 span，计 missing */
export function rewriteLinks(html: string, ctx: LinkContext): RewriteResult {
  let missing = 0;
  const out = html.replace(/<a\s+href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (_m, rawHref: string, rest: string, inner: string) => {
    let href = rawHref;
    try {
      href = decodeURIComponent(rawHref);
    } catch {
      /* 保留原值 */
    }
    if (EXTERNAL_RE.test(href) || href.startsWith('mailto:')) {
      return `<a href="${href}" target="_blank" rel="noopener"${rest}>${inner}</a>`;
    }
    const candidates = [normalizeRel(`${ctx.chapterDir}/${href}`), normalizeRel(`${ctx.collectionRoot}/${href}`)];
    const hit = candidates.find((c) => ctx.knownChapters.has(`${ctx.collectionId}/${c}`));
    if (hit) {
      return `<a class="klink" data-target="${ctx.collectionId}/${hit}">${inner}</a>`;
    }
    missing += 1;
    return `<span class="klink--missing">${inner}</span>`;
  });
  return { html: out, missing };
}

export function liTexts(html: string, max: number, maxLen: number): string[] {
  const points: string[] = [];
  for (const m of html.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const text = stripTags(m[1]!);
    if (text.length === 0) continue;
    points.push(text.length > maxLen ? `${text.slice(0, maxLen)}…` : text);
    if (points.length >= max) break;
  }
  return points;
}

export function firstParagraph(html: string, maxLen: number): string {
  const m = html.match(/<p>([\s\S]*?)<\/p>/);
  if (!m) return '';
  const text = stripTags(m[1]!);
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/* 段落级加粗标题（如 "**半结构化访谈提纲**："）——模板型章节的要点来源 */
export function boldHeaders(html: string, max: number): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<p><strong>([\s\S]*?)<\/strong>[：:]?\s*<\/p>/g)) {
    const text = stripTags(m[1]!);
    if (text.length === 0) continue;
    out.push(text.length > 60 ? `${text.slice(0, 60)}…` : text);
    if (out.length >= max) break;
  }
  return out;
}

export function assertSafeHtml(html: string, where: string): void {
  if (/<script/i.test(html) || /javascript:/i.test(html)) {
    throw new Error(`不安全 HTML 输出：${where}`);
  }
}

export function chapterIdOf(relPath: string): string {
  return relPath.replace(/\.md$/, '').replace(/\//g, '--');
}

export function outlineOf(sections: SourceSection[]): OutlineNode[] {
  return sections
    .filter((s) => s.id !== null && (s.level === 2 || s.level === 3))
    .map((s) => ({ id: s.id!, title: s.title, level: s.level as 2 | 3 }));
}
