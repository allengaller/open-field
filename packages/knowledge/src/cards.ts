export interface CardConfig {
  id: string;
  title: string;
  source: {
    collectionId: 'fieldwork' | 'sociology';
    chapterPath: string;
    /* 章节号（如 "4" / "2.2"）；null = 章首 */
    sectionNumber: string | null;
  };
}

export const CARD_CONFIGS: CardConfig[] = [
  {
    id: 'interview-guide',
    title: '访谈提纲与追问',
    source: { collectionId: 'fieldwork', chapterPath: '05-访谈.md', sectionNumber: '4' },
  },
  {
    id: 'interview-toolbox',
    title: '访谈提纲模板',
    source: { collectionId: 'sociology', chapterPath: '12-工具/田野工具箱.md', sectionNumber: '2.2' },
  },
  {
    id: 'consent-ethics',
    title: '知情同意要点',
    source: { collectionId: 'sociology', chapterPath: '07-伦理/概述.md', sectionNumber: '4' },
  },
  {
    id: 'memo-coding',
    title: '备忘录与编码',
    source: { collectionId: 'sociology', chapterPath: '08-分析/主题编码.md', sectionNumber: '2' },
  },
  {
    id: 'grounded-theory',
    title: '扎根理论要点',
    source: { collectionId: 'sociology', chapterPath: '03-方法/扎根理论.md', sectionNumber: '3' },
  },
  {
    id: 'observation-notes',
    title: '田野笔记骨架',
    source: { collectionId: 'fieldwork', chapterPath: '04-观察与笔记.md', sectionNumber: '3' },
  },
  {
    id: 'triangulation',
    title: '三角验证要点',
    source: { collectionId: 'sociology', chapterPath: '08-分析/概述.md', sectionNumber: '5.2' },
  },
  {
    id: 'snowball',
    title: '抽样与引荐链',
    source: { collectionId: 'fieldwork', chapterPath: '03-进入田野.md', sectionNumber: '4' },
  },
];
