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
    permissions: ['bookmarks', 'storage', 'activeTab'],
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
