/* 视图路由：侧栏切换 + 各视图的加载器注册表。视图模块自注册（registerViewLoader），
   router 不反向 import 视图，避免 main ↔ views 循环依赖。 */

const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.rail__link'));
const views = Array.from(document.querySelectorAll<HTMLElement>('.view'));

const loaders = new Map<string, () => void | Promise<void>>();

export function registerViewLoader(name: string, loader: () => void | Promise<void>): void {
  loaders.set(name, loader);
}

export function showView(name: string): void {
  for (const btn of navButtons) {
    const active = btn.dataset.view === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  for (const view of views) {
    view.classList.toggle('is-active', view.id === `view-${name}`);
  }
  void loaders.get(name)?.();
}

for (const btn of navButtons) {
  btn.addEventListener('click', () => showView(btn.dataset.view ?? 'overview'));
}
