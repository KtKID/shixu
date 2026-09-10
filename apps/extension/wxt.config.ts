import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'x-threadpick',
    description: '个人上下文记忆层：多维书签，保存即敢关 Tab',
    permissions: ['bookmarks', 'storage'],
    // 设置页允许用户连接自建同步服务器（http/https），扩展上下文内 fetch 需要 host 权限
    host_permissions: ['http://*/*', 'https://*/*'],
    options_ui: {
      open_in_tab: true,
    },
  },
});
