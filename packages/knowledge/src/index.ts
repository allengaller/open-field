export type EvidenceKind = 'verify' | 'consensus' | 'practice';

export interface EvidenceCounts {
  verify: number;
  consensus: number;
  practice: number;
}

export interface OutlineNode {
  id: string;
  title: string;
  level: 2 | 3;
}

export interface ChapterMeta {
  id: string;
  title: string;
  order: number;
  sourcePath: string;
  abstract: string;
  outline: OutlineNode[];
  evidence: EvidenceCounts;
  missingLinks: number;
}

export interface LearningPath {
  id: 'novice' | 'advanced' | 'digital' | 'china';
  title: string;
  route: string;
  chapters: { collectionId: string; chapterId: string }[];
}

export interface MethodCard {
  id: string;
  title: string;
  badge: EvidenceKind;
  points: string[];
  source: { collectionId: string; chapterId: string; anchor: string };
}

export interface CollectionMeta {
  id: 'fieldwork' | 'sociology';
  title: string;
  description: string;
  chapters: ChapterMeta[];
}

export interface KnowledgeManifest {
  version: 1;
  generatedAt: string;
  collections: CollectionMeta[];
  learningPaths: LearningPath[];
  cards: MethodCard[];
}

export interface SearchEntry {
  chapterId: string;
  anchor: string | null;
  title: string;
  text: string;
}

export interface ChapterBody {
  id: string;
  html: string;
  search: SearchEntry[];
}

export interface CollectionFile {
  collectionId: string;
  chapters: ChapterBody[];
}

export const COLLECTION_IDS = ['fieldwork', 'sociology'] as const;

export const COLLECTION_TITLES: Record<(typeof COLLECTION_IDS)[number], string> = {
  fieldwork: '田野方法 · 方法论语料库',
  sociology: '社会学田野 · 知识库',
};
