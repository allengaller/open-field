import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { JSX } from 'react';
import type { ChapterBody } from '@openfield/knowledge';
import { chapterRoute, parseLinkTarget } from '../lib/knowledge';

/* 预生成 HTML 直接注入（构建期已断言无 script / javascript:）。
   .klink 点击在容器上委托；pre>code 运行时补复制按钮。 */
export default function ChapterBodyView({ body, className }: { body: ChapterBody; className?: string }): JSX.Element {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const pre of Array.from(root.querySelectorAll('pre'))) {
      if (pre.querySelector('.copybtn')) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copybtn';
      btn.textContent = '复制';
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent ?? '';
        void navigator.clipboard.writeText(code).then(() => {
          btn.textContent = '已复制';
          window.setTimeout(() => {
            btn.textContent = '复制';
          }, 1500);
        });
      });
      pre.appendChild(btn);
    }
  }, [body]);

  return (
    <div
      ref={ref}
      className={className ? `content ${className}` : 'content'}
      lang="zh-CN"
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest('.klink');
        if (el instanceof HTMLElement) {
          const target = el.dataset.target;
          const ref2 = target ? parseLinkTarget(target) : null;
          if (ref2) navigate(chapterRoute(ref2));
        }
      }}
      dangerouslySetInnerHTML={{ __html: body.html }}
    />
  );
}
