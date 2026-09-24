import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CollectionFile, KnowledgeManifest } from '../src/index';

/* dist 为提交入库的产物；此测试在 CI（无预构建链）下校验其存在与形状 */
const dist = join(import.meta.dirname, '..', 'dist');

describe('构建产物', () => {
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')) as KnowledgeManifest;

  it('manifest 形状与规模', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.collections.map((c) => c.id)).toEqual(['fieldwork', 'sociology']);
    const total = manifest.collections.reduce((n, c) => n + c.chapters.length, 0);
    expect(total).toBeGreaterThanOrEqual(39);
    for (const coll of manifest.collections) {
      for (const ch of coll.chapters) {
        expect(ch.title.length).toBeGreaterThan(0);
        expect(ch.order).toBeGreaterThan(0);
      }
    }
  });

  it('每章至少有一条搜索条目且纯文本非空', () => {
    for (const id of manifest.collections.map((c) => c.id)) {
      const file = JSON.parse(readFileSync(join(dist, 'collection', `${id}.json`), 'utf8')) as CollectionFile;
      expect(file.collectionId).toBe(id);
      expect(file.chapters.length).toBeGreaterThan(0);
      for (const ch of file.chapters) {
        expect(ch.search.length).toBeGreaterThan(0);
        const text = ch.search.map((s) => s.text).join('');
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it('卡片章节与锚点全部可解析', () => {
    expect(manifest.cards.length).toBe(9);
    for (const card of manifest.cards) {
      const coll = manifest.collections.find((c) => c.id === card.source.collectionId);
      const chapter = coll?.chapters.find((ch) => ch.id === card.source.chapterId);
      expect(chapter, card.id).toBeDefined();
      expect(chapter!.outline.some((o) => o.id === card.source.anchor), `${card.id}#${card.source.anchor}`).toBe(true);
      expect(card.points.length).toBeGreaterThan(0);
    }
  });

  it('学习路径 4 条且章节可解析', () => {
    expect(manifest.learningPaths.map((p) => p.id)).toEqual(['novice', 'advanced', 'digital', 'china']);
    for (const path of manifest.learningPaths) {
      expect(path.chapters.length).toBeGreaterThan(0);
      for (const ref of path.chapters) {
        const coll = manifest.collections.find((c) => c.id === ref.collectionId);
        expect(coll?.chapters.some((ch) => ch.id === ref.chapterId), ref.chapterId).toBe(true);
      }
    }
  });
});
