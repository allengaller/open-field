import type { KnowledgeManifest } from '@openfield/knowledge';

declare module '@openfield/knowledge/manifest.json' {
  const value: KnowledgeManifest;
  export default value;
}
