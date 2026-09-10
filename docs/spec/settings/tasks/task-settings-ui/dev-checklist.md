# task-settings-ui · 开发清单

> spec: docs/spec/settings/spec.md
> 创建: 2026-09-10
> 备注：本 task 由前端负责人执行（视觉与交互基准：docs/assets/settings.html；数据层 API 见 task-extension-settings-store 产出的门面模块与 packages/shared schema）。

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                                             | 场景回指                                                                           | 涉及文件                                 | 风险 | 状态   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------- | ---- | ------ |
| T1  | 设置页骨架：按设计稿布局与视觉（服务器 / 账号 / 分类维度三卡片）                                                                                                 | feat05 场景2                                                                       | apps/extension/src/entrypoints/settings/ | None | [x] 🟢 |
| T2  | 服务器连接卡：地址与端口输入、测试连接交互（连接中/成功/失败、延迟与服务版本展示）                                                                               | feat01 场景1, 场景2, 场景3                                                         | apps/extension/src/entrypoints/settings/ | None | [x] 🟢 |
| T3  | 历史服务器列表：登录成功自动记录、点击切换（切换后自动测试连接）、编辑、删除（当前项删除后地址栏保留）、空态文案                                                 | feat02 场景1, 场景2, 场景3, 场景4, 场景5                                           | apps/extension/src/entrypoints/settings/ | None | [x] 🟢 |
| T4  | 账号卡：登录表单（错误提示「邮箱或密码不正确」、服务器不可用提示）、登录态卡片（头像字母、邮箱、上次同步）、保持登录、退出登录；不出现注册入口                   | feat03 场景1, 场景2, 场景3, 场景4, 场景5, feat04 场景1                             | apps/extension/src/entrypoints/settings/ | None | [x] 🟢 |
| T5  | 分类维度卡：默认集合展示与维度说明（多选/单选标注）、添加取值交互（回车/＋、空值不添加、重复提示、超长提示）、删除取值交互（inbox 保护提示「默认状态不可删除」） | feat05 场景1, 场景2, feat06 场景1, 场景2, 场景3, 场景4, feat07 场景1, 场景2, 场景3 | apps/extension/src/entrypoints/settings/ | None | [x] 🟢 |

## 影响文件树

```text
x-threadpick/
└── apps/extension/src/entrypoints/settings/  U  # glob 待定位：设置页入口（index.html / main.tsx / App.tsx / 组件与样式），按设计稿拆分组件
```
