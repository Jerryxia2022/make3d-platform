# Phase06-A3-C1 Parser Metrics And Real-order Preflight Final

执行时间：2026-07-18 07:41:57 +08:00

## 结论

Phase06-A3-C1 已完成。

- 已修复 PrusaSlicer G-code parser 不应把未知材料重量表示为 `0` 的问题。
- 已补齐重量来源、尺寸来源、warning severity、Workbench 输入校验 HTTP 422 语义。
- 已加入项目自有 20mm cube STL fixture，并用正式 Bambu P1S profile 在 WSL 本地完成真实 PrusaSlicer + Parser 验证。
- 已完成生产只读 counts / integrity / foreign key 检查，前后 counts 一致。
- 已完成真实订单只读 preflight；当前未找到非 TEST 且已 verified/local_synced 的 STL/3MF 候选订单。
- 未切片真实客户文件，未创建线上 slicing_job，未修改订单、报价、货期、留言、支付、退款、微信支付、上传限制或生产 env。

是否允许进入 Phase06-A3-C2：暂不建议进入，原因是 `eligible_for_manual_real_order_trial=false`，当前只读 API 列表未找到满足条件的真实订单候选。

## 基线

- Release worktree：`C:\Users\21899\Documents\make3d-platform-phase06-a2-rc`
- 基线 commit：`1dd53a8f69f05f3de0019e9e934dd7b50b411886`
- Node：`v22.22.3`
- npm：`10.9.8`
- 本阶段未提交 release commit，未 push，未部署生产。

## 修改文件

Release worktree 代码变更：

- `worker/prusaslicer-result-parser.mjs`
- `worker/make3d-slicing-worker.mjs`
- `worker/order-workbench/lib/localSlicing.mjs`
- `worker/order-workbench/lib/render.mjs`
- `worker/order-workbench/server.mjs`
- `src/backend/workerSlicingApi.ts`
- `src/backend/workerSlicingJobs.ts`
- `src/backend/database.ts`
- `tests/prusaslicerResultParser.test.mjs`
- `tests/orderWorkbenchLocalDraftsAndSlicing.test.mjs`
- `tests/workerSlicingApi.test.mjs`
- `tests/workerSlicingClient.test.mjs`
- `tests/workerSlicingJobs.test.mjs`
- `tests/workerSlicingRecovery.test.mjs`
- `scripts/generate-prusaslicer-fixtures.mjs`
- `tests/fixtures/prusaslicer/20mm-cube.stl`

主项目报告体系变更：

- `reports/phase06-a3-c1-parser-metrics-and-real-order-preflight-final.md`
- `changelog/CHANGELOG.md`

## G-code 字段审计

对 synthetic fixture 的实际 PrusaSlicer 2.7.2 输出只读审计，未记录完整 G-code：

- 存在：`filament used [mm]`
- 存在：`filament used [cm3]`
- 存在：`total filament used [g]`
- 存在但值为 0：`filament_density`
- 存在：`filament_diameter`
- 存在：`estimated printing time (normal mode)`
- 存在：`estimated printing time (silent mode)`
- 存在：`filament_type`
- 存在：`printer_model`
- 存在：`nozzle_diameter`
- 存在：`layer_height`

关键发现：Ubuntu 官方 PrusaSlicer 2.7.2 + 当前 profile 对本 synthetic cube 输出 `total filament used [g] = 0.00` 且 `filament_density = 0`，因此 parser 必须拒绝直接使用 0 克，并在材料明确时使用受控材料默认密度 fallback。

## 重量解析规则

新的解析顺序：

1. 若 G-code 中 `filament used [g]` 或 `total filament used [g]` 为正数，直接使用，source=`gcode_direct`。
2. 若直接重量缺失、为 0 或无效，但存在 `filament used [mm]`、`filament_diameter`、有效 `filament_density`，按圆截面积和密度计算，source=`calculated_from_length_density`。
3. 若 G-code `filament_density` 缺失或为 0，且 `slice_params.material` 明确为项目内已知材料，使用项目材料默认密度计算，并记录 NON_BLOCKING warning。
4. 多 extruder 长度、直径、密度按索引计算后求和。
5. 无法可靠计算时返回 `null`，source=`unavailable`，并生成 `BLOCKING` warning。

拒绝：

- `NaN`
- `Infinity`
- 负数
- 不合理超大值
- 使用 `0` 代表未知

## 尺寸来源规则

Parser 新增：

```json
{
  "dimensions": {
    "x_mm": 32.714,
    "y_mm": 32.714,
    "z_mm": 20,
    "source": "gcode_bounds"
  }
}
```

允许 source：

- `gcode_bounds`
- `cloud_file_geometry`
- `unavailable`

优先级：

1. 完整 G-code X/Y/Z bounds。
2. 若 G-code X/Y 不完整，使用已验证上传几何 `bounding_box_x/y/z`。
3. 若仅部分 G-code 尺寸可用且无上传几何，则保留部分来源并要求人工确认。

Workbench 页面区分显示：

- Upload model dimensions
- Slicing output range

## Parser 状态和 Warning 分级

`metrics_status` 更新为：

- `ok`
- `warning`
- `error`

warning severity：

- `NON_BLOCKING`
- `MANUAL_REVIEW_REQUIRED`
- `BLOCKING`

必要指标：

- `print_time_seconds > 0`
- `material_weight_grams > 0`
- `gcode_size_bytes > 0`
- `gcode_sha256` 合法
- 尺寸来自 G-code 或已验证上传几何

说明：云端 Worker Slicing API 保持服务器字段白名单，不接收 parser 的展示字段 `dimensions` / `warning_details`；只接受既有结果字段，并新增兼容 `ok/warning/error` 与新 weight source。

## 合成 Fixture

- 路径：`tests/fixtures/prusaslicer/20mm-cube.stl`
- 生成脚本：`scripts/generate-prusaslicer-fixtures.mjs`
- 类型：项目自有 ASCII STL
- 尺寸：20mm x 20mm x 20mm
- facet 数：12
- SHA-256：`f5c3087986cbf6aa9545894e75c8ed173a8ff44c6e7978de933a36c1b68355ab`

该 fixture 未下载第三方模型，未使用客户文件。

## Fixture 实际切片结果

运行环境：

- WSL Ubuntu-24.04
- 运行用户：`make3d-worker`
- PrusaSlicer：`2.7.2+dfsg-1build2`
- Profile：`/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini`
- Profile SHA-256：`4437bf3e44534004aa51db7c6de16c13c130f62de3cd3b14d52194a7eb4f6e0f`
- 全局 flock：`/srv/make3d-worker/order-workbench/prusaslicer.lock`

最终通过的 synthetic run：

- Local fixture job id：`60630171812`
- Input size：`1517`
- Input SHA-256：`f5c3087986cbf6aa9545894e75c8ed173a8ff44c6e7978de933a36c1b68355ab`
- PrusaSlicer exit code：`0`
- Slice duration：`226 ms`
- G-code path：`/srv/make3d-worker/results/prusaslicer/60630171812/attempt-1/output.gcode`
- G-code size：`284994`
- G-code SHA-256：`11760c078333153a77d6b90d2fcd1e9a8c806983691890489dee2751e0d5d1ac`
- Parse status：`parsed`
- Metrics status：`ok`
- Parser quote ready：`true`
- Print time：`1496 seconds`
- Material weight：`6.313 g`
- Weight source：`calculated_from_length_density`
- Dimensions：`32.714 / 32.714 / 20 mm`
- Dimensions source：`gcode_bounds`

Warnings：

- `NON_BLOCKING`: duplicate `prusaslicer_config`
- `NON_BLOCKING`: explicit filament weight is zero; attempted calculated weight
- `NON_BLOCKING`: `filament_density` unavailable; used material default density for PLA
- `NON_BLOCKING`: layer count derived from markers
- `NON_BLOCKING`: max Z derived from markers

Post-check：

- PrusaSlicer process count：`0`
- Slicing Worker process count：`0`
- flock holder count：`0`
- `.part` residual：none under the final run output directory
- `make3d-file-sync-worker.service`：`active`
- file-sync Worker PID：`287`
- file-sync Worker NRestarts：`0`

## HTTP 校验语义修复

Workbench 本地表单输入错误从 HTTP 500 改为 HTTP 422：

- 非 integer cents
- 负价格
- 货期 min/max 无效
- 状态值非法
- 模板非法
- 文本超长
- sync job id 非法

测试确认：

- 无效价格返回 `422`
- 无效货期返回 `422`
- 上一次有效草稿保留
- 错误页面不泄露 token、路径或客户敏感字段

## 生产只读 Counts

使用 SSH 进入生产主机后，通过运行中容器内 Node `node:sqlite` 以 read-only + `PRAGMA query_only=ON` 读取生产 SQLite。未写文件，未写数据库，未重启服务。

前置只读 counts：

```json
{
  "orders": 22,
  "files": 24,
  "local_file_sync_jobs": 13,
  "slicing_jobs": 13,
  "slicing_job_attempts": 21,
  "order_payments": 8,
  "wechat_refunds": 3,
  "payment_settings": 1,
  "approval_audit_records": 0,
  "production_candidates": 0,
  "production_candidate_audit_events": 0
}
```

后置只读 counts：

```json
{
  "orders": 22,
  "files": 24,
  "local_file_sync_jobs": 13,
  "slicing_jobs": 13,
  "slicing_job_attempts": 21,
  "order_payments": 8,
  "wechat_refunds": 3,
  "payment_settings": 1,
  "approval_audit_records": 0,
  "production_candidates": 0,
  "production_candidate_audit_events": 0
}
```

DB health：

- `integrity_check=ok`
- `foreign_key_check_count=0`

结论：本阶段生产业务表 counts 前后无变化。

## 真实订单只读 Preflight

只读 API：

- `GET /api/operator/workbench/orders?limit=100&sync_status=verified`
- `GET /api/operator/workbench/orders/:id`

结果：

- Token：存在但未输出
- Server host：`www.make3d.com.cn`
- 是否选中真实订单：`false`
- `eligible_for_manual_real_order_trial=false`
- 原因：未找到非 TEST 且已 verified/local_synced 的 STL/3MF 订单文件候选。

未记录：

- 客户姓名
- 手机
- 邮箱
- 微信
- 备注原文
- 完整文件名
- 完整 SHA
- 绝对客户文件路径

未执行：

- 真实客户文件切片
- 真实客户 slicing_job 创建
- 订单/报价/货期/留言写入

## Operator Console 测试情况

当前 release worktree 中未找到 `tests/operatorConsole*.test.mjs`。

判断：

- 当前正式 release baseline 不包含该测试文件。
- 本阶段未修改 Operator Console。
- 不从脏工作树复制未审核测试进入 release commit。
- 不阻塞本阶段，但后续如继续扩展 Operator Console，应先恢复或正式纳入对应测试基线。

## 测试结果

Focused regression：

- Phase06-A3/A2 + Parser + Worker Slicing + file-sync：`137/137` passed
- `tests/workerSlicingRecovery.test.mjs`：`8/8` passed

Full regression：

- `npm test`：`393/393` passed
- `npm run lint`：passed
- `npm run build`：passed

## 生产影响

无生产部署。

无以下行为：

- 修改生产 env
- 修改生产订单
- 修改生产报价
- 修改生产货期
- 新增线上留言
- 通知客户
- 修改支付、退款、微信支付
- 修改上传限制
- 创建线上 `slicing_job`
- 切片真实客户文件
- 启动常驻 Slicing Worker
- 创建 Slicing Worker systemd service

## 风险

- 当前 parser 在 `filament_density=0` 时使用项目材料默认密度 fallback；这适合人工报价参考，但仍应在 UI/报告中保留来源和 warning。
- G-code bounds 的 X/Y 范围可能包含 brim/skirt/toolpath 外扩，因此页面必须称为 Slicing output range，不得当成上传模型原始尺寸。
- 真实订单 preflight 当前没有候选，Phase06-A3-C2 需要等待至少一个非 TEST 真实订单文件同步完成。

## 回滚方法

本阶段未部署生产，无需生产回滚。

本地代码回滚：

1. 在 release worktree 中还原本阶段改动文件。
2. 删除 `scripts/generate-prusaslicer-fixtures.mjs` 和 `tests/fixtures/prusaslicer/20mm-cube.stl`。
3. 重跑 `npm test`, `npm run lint`, `npm run build`。

本地 WSL 测试产物可保留为审计证据；如需清理，仅清理 synthetic fixture 路径：

- `/srv/make3d-worker/test-fixtures/phase06-a3-c1`
- `/srv/make3d-worker/results/prusaslicer/60630171812`

不得清理 `/srv/make3d-worker/files` 下客户同步文件。

## 下一阶段建议

暂不进入 Phase06-A3-C2。

进入条件建议：

1. 至少存在 1 个非 TEST 真实订单。
2. 文件类型为 STL 或 3MF。
3. `sync_status=verified` 或 `local_synced`。
4. 本地文件存在，size 和 SHA 均匹配。
5. 材料、颜色、数量完整。
6. 只读 preflight 输出 `eligible_for_manual_real_order_trial=true`。
7. 用户明确批准 Guarded Real Order Manual One-shot Trial。
