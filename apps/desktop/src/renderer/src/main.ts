/* 启动装配：字体/样式 → 各视图模块（自注册到路由）→ 知识库视图 → 全局监听。
   业务逻辑全部位于 ./views/* 与 ./knowledge，本文件不再持有任何视图代码。 */
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';

import { bindKnowledgeDeps, initKnowledge, mountMethodCards } from './knowledge';
import { registerViewLoader, showView } from './router';
import { loadSettings, refreshStatus } from './views/vault';
import { refreshPending } from './views/inbox';
import './views/registry';
import './views/danger';
import './views/mock';
import './views/verify';
import './views/archive';
import './views/research';
import { setReadout } from './ui';

registerViewLoader('knowledge', initKnowledge);

window.addEventListener('unhandledrejection', (e) => {
  const message = e.reason instanceof Error ? e.reason.message : String(e.reason);
  setReadout(`错误：${message}`, 'is-error');
});

void refreshStatus().then(() => {
  void refreshPending();
  void loadSettings();
});
bindKnowledgeDeps({ showView });
mountMethodCards();
window.openfield.onInboxChanged(() => {
  void refreshPending();
  void refreshStatus();
});

// A37 自动锁定广播：关库后回到锁定态，与手动操作路径共用刷新逻辑
window.openfield.onVaultLocked(() => {
  setReadout('会话已自动锁定：输入口令重新打开资料库', 'is-error');
  void refreshStatus();
});
