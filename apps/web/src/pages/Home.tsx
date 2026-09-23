import { Link } from 'react-router-dom';
import type { JSX } from 'react';
import type { EvidenceCounts } from '@openfield/knowledge';
import { GLOSSARY_REFS, TOOLBOX_REF, chapterRoute, manifest } from '../lib/knowledge';

const EVIDENCE_LABELS: Record<keyof EvidenceCounts, string> = {
  verify: '核验',
  consensus: '通行共识',
  practice: '操作性建议',
};

function Legend(): JSX.Element {
  return (
    <div className="legend">
      {(
        [
          ['verify', 'ev--verify'],
          ['consensus', 'ev--consensus'],
          ['practice', 'ev--practice'],
        ] as const
      ).map(([kind, cls]) => (
        <span key={kind} className="legend__item">
          <span className={`ev ${cls}`}>{EVIDENCE_LABELS[kind]}</span>
        </span>
      ))}
    </div>
  );
}

export default function Home(): JSX.Element {
  const collections = manifest.collections;
  return (
    <div className="page">
      <section className="hero">
        <h1>田野调查知识库</h1>
        <p className="hero__lede">
          两套田野调查与社会学研究语料：方法论语料库与 15 板块学术知识库。全部内容证据分级、离线可读，
          与 OpenField 桌面端的采集、登记、归档流程一体贯通。
        </p>
        <Legend />
      </section>

      <section className="homegrid" aria-label="知识合集">
        {collections.map((coll) => {
          const totals = coll.chapters.reduce<EvidenceCounts>(
            (acc, ch) => ({
              verify: acc.verify + ch.evidence.verify,
              consensus: acc.consensus + ch.evidence.consensus,
              practice: acc.practice + ch.evidence.practice,
            }),
            { verify: 0, consensus: 0, practice: 0 },
          );
          return (
            <Link key={coll.id} className="card" to={`/c/${coll.id}`}>
              <h2>{coll.title}</h2>
              <p>{coll.description}</p>
              <div className="card__meta">
                <span className="mono">{coll.chapters.length} 章</span>
                <span className="mono">核验 {totals.verify} · 共识 {totals.consensus} · 建议 {totals.practice}</span>
              </div>
            </Link>
          );
        })}
      </section>

      <section aria-label="方法卡">
        <h2 className="secttitle">方法卡</h2>
        <div className="homegrid">
          {manifest.cards.map((card) => (
            <article key={card.id} className="card mcard">
              <div className="mcard__head">
                <span className={`ev ev--${card.badge}`}>{EVIDENCE_LABELS[card.badge]}</span>
                <h3>{card.title}</h3>
              </div>
              <ul className="mcard__points">
                {card.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link className="chip" to={chapterRoute(card.source, card.source.anchor)}>
                查看完整章节
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="学习路径">
        <h2 className="secttitle">学习路径</h2>
        <div className="homegrid">
          {manifest.learningPaths.map((path) => (
            <article key={path.id} className="card">
              <h3>{path.title}</h3>
              <p className="mono card__route">{path.route}</p>
              <div className="chips">
                {path.chapters.map((ref, i) => {
                  const coll = collections.find((c) => c.id === ref.collectionId);
                  const chapter = coll?.chapters.find((c) => c.id === ref.chapterId);
                  return chapter ? (
                    <Link key={`${ref.chapterId}-${i}`} className="chip" to={chapterRoute(ref)}>
                      {chapter.title}
                    </Link>
                  ) : null;
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="快捷入口">
        <h2 className="secttitle">快捷入口</h2>
        <div className="chips">
          {GLOSSARY_REFS.map((ref) => (
            <Link key={ref.collectionId} className="chip" to={chapterRoute(ref)}>
              术语表 · {ref.collectionId === 'fieldwork' ? '田野方法' : '社会学'}
            </Link>
          ))}
          {TOOLBOX_REF && (
            <Link className="chip" to={chapterRoute(TOOLBOX_REF)}>
              田野工具箱
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
