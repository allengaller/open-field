import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { JSX } from 'react';
import type { ChapterBody, EvidenceCounts } from '@openfield/knowledge';
import { collectionMeta, loadChapterBody, manifest } from '../lib/knowledge';
import ChapterBodyView from '../components/ChapterBodyView';

const EVIDENCE_LABELS: Record<keyof EvidenceCounts, string> = {
  verify: '核验',
  consensus: '通行共识',
  practice: '操作性建议',
};

function EvidenceChips({ counts }: { counts: EvidenceCounts }): JSX.Element {
  return (
    <span className="evrow">
      {(Object.keys(EVIDENCE_LABELS) as (keyof EvidenceCounts)[]).map((k) =>
        counts[k] > 0 ? (
          <span key={k} className={`ev ev--${k}`}>
            {EVIDENCE_LABELS[k]} {counts[k]}
          </span>
        ) : null,
      )}
    </span>
  );
}

export default function Collection(): JSX.Element {
  const { cid = '', chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const to = searchParams.get('to');
  const [body, setBody] = useState<ChapterBody | null>(null);
  const [missing, setMissing] = useState(false);

  const meta = collectionMeta(cid);
  const chapterMeta = meta?.chapters.find((c) => c.id === chapterId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setBody(null);
    setMissing(false);
    if (!cid || !chapterId) return;
    void loadChapterBody(cid, chapterId).then((b) => {
      if (cancelled) return;
      if (b) setBody(b);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [cid, chapterId]);

  useEffect(() => {
    if (!body || !to) return;
    requestAnimationFrame(() => {
      document.getElementById(to)?.scrollIntoView({ block: 'start' });
    });
  }, [body, to]);

  if (!meta) {
    return (
      <div className="page">
        <h1>合集不存在</h1>
        <p>
          回到<Link to="/">首页</Link>。
        </p>
      </div>
    );
  }

  const idx = chapterMeta ? meta.chapters.indexOf(chapterMeta) : -1;
  const prev = idx > 0 ? meta.chapters[idx - 1]! : null;
  const next = idx >= 0 && idx < meta.chapters.length - 1 ? meta.chapters[idx + 1]! : null;
  const other = manifest.collections.find((c) => c.id !== meta.id);

  return (
    <div className="coll">
      <aside className="coll__tree" aria-label="章节目录">
        {other && (
          <Link className="coll__switch" to={`/c/${other.id}`}>
            {other.title} ↗
          </Link>
        )}
        <ol className="tree">
          {meta.chapters.map((ch) => (
            <li key={ch.id}>
              <Link className={`tree__item${ch.id === chapterId ? ' is-active' : ''}`} to={`/c/${meta.id}/${ch.id}`}>
                <span className="mono tree__num">{String(ch.order).padStart(2, '0')}</span>
                <span>{ch.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      </aside>

      <div className="coll__main">
        {!chapterId && (
          <div className="page">
            <header className="viewhead">
              <h1>{meta.title}</h1>
              <p>{meta.description}</p>
            </header>
            <div className="chapters">
              {meta.chapters.map((ch) => (
                <Link key={ch.id} className="chaptercard" to={`/c/${meta.id}/${ch.id}`}>
                  <span className="mono chaptercard__num">{String(ch.order).padStart(2, '0')}</span>
                  <span className="chaptercard__title">{ch.title}</span>
                  <span className="chaptercard__abstract">{ch.abstract}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {chapterId && !chapterMeta && (
          <div className="page">
            <h1>章节不存在</h1>
            <p>
              回到<Link to={`/c/${meta.id}`}>{meta.title}</Link>目录。
            </p>
          </div>
        )}

        {chapterId && chapterMeta && (
          <article className="page chapter">
            <header className="chapter__head">
              <h1>{chapterMeta.title}</h1>
              <div className="chapter__meta">
                <EvidenceChips counts={chapterMeta.evidence} />
                <span className="mono chapter__src">{chapterMeta.sourcePath}</span>
              </div>
              {chapterMeta.abstract.length > 0 && <p className="chapter__abstract">{chapterMeta.abstract}</p>}
            </header>
            {missing && <p>章节内容加载失败。</p>}
            {body ? <ChapterBodyView body={body} /> : <p className="mono muted">加载中…</p>}
            <nav className="chapter__pager" aria-label="章节翻页">
              {prev ? (
                <Link className="pager__link" to={`/c/${meta.id}/${prev.id}`}>
                  ← {prev.title}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link className="pager__link pager__link--next" to={`/c/${meta.id}/${next.id}`}>
                  {next.title} →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </article>
        )}
      </div>

      {chapterId && chapterMeta && chapterMeta.outline.length > 0 && (
        <aside className="coll__outline" aria-label="本节大纲">
          <div className="outline">
            <div className="outline__title">本节大纲</div>
            {chapterMeta.outline.map((node) => (
              <a
                key={node.id}
                className={`outline__link${node.level === 3 ? ' outline__link--l3' : ''}`}
                href={`#${node.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(node.id)?.scrollIntoView({ block: 'start' });
                }}
              >
                {node.title}
              </a>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
