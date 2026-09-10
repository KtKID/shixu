# task-extension-settings-store · 开发清单

> spec: docs/spec/settings/spec.md
> 创建: 2026-09-10

**状态**：`[ ] ⏳` 未开始 / `[ ] ▶️` 进行中 / `[x] 🟢` 验证通过 / `[!] 🔴` 验证失败

| #   | 任务                                                                                                                                               | 场景回指                                                                           | 涉及文件                                                                  | 风险                               | 状态   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- | ------ |
| T1  | 设置存取门面（TDD）：browser.storage.local 单 key 读写，SettingsSchema 校验；无记录返回默认值                                                      | feat02 场景5                                                                       | apps/extension/src/db/settings.ts, apps/extension/src/db/settings.test.ts | None                               | [ ] ⏳ |
| T2  | 登录会话与历史服务器（TDD）：登录成功自动记录历史（≤20、带 lastLoginAt）并设 activeServerUrl；读取会话；退出清除 session（本地书签与取值不动）     | feat02 场景1, feat03 场景4, feat04 场景1                                           | apps/extension/src/db/settings.ts, apps/extension/src/db/settings.test.ts | None                               | [ ] ⏳ |
| T3  | taxonomy 本地管理（TDD）：Dexie 表 + 首次 epoch seed；增删取值函数（去首尾空格、≤30 字、维度内去重、'inbox' 不可删除；删除取值不改动任何书签数据） | feat05 场景1, feat06 场景1, 场景2, 场景3, 场景4, 场景5, feat07 场景1, 场景2, 场景3 | apps/extension/src/db/taxonomy.ts, apps/extension/src/db/taxonomy.test.ts | None                               | [ ] ⏳ |
| T4  | taxonomy 登录同步：登录后 pull 与本地 LWW 对齐（后改者胜）；本地修改 push 到服务器                                                                 | feat08 场景1, 场景2, 场景3                                                         | apps/extension/src/sync/taxonomy.ts                                       | 高:冲突取舍逻辑，需 e2e/smoke 验证 | [ ] ⏳ |

## 影响文件树

```text
x-threadpick/
└── apps/extension/
    ├── package.json            M  # devDeps 加测试环境依赖（fake-indexeddb、wxt/testing 相关）
    └── src/
        ├── db/
        │   ├── settings.ts     U  # 新增：设置/会话/历史服务器存取门面
        │   ├── settings.test.ts U  # 新增：对应单测
        │   ├── taxonomy.ts     U  # 新增：本地 taxonomy 表与增删管理函数
        │   └── taxonomy.test.ts U  # 新增：对应单测
        └── sync/taxonomy.ts    U  # 新增：登录后 taxonomy 拉取对齐与推送
```
