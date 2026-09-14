import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // 输出到可见目录（WXT 默认 .output/ 以点开头，macOS 文件选择框默认不显示，加载已解压扩展时找不到）
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '拾绪',
    description: '个人上下文记忆层：多维书签，保存即敢关 Tab',
    // activeTab：快捷键/图标唤起时读取当前活动标签的 url 与 title（无安装警告）
    // tabs：读 pendingUrl 识别「手动新建的空白新标签页」实现可开关的新标签页接管（feat-newtab）
    // webNavigation：兜底手按 Cmd/Ctrl+T 的预渲染新标签页（onCreated 可能不触发或带无效 id），
    // 其安装警告与 tabs 同类（读取浏览记录），合计仍只多这一条
    permissions: ['bookmarks', 'storage', 'activeTab', 'tabs', 'webNavigation'],
    // host 权限仅日常构建需要：连接用户自建的同步服务器（http/https）+ 站点图标回填要 fetch 目标页面；
    // 商店无账号版（--mode store）是纯本地数据，在下方 build:manifestGenerated hook 里整体移除
    host_permissions: ['http://*/*', 'https://*/*'],
    icons: {
      '16': '/icons/icon-16.png',
      '32': '/icons/icon-32.png',
      '48': '/icons/icon-48.png',
      '128': '/icons/icon-128.png',
    },
    action: {
      default_icon: {
        '16': '/icons/icon-16.png',
        '32': '/icons/icon-32.png',
      },
    },
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
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      // Firefox 固定 gecko id：AMO 签名与后续更新都绑定该身份，商店首发前定下、之后不可再改
      if (wxt.config.browser === 'firefox') {
        manifest.browser_specific_settings = {
          gecko: { id: 'x-threadpick@ktkid.dev' },
        };
      }
      // 商店无账号版（--mode store）：去掉全部 host 权限，安装零警告、审查面最小
      if (wxt.config.mode === 'store') {
        if ('host_permissions' in manifest) delete manifest.host_permissions;
        // MV2（Firefox）会把 host 模式并进 permissions 数组，一并滤掉
        manifest.permissions = manifest.permissions?.filter(
          (p) => !(p.startsWith('http://') || p.startsWith('https://')),
        );
      }
    },
  },
});
