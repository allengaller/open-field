import { describe, expect, it } from 'vitest';
import {
  assertSafeHtml,
  chapterIdOf,
  countEvidence,
  dominantEvidence,
  evidenceKind,
  extractAbstract,
  firstParagraph,
  injectHeadingId,
  liTexts,
  rewriteLinks,
  splitSections,
  stripTags,
} from '../src/parse';

describe('证据标记', () => {
  it('解析三种主标记及变体', () => {
    expect(evidenceKind('核验')).toBe('verify');
    expect(evidenceKind('核验·结构')).toBe('verify');
    expect(evidenceKind('核验书目')).toBe('verify');
    expect(evidenceKind('通行共识')).toBe('consensus');
    expect(evidenceKind('操作性建议')).toBe('practice');
  });

  it('计数', () => {
    const counts = countEvidence('【核验】与【核验·结构】是核验，【通行共识】是共识，【操作性建议】是建议。');
    expect(counts).toEqual({ verify: 2, consensus: 1, practice: 1 });
  });

  it('主导徽章取最大者，全零回落共识', () => {
    expect(dominantEvidence({ verify: 3, consensus: 1, practice: 1 })).toBe('verify');
    expect(dominantEvidence({ verify: 0, consensus: 2, practice: 5 })).toBe('practice');
    expect(dominantEvidence({ verify: 0, consensus: 0, practice: 0 })).toBe('consensus');
  });
});

describe('分节', () => {
  const md = [
    '# 示例章',
    '',
    '> 一句摘要',
    '',
    'intro 段落。',
    '',
    '## 4. 提纲与追问 【操作性建议】',
    '',
    '- 提纲不是问卷',
    '',
    '### 2.2 访谈提纲模板',
    '',
    '正文。',
    '',
    '## 参考文献',
    '',
    '条目。',
  ].join('\n');

  it('intro 与编号小节切分', () => {
    const sections = splitSections(md, '示例章');
    expect(sections[0]!.level).toBe(0);
    expect(sections[0]!.title).toBe('示例章');
    const ids = sections.filter((s) => s.id).map((s) => s.id);
    /* 无编号标题按出现顺序取 ordinal（只计标题，不计 intro）→ sec-s3 */
    expect(ids).toEqual(['sec-4', 'sec-2.2', 'sec-s3']);
    const s4 = sections.find((s) => s.id === 'sec-4')!;
    expect(s4.title).toBe('提纲与追问');
    expect(s4.md).toContain('提纲不是问卷');
  });

  it('摘要提取剥掉标记', () => {
    const abstract = extractAbstract('# 标题\n\n> 【核验】一段摘要文字\n\n正文');
    expect(abstract).toBe('一段摘要文字');
  });
});

describe('链接改写', () => {
  const ctx = {
    collectionId: 'sociology',
    chapterDir: '03-方法',
    collectionRoot: '.',
    knownChapters: new Set(['sociology/08-分析/概述.md', 'sociology/07-伦理/概述.md']),
  };

  it('已知章节 → klink + data-target', () => {
    const { html, missing } = rewriteLinks(
      '<p>详见<a href="../08-%E5%88%86%E6%9E%90/%E6%A6%82%E8%BF%B0.md">质性数据分析</a></p>',
      ctx,
    );
    expect(missing).toBe(0);
    expect(html).toContain('class="klink" data-target="sociology/08-分析/概述.md"');
    expect(html).toContain('质性数据分析');
  });

  it('未知章节 → 纯文本 span，计 missing', () => {
    const { html, missing } = rewriteLinks('<p>见<a href="02-理论/functionalism.md">功能主义</a></p>', ctx);
    expect(missing).toBe(1);
    expect(html).toContain('<span class="klink--missing">功能主义</span>');
  });

  it('外链保留并加 target=_blank', () => {
    const { html, missing } = rewriteLinks('<a href="https://example.com/x">外链</a>', ctx);
    expect(missing).toBe(0);
    expect(html).toContain('target="_blank" rel="noopener"');
  });

  it('根相对链接按合集根解析（实践指南场景）', () => {
    const { html } = rewriteLinks('<a href="03-%E6%96%B9%E6%B3%95/%E6%B7%B1%E5%BA%A6%E8%AE%BF%E8%B0%88.md">深度访谈</a>', {
      ...ctx,
      chapterDir: '',
      knownChapters: new Set(['sociology/03-方法/深度访谈.md']),
    });
    expect(html).toContain('data-target="sociology/03-方法/深度访谈.md"');
  });
});

describe('HTML 工具', () => {
  it('stripTags 还原实体', () => {
    expect(stripTags('<p>a &amp; b &lt;c&gt;</p>')).toBe('a & b <c>');
  });

  it('liTexts 截断并限量', () => {
    const html = '<ul><li>第一条</li><li>第二条</li><li>第三条</li><li>第四条</li></ul>';
    expect(liTexts(html, 3, 120)).toEqual(['第一条', '第二条', '第三条']);
    expect(liTexts('<ul><li>' + '长'.repeat(130) + '</li></ul>', 3, 120)[0]).toHaveLength(121);
  });

  it('firstParagraph', () => {
    expect(firstParagraph('<p>引言正文</p><p>第二段</p>', 120)).toBe('引言正文');
  });

  it('injectHeadingId 只改第一个匹配', () => {
    expect(injectHeadingId('<h2>4. 提纲</h2><h2>5. 其他</h2>', 'sec-4', 2)).toBe(
      '<h2 id="sec-4">4. 提纲</h2><h2>5. 其他</h2>',
    );
  });

  it('chapterIdOf 把斜杠换成双连字符', () => {
    expect(chapterIdOf('03-方法/深度访谈.md')).toBe('03-方法--深度访谈');
    expect(chapterIdOf('术语表.md')).toBe('术语表');
  });

  it('assertSafeHtml 拦截 script 与 javascript:', () => {
    expect(() => assertSafeHtml('<p>ok</p>', 'x')).not.toThrow();
    expect(() => assertSafeHtml('<script>x</script>', 'x')).toThrow();
    expect(() => assertSafeHtml('<a href="javascript:alert(1)">x</a>', 'x')).toThrow();
  });
});
