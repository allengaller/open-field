import manifestJson from '@openfield/knowledge/manifest.json';
import { COLLECTION_IDS } from '@openfield/knowledge';
import type { ChapterBody, CollectionFile, KnowledgeManifest } from '@openfield/knowledge';

/* resolveJsonModule 会推导 JSON 字面量类型；这里统一收口为包内类型 */
export const manifest = manifestJson as unknown as KnowledgeManifest;

const collectionCache = new Map<string, CollectionFile>();

/* 合集正文按需动态加载；bare-specifier 模板字面量 Vite 无法静态分析，用静态映射分包 */
const COLLECTION_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  fieldwork: () => import('../knowledge/fieldwork'),
  sociology: () => import('../knowledge/sociology'),
};

export async function loadCollection(cid: string): Promise<CollectionFile | null> {
  const cached = collectionCache.get(cid);
  if (cached) return cached;
  if (!(COLLECTION_IDS as readonly string[]).includes(cid)) return null;
  const loader = COLLECTION_LOADERS[cid];
  if (!loader) return null;
  const file = (await loader()).default as CollectionFile;
  collectionCache.set(cid, file);
  return file;
}

export async function loadChapterBody(cid: string, chapterId: string): Promise<ChapterBody | null> {
  const file = await loadCollection(cid);
  return file?.chapters.find((c) => c.id === chapterId) ?? null;
}
export function collectionMeta(cid: string): KnowledgeManifest['collections'][number] | null {
  return manifest.collections.find((c) => c.id === cid) ?? null;
}

export interface ChapterRef {
  collectionId: string;
  chapterId: string;
}

/* klink 的 data-target（"<collectionId>/<相对路径>.md"）→ 路由参数 */
export function parseLinkTarget(target: string): ChapterRef | null {
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

export function chapterRoute(ref: ChapterRef, anchor?: string | null): string {
  const base = `/c/${ref.collectionId}/${ref.chapterId}`;
  return anchor ? `${base}?to=${anchor}` : base;
}

/* 常驻入口章节：术语表 ×2、田野工具箱（按 sourcePath 解析，避免硬编码 id） */
export function findChapterBySourcePath(cid: string, sourcePath: string): ChapterRef | null {
  const coll = collectionMeta(cid);
  const hit = coll?.chapters.find((c) => c.sourcePath === sourcePath);
  return hit ? { collectionId: cid, chapterId: hit.id } : null;
}

export const GLOSSARY_REFS: ChapterRef[] = [
  findChapterBySourcePath('fieldwork', '术语表.md'),
  findChapterBySourcePath('sociology', '14-术语/术语.md'),
].filter((r): r is ChapterRef => r !== null);

export const TOOLBOX_REF: ChapterRef | null = findChapterBySourcePath('sociology', '12-工具/田野工具箱.md');
