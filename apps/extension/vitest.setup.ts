import 'fake-indexeddb/auto';

// browser / chrome 全局由 WxtVitest 插件的 virtual:wxt-setup 注入 fakeBrowser；
// 这里只补 IndexedDB（Dexie 依赖），与真实扩展环境对齐。
