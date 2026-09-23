import { describe, expect, it } from 'vitest';
import { buildIndex, searchIndex } from '../src/lib/search';

const collections = [
  {
    id: 'fieldwork',
    title: '田野方法 · 方法论语料库',
    chapters: [
      {
        id: '05-访谈',
        title: '访谈',
        order: 5,
        search: [
          { chapterId: '05-访谈', anchor: null, title: '访谈', text: '访谈是田野的核心方法。' },
          { chapterId: '05-访谈', anchor: 'sec-4', title: '提纲与追问', text: '提纲不是问卷。' },
        ],
      },
    ],
  },
  {
    id: 'sociology',
    title: '社会学田野 · 知识库',
    chapters: [
      {
        id: '03-方法--深度访谈',
        title: '深度访谈',
        order: 10,
        search: [
          { chapterId: '03-方法--深度访谈', anchor: null, title: '引言', text: '本章追求意义。' },
        ],
      },
    ],
  },
];

describe('buildIndex', () => {
  it('把合集正文摊平成带合集信息的索引', () => {
    const index = buildIndex(collections);
    expect(index).toHaveLength(3);
    expect(index[0]!.collectionId).toBe('fieldwork');
    expect(index[0]!.chapterTitle).toBe('访谈');
    expect(index[2]!.collectionId).toBe('sociology');
  });
});

describe('searchIndex', () => {
  it('章标题命中 ×3', () => {
    const hits = searchIndex(buildIndex(collections), '深度访谈');
    expect(hits[0]!.score).toBe(3);
    expect(hits[0]!.entry.collectionId).toBe('sociology');
  });

  it('节标题命中 ×2，正文命中 ×1', () => {
    const index = buildIndex(collections);
    expect(searchIndex(index, '提纲与追问')[0]!.score).toBe(2);
    expect(searchIndex(index, '意义')[0]!.score).toBe(1);
  });

  it('无命中返回空，空查询返回空', () => {
    const index = buildIndex(collections);
    expect(searchIndex(index, '不存在词')).toHaveLength(0);
    expect(searchIndex(index, '')).toHaveLength(0);
  });

  it('取 top N 且按分数排序', () => {
    const index = buildIndex(collections);
    const hits = searchIndex(index, '访谈', 2);
    expect(hits.length).toBeLessThanOrEqual(2);
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[hits.length - 1]!.score);
  });
});
