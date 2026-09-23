import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 内容契约：web 渲染的就是 dist 里预生成 HTML，这里验证管道产物满足渲染前提 */
const DIST = join(import.meta.dirname, '..', '..', '..', 'packages', 'knowledge', 'dist');

const collections = ['fieldwork', 'sociology'] as const;

describe('预生成合集 HTML', () => {
  for (const cid of collections) {
    it(`${cid}: 证据标记已转徽章，死链已降级，无脚本`, () => {
      const file = JSON.parse(readFileSync(join(DIST, 'collection', `${cid}.json`), 'utf8')) as {
        collectionId: string;
        chapters: { id: string; html: string }[];
      };
      expect(file.collectionId).toBe(cid);
      expect(file.chapters.length).toBeGreaterThan(0);

      const allHtml = file.chapters.map((c) => c.html).join('\n');
      expect(allHtml).toContain('<span class="ev ev--verify"');
      expect(allHtml).toContain('<span class="ev ev--consensus"');
      expect(allHtml).toContain('<span class="ev ev--practice"');
      expect(allHtml).toContain('class="klink"');
      expect(allHtml).not.toMatch(/<script/i);
      expect(allHtml).not.toMatch(/javascript:/i);
      /* 标记不应裸露在徽章 span 之外：span 内文本之外的「【核验…】」应为 0 */
      const bare = allHtml
        .replace(/<span class="ev ev--\w+" data-ev="\w+">【[^】]*】<\/span>/g, '')
        .match(/【(?:核验|通行共识|操作性建议)/g);
      expect(bare).toBeNull();
      /* 死链降级为纯文本 span（社会学库 README 规划文件未创建） */
      if (cid === 'sociology') {
        expect(allHtml).toContain('class="klink--missing"');
      }
    });
  }
});
