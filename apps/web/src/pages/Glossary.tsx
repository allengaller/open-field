import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { ChapterBody } from '@openfield/knowledge';
import { GLOSSARY_REFS, loadChapterBody, manifest } from '../lib/knowledge';
import ChapterBodyView from '../components/ChapterBodyView';

export default function Glossary(): JSX.Element {
  const [bodies, setBodies] = useState<(ChapterBody | null)[]>(GLOSSARY_REFS.map(() => null));

  useEffect(() => {
    let cancelled = false;
    void Promise.all(GLOSSARY_REFS.map((ref) => loadChapterBody(ref.collectionId, ref.chapterId))).then((bs) => {
      if (!cancelled) setBodies(bs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <header className="viewhead">
        <h1>术语表</h1>
        <p>两套语料的术语对照与关键概念。</p>
      </header>
      {GLOSSARY_REFS.map((ref, i) => {
        const meta = manifest.collections.find((c) => c.id === ref.collectionId)?.chapters.find((c) => c.id === ref.chapterId);
        return (
          <section key={ref.collectionId} className="gloss">
            <h2 className="gloss__title">
              {meta?.title ?? ref.chapterId}
              <span className="mono gloss__src">{meta?.sourcePath}</span>
            </h2>
            {bodies[i] ? <ChapterBodyView body={bodies[i]!} /> : <p className="mono muted">加载中…</p>}
          </section>
        );
      })}
    </div>
  );
}
