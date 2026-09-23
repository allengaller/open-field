import type { LearningPath } from './index';

/* docs/社会学田野/README.md 「快速入门路径」四条，逐行解析并映射到各板块首个章节文件 */
const PATH_IDS: LearningPath['id'][] = ['novice', 'advanced', 'digital', 'china'];

export function parseLearningPaths(
  readmeMd: string,
  firstChapterOfDir: (dirNumber: string) => { collectionId: string; chapterId: string } | null,
): LearningPath[] {
  const lines = readmeMd.split('\n').filter((l) => /^\d+\.\s+\*\*.+?\*\*：\s*[\d]/.test(l));
  const paths: LearningPath[] = [];
  for (const [i, line] of lines.entries()) {
    const m = line.match(/^\d+\.\s+\*\*(.+?)\*\*：\s*([\d\s→]+)（(.+?)）\s*$/);
    if (!m) continue;
    const id = PATH_IDS[i];
    if (!id) break;
    const dirNumbers = m[2]!.match(/\d+/g) ?? [];
    const chapters = dirNumbers
      .map((n) => firstChapterOfDir(n))
      .filter((c): c is { collectionId: string; chapterId: string } => c !== null);
    paths.push({ id, title: m[1]!, route: '/c/sociology', chapters });
  }
  return paths;
}
