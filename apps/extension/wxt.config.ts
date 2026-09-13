import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // 输出到可见目录（WXT 默认 .output/ 以点开头，macOS 文件选择框默认不显示，加载已解压扩展时找不到）
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'x-threadpick',
    description: '个人上下文记忆层：多维书签，保存即敢关 Tab',
    // activeTab：快捷键/图标唤起时读取当前活动标签的 url 与 title（无安装警告）
    // tabs：读 pendingUrl 识别「手动新建的空白新标签页」实现可开关的新标签页接管（feat-newtab）
    // webNavigation：兜底手按 Cmd/Ctrl+T 的预渲染新标签页（onCreated 可能不触发或带无效 id），
    // 其安装警告与 tabs 同类（读取浏览记录），合计仍只多这一条
    permissions: ['bookmarks', 'storage', 'activeTab', 'tabs', 'webNavigation'],
    // 设置页允许用户连接自建同步服务器（http/https），扩展上下文内 fetch 需要 host 权限
    host_permissions: ['http://*/*', 'https://*/*'],
    commands: {
      'capture-current-tab': {
        suggested_key: {
          default: 'Ctrl+Shift+S',
          mac: 'Command+Shift+S',
        },
        description: '收藏当前页面到拾绪',
      },
    },
  },
});
