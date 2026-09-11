/**
 * 「扩展选项」跳转 stub（homepage feat01 场景3）：整页打开插件主页并落在「最近新增」。
 * 原独立导入器页与设置页已删除——功能都在主页左侧导航里；
 * 导入功能由 task-home-import 在主页重建，其间短暂无导入入口属预期中间态。
 */
window.location.replace(browser.runtime.getURL('/home.html#recent'));
