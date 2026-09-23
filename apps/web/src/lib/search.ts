import type { SearchEntry } from '@openfield/knowledge';

export interface IndexEntry extends SearchEntry {
  collectionId: string;
  collectionTitle: string;
  chapterTitle: string;
  chapterOrder: number;
}

export interface SearchHit {
  entry: IndexEntry;
  score: number;
}

/* 检索输入：正文里的 SearchEntry + manifest 提供的章标题与序号 */
export interface SearchableChapter {
  title: string;
  order: number;
  search: SearchEntry[];
}

/* 检索索引：合集正文（节级 SearchEntry）+ manifest 章元数据 */
export function buildIndex(
  collections: { id: string; title: string; chapters: SearchableChapter[] }[],
): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const coll of collections) {
    for (const chapter of coll.chapters) {
      for (const e of chapter.search) {
        entries.push({
          ...e,
          collectionId: coll.id,
          collectionTitle: coll.title,
          chapterTitle: chapter.title,
          chapterOrder: chapter.order,
        });
      }
    }
  }
  return entries;
}

/* 打分：章标题命中 ×3、节标题命中 ×2、正文命中 ×1；取前 limit 条 */
export function searchIndex(index: IndexEntry[], query: string, limit = 20): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const entry of index) {
    let score = 0;
    if (entry.chapterTitle.toLowerCase().includes(q)) score += 3;
    if (entry.title.toLowerCase().includes(q)) score += 2;
    if (entry.text.toLowerCase().includes(q)) score += 1;
    if (score > 0) hits.push({ entry, score });
  }
  hits.sort((a, b) => b.score - a.score || a.entry.chapterOrder - b.entry.chapterOrder);
  return hits.slice(0, limit);
}
