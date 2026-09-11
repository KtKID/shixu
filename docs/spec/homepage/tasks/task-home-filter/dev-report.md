# task-home-filter · dev-report

> task: docs/spec/homepage/tasks/task-home-filter/dev-checklist.md
> 创建: 2026-09-11

## 结果

- task 测试：5/5 🟢 全绿（bookmark-filter.test.ts 20 用例 + FiltersPanel.test.tsx 10 用例 + RecentSection.test.tsx 16 用例，其中含 feat04 既有 12 用例）
- 既有回归：通过（本轮实跑 `pnpm test` 全仓：shared 26/26 + extension 194/194；`pnpm check` 全绿：typecheck + lint + format:check）
- 高风险行：0 行（清单全部 None，无真实链路强制项）

## 测试先行记录（TDD）

- 每行均先写测试并实跑确认失败原因为「功能未实现」（模块缺失/断言找不到元素），再写实现转绿。
- T2 · 场景5 状态维度计数用例首轮预期值算错（基准集含 a、c 两条 inbox，预期误写 1）· 已尝试：核对基准集定义（剔除本维度条件、其余维度保留）后修正测试预期为 2，实现未改。
- T3 · 场景5 联动用例误用不存在的 `screen.contains` · 已尝试：删除该冗余断言（前一行 `getByRole` 已证明 chip 存在）。

## 对账修订（涉及文件列）

- 影响文件树含 `sections/RecentSection.test.tsx`（标 M）但 T3/T4「涉及文件」列原无该文件——已补进 T3（标题切换/清除全部/计数联动的集成断言）与 T4（无命中空态断言）两行；任务描述、场景回指、行状态均未改动。与本 spec task-home-shell 经 x-verify 退回后的同类修订口径一致。

## 范围外关联修复（既有测试，1 处）

- `apps/extension/src/entrypoints/home/sections/ImportSection.test.tsx`（feat03 场景4 用例）· 原 `getByText('Inbox')` 在 feat05 落地后不再唯一（筛选面板状态候选 chips 与收藏卡状态标签同名同文案），全量回归失败于「multiple elements」· 修复：断言限定到收藏卡内（`closest('.bcard')` 后 `toContain('Inbox')`），断言语义不变 · 该文件不在本 task 影响文件树，属本 task 改动的直接涟漪，如实记录。

## 手工 smoke

- 本清单风险列全部 None，无 smoke 强制项；浏览器扩展无法在本工作流环境加载真实浏览器，未做手工 smoke，如实记录。
