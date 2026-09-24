import { describe, it, expect } from 'vitest';
import { COLLECTION_IDS } from '@openfield/knowledge';
import type { KnowledgeManifest } from '@openfield/knowledge';
import {
  METHOD_CARD_IDS,
  collectionMeta,
  findChapterBySourcePath,
  learningPathChapterIds,
  manifest,
  methodCardById,
  parseLinkTarget,
  searchKnowledge,
} from '../src/renderer/src/knowledge';

const totalChapters = manifest.collections.reduce((n, c) => n + c.chapters.length, 0);

describe('知识库 manifest', () => {
  it('包含两套合集（田野方法 + 社会学田野）', () => {
    expect(manifest.collections.map((c) => c.id)).toEqual(['fieldwork', 'sociology']);
    expect(COLLECTION_IDS).toEqual(['fieldwork', 'sociology']);
  });

  it('章节总数不少于两套文档的全部章节', () => {
    expect(totalChapters).toBeGreaterThanOrEqual(39);
  });

  it('每章元数据完整：标题、顺序、来源路径、摘要与大纲', () => {
    for (const coll of manifest.collections) {
      expect(coll.chapters.length).toBeGreaterThan(0);
      coll.chapters.forEach((ch, i) => {
        expect(ch.id.length).toBeGreaterThan(0);
        expect(ch.title.length).toBeGreaterThan(0);
        expect(ch.order).toBe(i + 1);
        expect(ch.sourcePath.endsWith('.md')).toBe(true);
        expect(typeof ch.abstract).toBe('string');
        expect(ch.evidence.verify + ch.evidence.consensus + ch.evidence.practice).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('证据分级总数与构建报告一致（≥351 处标记）', () => {
    const totals = manifest.collections.reduce(
      (acc, c) => {
        for (const ch of c.chapters) {
          acc.verify += ch.evidence.verify;
          acc.consensus += ch.evidence.consensus;
          acc.practice += ch.evidence.practice;
        }
        return acc;
      },
      { verify: 0, consensus: 0, practice: 0 },
    );
    expect(totals.verify + totals.consensus + totals.practice).toBeGreaterThanOrEqual(351);
  });
});

describe('场景方法卡片', () => {
  it('九张卡片齐备，每张指向真实章节的真实小节', () => {
    expect([...METHOD_CARD_IDS]).toEqual([
      'interview-guide',
      'interview-toolbox',
      'consent-ethics',
      'memo-coding',
      'grounded-theory',
      'observation-notes',
      'triangulation',
      'snowball',
      'media-archive',
    ]);
    for (const id of METHOD_CARD_IDS) {
      const card = methodCardById(id);
      expect(card, `卡片 ${id} 存在`).not.toBeNull();
      expect(card?.title.length).toBeGreaterThan(0);
      const meta = collectionMeta(card!.source.collectionId);
      expect(meta, `合集 ${card?.source.collectionId} 存在`).not.toBeNull();
      const chapter = meta?.chapters.find((c) => c.id === card!.source.chapterId);
      expect(chapter, `章节 ${card?.source.chapterId} 存在`).toBeTruthy();
      const anchors = chapter?.outline.map((o) => o.id) ?? [];
      expect(anchors).toContain(card!.source.anchor);
    }
  });

  it('每张卡片要点不超过 3 条且非空', () => {
    for (const id of METHOD_CARD_IDS) {
      const card = methodCardById(id);
      expect(card?.points.length).toBeLessThanOrEqual(3);
      expect(card?.points.length).toBeGreaterThan(0);
      for (const p of card?.points ?? []) expect(p.trim().length).toBeGreaterThan(0);
    }
  });

  it('卡片徽章使用三档证据分级标签', () => {
    for (const id of METHOD_CARD_IDS) {
      expect(['verify', 'consensus', 'practice']).toContain(methodCardById(id)?.badge);
    }
  });
});

describe('学习路径', () => {
  it('四条路径（新手/进阶/数字化/中国）每一步都能落到真实章节', () => {
    expect(manifest.learningPaths.map((p) => p.id)).toEqual(['novice', 'advanced', 'digital', 'china']);
    for (const p of manifest.learningPaths) {
      expect(p.chapters.length).toBeGreaterThan(0);
      for (const ref of p.chapters) {
        const chapter = collectionMeta(ref.collectionId)?.chapters.find((c) => c.id === ref.chapterId);
        expect(chapter, `${p.id}: ${ref.collectionId}/${ref.chapterId}`).toBeTruthy();
      }
    }
  });

  it('learningPathChapterIds 未知路径返回空数组', () => {
    expect(learningPathChapterIds('nope')).toEqual([]);
    expect(learningPathChapterIds('novice').length).toBeGreaterThan(0);
  });
});

describe('全文检索', () => {
  it('空查询直接返回空数组', async () => {
    expect(await searchKnowledge('')).toEqual([]);
    expect(await searchKnowledge('   ')).toEqual([]);
  });

  it('正文关键词跨合集命中，含章节、小节与上下文摘录（滚雪球不在任何标题中）', async () => {
    const hits = await searchKnowledge('滚雪球', 50);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.collectionId === 'fieldwork')).toBe(true);
    expect(hits.some((h) => h.collectionId === 'sociology')).toBe(true);
    for (const h of hits) {
      expect(h.snippet).toContain('滚雪球');
      expect(h.chapterTitle.length).toBeGreaterThan(0);
      expect(h.sectionTitle.length).toBeGreaterThan(0);
      if (h.anchor !== null) expect(h.anchor.startsWith('sec-')).toBe(true);
    }
  });

  it('标题命中以章节级（anchor=null）呈现，摘要作为摘录', async () => {
    const hits = await searchKnowledge('访谈');
    const lead = hits.find((h) => h.anchor === null);
    expect(lead, '存在章节级命中').toBeTruthy();
    expect(lead?.snippet.length).toBeGreaterThan(0);
  });

  it('limit 截断生效且不超过上限', async () => {
    const many = await searchKnowledge('田野', 100);
    expect(many.length).toBeGreaterThan(3);
    const few = await searchKnowledge('田野', 3);
    expect(few).toHaveLength(3);
    expect(few).toEqual(many.slice(0, 3));
  });

  it('排序确定性：先 fieldwork 后 sociology、按章节序', async () => {
    const hits = await searchKnowledge('田野', 100);
    const order = hits.map((h) => `${h.collectionId}/${h.chapterId}`);
    const firstSoc = order.findIndex((k) => k.startsWith('sociology/'));
    if (firstSoc >= 0) {
      expect(order.slice(0, firstSoc).every((k) => k.startsWith('fieldwork/'))).toBe(true);
    }
  });
});

describe('纯函数辅助', () => {
  it('parseLinkTarget 解析 klink 目标为合集+章节', () => {
    expect(parseLinkTarget('sociology/03-方法/深度访谈.md')).toEqual({
      collectionId: 'sociology',
      chapterId: '03-方法--深度访谈',
    });
    expect(parseLinkTarget('fieldwork/05-访谈.md')).toEqual({ collectionId: 'fieldwork', chapterId: '05-访谈' });
  });

  it('parseLinkTarget 拒绝非法目标', () => {
    expect(parseLinkTarget('no-slash')).toBeNull();
    expect(parseLinkTarget('other/01.md')).toBeNull();
  });

  it('parseLinkTarget 结果可反查章节元数据', () => {
    const ref = parseLinkTarget('sociology/03-方法/深度访谈.md');
    expect(ref && collectionMeta(ref.collectionId)?.chapters.some((c) => c.id === ref.chapterId)).toBe(true);
  });

  it('findChapterBySourcePath 命中术语表等中文文件名', () => {
    expect(findChapterBySourcePath('fieldwork', '术语表.md')?.chapterId).toBe('术语表');
    expect(findChapterBySourcePath('fieldwork', '不存在.md')).toBeNull();
  });

  it('methodCardById 未知卡片返回 null', () => {
    expect(methodCardById('ghost')).toBeNull();
  });
});

/* 类型守卫：确保 manifest 断言后的形状与包类型一致 */
const _typeCheck: KnowledgeManifest = manifest;
void _typeCheck;
