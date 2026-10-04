/* DOM 工具与跨视图共享的小部件：状态读出行、toast、数字动画、空态行、标签等。
   所有视图模块从这里取 DOM 助手，不再各自维护一份。 */

export const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺元素 #${id}`);
  return el;
};

export function input(id: string): HTMLInputElement {
  return $(id) as HTMLInputElement;
}

export function button(id: string): HTMLButtonElement {
  return $(id) as HTMLButtonElement;
}

const statusEl = $('status') as HTMLPreElement;

export function setReadout(text: string, tone?: 'is-error' | 'is-ok'): void {
  statusEl.textContent = text;
  statusEl.classList.remove('is-error', 'is-ok');
  if (tone) statusEl.classList.add(tone);
}

export function toast(message: string): void {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'alert');
  const text = message.length > 160 ? `${message.slice(0, 160)}…` : message;
  el.textContent = `无法完成：${text}`;
  box.appendChild(el);
  window.setTimeout(() => el.remove(), 6000);
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function tickNumber(el: HTMLElement, target: number): void {
  if (reduceMotion || target === 0) {
    el.textContent = String(target);
    return;
  }
  const start = performance.now();
  const dur = 400;
  const step = (now: number): void => {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = String(Math.round(target * p));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export async function withLoading(btn: HTMLButtonElement, fn: () => Promise<void>): Promise<void> {
  btn.classList.add('is-loading');
  btn.disabled = true;
  try {
    await fn();
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

export function emptyRow(title: string, line: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'empty';
  const t = document.createElement('span');
  t.className = 'empty__title';
  t.textContent = title;
  const p = document.createElement('span');
  p.textContent = line;
  li.append(t, p);
  return li;
}

export function tag(text: string, tone?: 'ok' | 'withdrawn' | 'accent'): HTMLElement {
  const el = document.createElement('span');
  el.className = tone ? `tag tag--${tone}` : 'tag';
  el.textContent = text;
  return el;
}

export function detailLine(parts: (string | undefined)[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'detail__line';
  const [first, ...rest] = parts.filter((p): p is string => p !== undefined && p !== '');
  const b = document.createElement('b');
  b.textContent = first ?? '';
  el.appendChild(b);
  if (rest.length > 0) {
    el.appendChild(document.createTextNode(` · ${rest.join(' · ')}`));
  }
  return el;
}

export function clearElement(el: HTMLElement): void {
  el.textContent = '';
}
