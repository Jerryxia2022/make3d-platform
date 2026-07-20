# Phase08 STEP Quote And Local Order Sort Repair Final

## 1. 执行结论

- 日期：2026-07-20
- 基线 Commit：`e2d0890c0464ef1331523064e1a761a2905f8507`
- 实现 Commit：`997e85883ba1ba91dc29faec5503bc40de76f7ef`
- 分支：`codex/feat-home-step-manual-quote-local-sync`
- 结果：`04NF13.step` 继续成功，`04NF14.step` 已完成转换、修复、切片、指标解析和自动报价。
- 本地订单工作台在没有排序参数时默认按 `created_at DESC, id DESC` 排列；显式选择其他排序方式时保持用户选择。
- 未部署生产应用，未修改生产数据库、订单、上传文件、支付、退款、微信支付或报价公式。

## 2. 失败复现与准确根因

生产历史记录显示，`04NF14.step` 已通过文件校验和 STEP 转 STL，随后在网格尺寸分析阶段失败，错误为：

```text
RangeError: Maximum call stack size exceeded
```

旧实现把 STL 的全部坐标收集到数组，再调用 `Math.max(...axis)` / `Math.min(...axis)`。`04NF14` 有 65,710 个三角面，约 197,130 个顶点坐标，展开参数超过 JavaScript 调用栈限制；`04NF13` 只有 6,094 个三角面，因此未触发该问题。

根因不在 STEP 下载、格式校验、单位识别、转换器或 PrusaSlicer 切片。修复前对两个原文件执行完全相同流程的结果为：

| 文件 | STEP 转 STL | 三角面 | 尺寸分析 |
| --- | --- | ---: | --- |
| `04NF13.step` | 成功 | 6,094 | 成功 |
| `04NF14.step` | 成功 | 65,710 | `Maximum call stack size exceeded` |

## 3. 两个 STEP 文件的关键差异

两个文件都是 STEP Part 21、AP214 `AUTOMOTIVE_DESIGN`、单位 mm、单 Solid、单 Closed Shell。原始文件与服务器上传文件 SHA-256 完全一致，排除了下载损坏。

| 项目 | `04NF13.step` | `04NF14.step` |
| --- | ---: | ---: |
| 原文件字节数 | 491,641 | 554,399 |
| 原文件 SHA-256 | `69f6108bada07a1f6698300c13b1db23fd53ab5127e5b257566bf464d281e290` | `dfe4fa136edb66ab7be7edf61785c3914369c99e9e7810511b209626fbf4fef3` |
| STEP 实体记录数 | 6,310 | 6,568 |
| Solid / Closed Shell | 1 / 1 | 1 / 1 |
| Advanced Face | 219 | 209 |
| B-Spline Surface | 11 | 28 |
| 初次网格三角面 | 6,094 | 65,710 |
| 初次网格状态 | 流形 | 非流形、2 条开放边、2 个退化面被转换器移除 |

`04NF14` 除了规模约为 `04NF13` 的 10.8 倍，还带有可安全修复的轻微拓扑问题。首次转换能完整保留一个实体和原始尺寸；第二次受控 STL 导出将其规范化为 65,708 个三角面的流形网格。

## 4. 核心修复

1. STL 尺寸计算改为单次遍历、逐点更新 XYZ 最小值和最大值，不再展开大型数组。
2. 连通分量并查集由递归查找改为迭代路径压缩和按秩合并，避免复杂模型再次触发递归栈风险。
3. STEP 校验增加 schema、单位、实体、Solid、Closed/Open Shell、Surface、Advanced Face 和 B-Spline 统计。
4. 转换前后均调用 PrusaSlicer `--info`，校验实体数、三角面数和 XYZ 尺寸；XYZ 比例容差为 0.1%，不猜测、不缩放单位。
5. 对开放边、非流形或退化面执行至多一次受控网格修复导出；修复后仍异常则返回 `STEP_TOPOLOGY_UNREPAIRABLE`。
6. 转换、检查和修复共用一个总截止时间；不无限重试。输出先写 `.part.stl`，校验成功后原子发布，失败时清理临时文件。
7. 报价 API 增加分阶段结构化诊断日志及明确错误码，保留受限、脱敏的 stdout/stderr，不记录模型正文或密钥。
8. 未增加备用转换器。主转换器对两个有效 STEP 都能正确工作，`04NF14` 只需要同工具的一次安全 Shape Healing/网格规范化路径。

## 5. 转换尺寸与网格结果

| 文件 | STEP 原始 XYZ（mm） | 最终 STL XYZ（mm） | XYZ 比例 | 最终三角面 | 最终网格 |
| --- | --- | --- | --- | ---: | --- |
| `04NF13.step` | 30.950279 x 140.005646 x 173.512131 | 30.950279 x 140.005646 x 173.512131 | 1 / 1 / 1 | 6,094 | 流形，无开放边/退化面 |
| `04NF14.step` | 138 x 60 x 174 | 138 x 60 x 174 | 1 / 1 / 1 | 65,708 | 修复后流形，无开放边/退化面 |

未发生 10 倍、25.4 倍或 1000 倍尺寸误差，也未丢失多实体。最终 `04NF14` 派生 STL 为 3,285,484 字节，SHA-256 为 `4094115809cef2f31ab9be363dca36fc57434e09b0567d37e65c8c879a021284`。

## 6. 实际切片与报价

环境：WSL Ubuntu 24.04，Ubuntu 软件包 PrusaSlicer 2.7.2，项目既有配置，0.4 mm 喷嘴、0.2 mm 层高、50% 填充；材料参数为 PETG、数量 1。

| 文件 | G-code 大小 | 材料重量 | 打印时间 | 材料费 | 工时费 | 自动切片基础打印价 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `04NF13.step` | 7,777,025 B | 98.7425 g | 26,952 s（7:29:12） | ¥19.75 | ¥11.23 | ¥30.98 |
| `04NF14.step` | 14,592,929 B | 287.1851 g | 64,059 s（17:47:39） | ¥57.44 | ¥26.69 | ¥84.13 |

以上价格是 `/api/quote/slice` 返回的自动切片基础打印价，没有改动材料费、工时费、包装费、数量或订单总价公式。页面中的文件小计可能包含订单级费用分摊；订单最终应付总价还取决于当前草稿中的其他文件、配送和发票选择。

## 7. 前端与接口验收

在隔离的本地生产构建中完成真实浏览器流程：

- `04NF14.step` 上传成功，显示处理中状态后返回 HTTP 200、`success=true`。
- 3D 预览使用派生 STL，浏览器未请求 G-code 作为预览资源。
- 切片成功、页面刷新、退出后重新登录、再次切片均保持预览可用。
- 无效 STEP 返回 HTTP 400 并显示明确失败/人工确认状态。
- 结构化日志覆盖上传校验、STEP 转换、网格分析、切片和报价完成阶段。
- 日志无 `Maximum call stack size exceeded`、持续 500、SQLite、Token 或 Authorization 泄露。

隔离数据库最终 `integrity_check=ok`、`foreign_key_check=0`；订单、文件、支付、退款和 `slicing_jobs` 行数均未变化，仅生成隔离环境的报价草稿记录。

## 8. 本地订单默认排序

修改位置：`worker/order-workbench/lib/orderList.mjs`。

- 无 `sort` 参数或非法参数：`created_desc`。
- 主排序：订单原始 `created_at` 时间值从新到旧。
- 稳定次级排序：`id DESC`。
- 保留并验证：`priority`、`updated_desc`、`created_desc`、`created_asc`、`amount_desc`。
- 搜索、客户类型/状态筛选、分页和显式排序继续沿用现有 query 参数。
- 显式 `created_asc`、`priority`、`updated_desc` 等不会被默认值覆盖。

本地 `http://127.0.0.1:5177` 实测 HTTP 200，默认前四条订单 ID 为 `44, 43, 42, 41`；显式 `created_asc` 第一条为 ID 20，`priority` 第一条为 ID 25，TEST 筛选配合默认排序第一条为 ID 44。WorkBench systemd 服务重启后保持 active，监听仍为 `127.0.0.1:5177`。

## 9. 修改文件

- `src/backend/stlAnalysis.ts`：消除大型网格调用栈溢出，增加网格诊断。
- `src/backend/modelFileValidation.ts`：增加 STEP 元数据识别。
- `src/backend/uploads.ts`：传递 STEP 元数据。
- `src/backend/modelConversion.ts`：转换前后尺寸/实体校验、单次修复、总超时、原子发布和诊断。
- `src/app/api/quote/slice/route.ts`：分阶段日志、错误分类和用户提示。
- `worker/order-workbench/lib/orderList.mjs`：默认及稳定排序。
- `scripts/phase07-start-shared-test.mjs`：修正隔离服务启动时忽略 `--host` 的既有问题。
- `scripts/phase08-validate-step-quote.mjs`：本地受控真实 STEP 回归脚本。
- `tests/modelConversion.test.mjs`、`tests/modelFileValidation.test.mjs`、`tests/slicer.test.mjs`：转换、校验、尺寸、清理和指标测试。
- `tests/orderWorkbenchOrderList.test.mjs`：默认/显式/稳定排序测试。
- `tests/accountRoutes.test.mjs`、`tests/pages.test.mjs`：接口和页面状态回归。
- `tests/stepRealFiles.test.mjs`：私有真实文件回归入口，默认无夹具时跳过。

## 10. 测试结果

```text
node --experimental-strip-types --test tests/modelConversion.test.mjs tests/modelFileValidation.test.mjs tests/orderWorkbenchOrderList.test.mjs tests/slicer.test.mjs tests/accountRoutes.test.mjs tests/pages.test.mjs
56 passed, 0 failed

MAKE3D_STEP_REGRESSION_DIR=<private-fixture-dir> node --experimental-strip-types --test tests/stepRealFiles.test.mjs
1 passed, 0 failed

npm test
472 total, 469 passed, 3 skipped, 0 failed

npx tsc --noEmit
passed

npm run lint
passed

npm run build
passed, Next.js 15.5.18, 52 routes/pages
```

默认 `npm test` 的三个 skip 包括既有平台条件和未提供私有 STEP 路径时的受控跳过；显式提供本地真实夹具目录后，`04NF13` 与 `04NF14` 回归测试通过。既有 STL、STP 扩展名、ZIP 上传、页面状态及报价测试均随全量测试通过。

## 11. 风险与回滚

- 私有 STEP 原文件不进入 Git；报告记录哈希，真实回归通过环境变量指向本地受控夹具目录。
- 进程内网格检查明确记录自交和法向穷举检查为 `not_performed`；当前以 PrusaSlicer `--info`、流形/边/退化面检查及实际切片成功作为制造性门槛。后续如引入 CAD 内核，可再增加精确自交检查。
- WSL 日志存在 NAT 模式下 localhost 代理不可镜像的环境警告，不影响本次本地 PrusaSlicer 执行。
- 结构化日志包含服务器内部模型路径和原始文件名，仅应保留在受限服务日志中，不应转发到公开前端。
- 本提交尚未生产部署。回滚代码可对实现 Commit `997e85883ba1ba91dc29faec5503bc40de76f7ef` 执行常规 `git revert`；不需要数据库回滚。

## 12. 最终状态

- `04NF13.step` 在线报价：通过。
- `04NF14.step` 在线报价：通过。
- STEP 尺寸/单位/实体保留：通过。
- 网格修复、G-code、重量、时间、价格解析：通过。
- STL/STP/ZIP 回归：通过。
- 本地订单列表默认最新在前：通过。
- 用户显式排序、筛选、分页：通过。
- 类型检查、测试、lint、build：通过。
- 生产环境：未部署。
