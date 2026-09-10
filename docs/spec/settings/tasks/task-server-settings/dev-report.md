# task-server-settings · dev-report

> task: docs/spec/settings/tasks/task-server-settings/dev-checklist.md
> 创建: 2026-09-10

## 结果

- task 测试：7/7 🟢 全绿（`pnpm smoke-settings` 真实链路验证：healthz 版本 → GET taxonomy epoch seed → PUT 新版生效 → PUT 旧版被拒（LWW）→ sync pull/push 含 taxonomy → 不带 taxonomy 的旧式 push 兼容）
- 既有回归：通过（原书签 smoke「登录→推送→拉取」通过；全仓 check 三项全绿；扩展 chrome-mv3 / firefox-mv2 构建通过）
- 高风险行：3 行（T2 建表、T5 taxonomy LWW、T6 sync 协议变更）均含真实链路 smoke 验证，非仅 unit
- task-protocol-schema 遗留的两条高风险行（Status 契约变更、sync 向后兼容）在本 task T7 smoke 中完成真实链路闭环
