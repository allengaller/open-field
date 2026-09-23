import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { JSX } from 'react';
import { buildIndex, searchIndex } from '../lib/search';
import type { IndexEntry, SearchHit } from '../lib/search';
import { chapterRoute, loadCollection, manifest } from '../lib/knowledge';

function snippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, 120) + (text.length > 120 ? '…' : '');
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export default function SearchPage(): JSX.Element {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [index, setIndex] = useState<IndexEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadCollection('fieldwork'), loadCollection('sociology')]).then((files) => {
      if (cancelled) return;
      const cols = files
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .map((f) => {
          const metaChapters = manifest.collections.find((c) => c.id === f.collectionId)?.chapters;
          return {
            id: f.collectionId,
            title: manifest.collections.find((c) => c.id === f.collectionId)?.title ?? f.collectionId,
            chapters: f.chapters.map((body) => ({
              title: metaChapters?.find((m) => m.id === body.id)?.title ?? body.id,
              order: metaChapters?.find((m) => m.id === body.id)?.order ?? 0,
              search: body.search,
            })),
          };
        });
      setIndex(buildIndex(cols));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hits: SearchHit[] | null = index ? searchIndex(index, q) : null;

  return (
    <div className="page">
      <header className="viewhead">
        <h1>搜索</h1>
        <p>{q.length > 0 ? `“${q}” 的全文检索结果` : '输入关键词，跨两套合集全文检索。'}</p>
      </header>
      {q.length > 0 && !index && <p className="mono muted">检索索引加载中…</p>}
      {q.length > 0 && index && hits !== null && (
        <>
          <p className="mono muted">{hits.length} 条结果</p>
          <ol className="hits">
            {hits.map((hit, i) => {
              const ref = { collectionId: hit.entry.collectionId, chapterId: hit.entry.chapterId };
              return (
                <li key={`${hit.entry.chapterId}-${hit.entry.anchor ?? 'top'}-${i}`} className="hit">
                  <Link className="hit__title" to={chapterRoute(ref, hit.entry.anchor)}>
                    {hit.entry.chapterTitle}
                    {hit.entry.anchor && hit.entry.title !== hit.entry.chapterTitle ? (
                      <span className="hit__section"> · {hit.entry.title}</span>
                    ) : null}
                  </Link>
                  <p className="hit__snippet">{snippet(hit.entry.text, q)}</p>
                  <span className="mono hit__meta">
                    {hit.entry.collectionTitle}
                    {hit.entry.anchor ? ` · ${hit.entry.title}` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
