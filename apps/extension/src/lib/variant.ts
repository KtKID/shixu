/**
 * 构建变体开关：`--mode store`（商店无账号版）编译为 false，其余（production/development/test）恒为 true。
 * store 变体面向浏览器商店首发：不含账号/同步/服务器连接，且无 host 权限——
 * 跨站 fetch（站点图标回填）一并关停，卡片走首字母兜底；manifest 侧的 host 权限移除见 wxt.config.ts。
 */
export const ACCOUNT_FEATURES = import.meta.env.MODE !== 'store';
