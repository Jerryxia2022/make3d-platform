# Phase08 STEP 在线报价与本地订单排序生产部署最终报告

## 1. 结论

- 部署日期：2026-07-20。
- 生产服务器：`47.116.112.205`。
- 生产项目目录：`/opt/make3d-platform`。
- 部署前 Commit：`2d7e225ac3ea65afd62dac5bc8484e8eb9946820`。
- 部署后 Commit：`997e85883ba1ba91dc29faec5503bc40de76f7ef`。
- 生产分支：`production-deploy-phase08`。
- 部署方式：Git fast-forward 到精确目标 Commit，Docker Compose 仅重建并更新 `make3d` 服务；未执行 `docker compose down`。
- STEP 核心功能验收：通过。`04NF13.step` 和 `04NF14.step` 均完成生产 API 上传、STEP 转 STL、网格检查、PrusaSlicer 切片、G-code、指标解析、报价和浏览器恢复预览。
- 本地订单默认排序验收：通过。无排序参数时为 `created_at DESC, id DESC`，显式排序、筛选和分页均保留。
- 回滚：未发生。
- 重要剩余问题：生产 API 的 `saved_upload.filepath` 仍会在 JSON 响应中返回容器内部路径。该字段在部署前 Commit 中已存在，本次 Commit 未引入；页面没有展示它，日志也未泄露密钥，但这项安全验收不能记为完全通过。根据“只部署已完成代码、不继续开发”的边界，本次没有追加代码修补。

因此，本次目标 Commit 已完成生产部署，核心功能和运行稳定性通过，但安全验收仍有上述一个既有缺口，后续应单独删除公共响应中的 `filepath` 字段并增加回归测试。

## 2. 生产基线与代码切换

- 生产仓库原 HEAD：`2d7e225ac3ea65afd62dac5bc8484e8eb9946820`。
- 目标 Commit 类型：`commit`，是生产原 HEAD 的后代，可 fast-forward。
- 目标变更包含 STEP 校验、转换、网格修复、报价路由、本地订单排序及相关测试；未发现支付、退款、微信支付密钥、Nginx、证书或破坏性数据库迁移变更。
- GitHub fetch 在生产服务器上两次因 TLS/443 超时失败。未改变网络配置，改用本地仓库生成的完整 Git bundle 传输。
- Git bundle：`phase08-production-997e858-20260720-125142.bundle`，大小 `11305233` 字节，SHA-256 `70a1c308774472fe8981ade8017604f1ef823f85471807eaeaa00ebf7f4c9a1`；服务器完成 bundle 和目标 Commit 校验后执行 fast-forward。
- 生产仓库存在 2026-07-07 遗留的 `.git/rebase-apply` 状态。未执行危险的 `git am --abort`，而是完整归档后移出 `.git`；归档 SHA-256 为 `25f00040ae2382bec34bfb5dce95c422004de605a409977ea821894b10781b9e`。
- 生产既有未跟踪文件均保留：三份历史 `.env.production.bak`、`derived-models/` 和微信验证文件。无已跟踪、已暂存的生产工作区修改被覆盖。

## 3. 生产备份

- 备份目录：`/root/make3d-deploy-backups/20260720-125142`。
- SQLite 在线一致性备份：`/root/make3d-deploy-backups/20260720-125142/make3d.db.phase08.20260720-125142.bak`。
- 数据库备份大小：`716800` 字节。
- 数据库备份权限：`600`。
- 数据库备份 SHA-256：`d9ebdf56fef132cb5e92be5e74062a1c79ec3b41b1d983eea97fdd8f782d5fe5`。
- 数据库备份 `integrity_check`：`ok`。
- 数据库备份 `foreign_key_check`：0 条。
- 代码归档 SHA-256：`fe5c709dec8b45937a2804aac714632b4ecabdf1ffe0b9e9d4cc799ccdf76927`。
- `.env.production` 已备份，权限 `600`，未在报告中输出内容。
- `.env.production` 部署前后 SHA-256 均为 `a3649057a59d799f1f5ec119cdc323c2beac94430e91ec738c769451c97b4f4d`。
- 部署前上传目录：47 个文件，约 75 MB；未批量复制或删除客户上传目录。

## 4. 部署前验证

精确目标 Commit 使用独立 detached worktree 执行：

- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- STEP、文件校验、订单排序、切片、账户路由和页面重点测试：61/61 通过。
- `npm test`：472 项，469 通过，3 项受控跳过，0 失败。
- `npm run build`：通过，Next.js 15.5.18，52 个路由/页面构建完成。
- `npm ci` 报告现有 3 个依赖漏洞（2 moderate、1 high）；未执行 `npm update`，未在生产部署中改变锁文件。
- Windows 新 worktree 曾因 Git CRLF 转换改变 ASCII STL fixture 字节，导致哈希测试失败；恢复 Commit 中的 LF 原始字节后全量测试 0 失败。此为测试 worktree 行尾问题，不是应用实现缺陷，生产镜像使用 Commit 原始内容。

## 5. Docker、Nginx 与服务

- 旧镜像：`sha256:0c155b99595ed41ab1004c2720d31558fcf446459b337153d11199b4b8d697bb`。
- 新镜像：`sha256:95c0aec69a7c69dbd594d10bc7cce1bb9ef942c26666af08af671da7efade938`。
- 新容器 ID：`88b127eb0e3d8cec052c4f237b8c86c40adad9f42ef348cef58a45a57c108e7c`。
- `make3d-platform`：running，重启次数 0，端口 3000。
- Nginx：active，`nginx -t` 通过，仍反向代理现有应用端口；未修改 Nginx、SSL 或域名配置。
- 公开页面 `/`、`/quote`、`/account/login`、`/account/register`、`/admin/login`、`/legal`：全部 HTTP 200。
- 本地 `make3d-order-workbench.service`：active，PID `567307`，仅监听 `127.0.0.1:5177`，HTTP 200。
- 本地 `make3d-file-sync-worker.service`：active，PID `557473`，未停止或重启。
- Slicing Worker 进程和 systemd unit：0。
- 末检时 PrusaSlicer 进程：0。

## 6. 真实 STEP 生产验收

验收文件均来自本地受控目录，复制到服务器前后 SHA-256 一致。使用专用 TEST 客户执行，仅创建报价草稿和报价派生产物；未提交订单。

### 6.1 `04NF13.step`

- 源文件：491641 字节。
- 源 SHA-256：`69f6108bada07a1f6698300c13b1db23fd53ab5127e5b257566bf464d281e290`。
- HTTP：200，`success=true`。
- STEP Part 21：通过；schema `AUTOMOTIVE_DESIGN`，单位 `mm`。
- STEP 元数据：6310 个实体、1 个 solid、1 个 closed shell、0 open shell、219 advanced faces、11 B-spline surfaces。
- 转换前/后尺寸：`30.950279 x 140.005646 x 173.512131 mm`，三轴比例均为 1。
- 网格：6094 三角面，1 component，manifold，0 open edge，0 退化面；无需 healing。
- 派生 STL：304784 字节，SHA-256 `47222fc47eec89abfb9a3c9f930b6722aadeb7872c37dff7d3a6cf2ad9fcd452`。
- G-code：7059740 字节。
- 材料重量：98.7044 g。
- 打印时间：26488 秒（约 7:21:28）。
- API 基础打印价：CNY 30.78。
- 浏览器 PETG 文件单价：CNY 31.53。
- 浏览器状态：`已恢复切片结果`；显示 XYZ 正确，3D 模型弹窗加载完成。

### 6.2 `04NF14.step`

- 源文件：554399 字节。
- 源 SHA-256：`dfe4fa136edb66ab7be7edf61785c3914369c99e9e7810511b209626fbf4fef3`。
- HTTP：200，`success=true`；未发生 `Maximum call stack size exceeded`。
- STEP Part 21：通过；schema `AUTOMOTIVE_DESIGN`，单位 `mm`。
- STEP 元数据：6568 个实体、1 个 solid、1 个 closed shell、0 open shell、209 advanced faces、28 B-spline surfaces。
- 原始网格：65710 三角面、2 个 open edge、非 manifold。
- 受控 healing：一次，退出码 0；移除 2 个退化面。
- 最终网格：65708 三角面，1 component，manifold，0 open edge，0 退化面，0 non-manifold edge。
- 转换前/后尺寸：`138 x 60 x 174 mm`，三轴比例均为 1，无错误缩放。
- 派生 STL：3285484 字节，SHA-256 `4094115809cef2f31ab9be363dca36fc57434e09b0567d37e65c8c879a021284`。
- G-code：15118746 字节。
- 材料重量：287.8963 g。
- 打印时间：63934 秒（约 17:45:34）。
- API 基础打印价：CNY 84.22。
- 浏览器 PETG 文件单价：CNY 84.97。
- 与参考值 287.1851 g、17:47:39、CNY 84.13 同量级，差异很小；尺寸和单位准确。
- 浏览器状态：`已恢复切片结果`；显示 XYZ 正确，3D 模型弹窗加载完成。

### 6.3 既有格式与失败分支

- 已知正常 STL（20 mm cube）：HTTP 200，6.5024 g，1559 秒，基础打印价 CNY 6.30。
- 同源 `.stp`：HTTP 200，尺寸、重量、时间和价格与 `04NF13.step` 一致。
- ZIP：当前生产上传控件只开放 `.stl/.step/.stp`，本次未绕过产品规则上传 ZIP；不适用“若当前开放 ZIP”的验收分支。
- 受控无效 STEP：HTTP 200，明确 `STEP_CONVERSION_PROCESS_FAILED`，转人工确认；未出现持续 500，未生成 G-code。
- 转换后没有残留 `.part.stl` 或 `.tmp`。
- 生产响应原始证据保存在部署备份目录的 `acceptance/`，权限 600；最终报告不输出内部路径或完整 stderr。

## 7. 本地订单排序验收

- 无排序参数：选择值 `created_desc`，前 3 个订单 ID 为 `44, 43, 42`。
- `created_asc`：前 3 个 ID 为 `20, 21, 22`。
- `priority`：前 3 个 ID 为 `25, 24, 23`。
- `updated_desc`：前 3 个 ID 为 `44, 43, 42`。
- `amount_desc`：前 3 个 ID 为 `20, 42, 28`。
- TEST 筛选且未指定排序：仍为 `created_desc`，前 3 个 ID 为 `44, 43, 42`。
- 第 2 页且未指定排序：仍为 `created_desc`，前 3 个 ID 为 `24, 23, 22`。
- 页面刷新后 URL 显式排序仍保持；现有处理优先级、最近更新、下单时间旧到新、金额高到低选项均保留。
- 相同时间稳定次级排序由自动化测试覆盖为 `id DESC`；未修改任何真实订单来制造同时间测试数据。
- 线上管理员订单页面仍可访问，未改线上管理员订单查询排序。
- 浏览器控制台：生产报价页和本地 Workbench 均无 error/warn。

## 8. 数据库与业务安全

部署前后核心表计数一致：

| 表 | 部署前 | 末检 |
| --- | ---: | ---: |
| `orders` | 25 | 25 |
| `files` | 31 | 31 |
| `local_file_sync_jobs` | 20 | 20 |
| `slicing_jobs` | 13 | 13 |
| `slicing_job_attempts` | 21 | 21 |
| `order_payments` | 8 | 8 |
| `wechat_refunds` | 3 | 3 |
| `payment_settings` | 1 | 1 |

- 未执行数据库迁移。
- 末检 `integrity_check=ok`，`foreign_key_check_count=0`。
- `payment_settings.wechat_enabled=0`。
- 运行时保持 `WECHAT_PAY_ENABLED=true`、`WECHAT_PAY_TEST_ONLY=true`、`WECHAT_PAY_TEST_CUSTOMER_IDS=5`。
- 未创建订单、支付、退款、`slicing_job` 或 Worker attempt，未修改订单金额、状态或报价公式。
- 为生产报价验收，先通过 TEST 页面删除 3 条旧边界草稿，再新增 8 条 TEST 报价草稿（一次汇总器失败前请求已成功、5 项接口回归、2 项当前浏览器 TEST 展示），`quote_draft_files` 净增 5；上传目录从 47 个文件变为 52 个文件。变化仅属于受控 TEST 报价草稿，没有真实客户业务表变化。
- 派生预览文件仍为 5 个，哈希复用正常；测试源副本的 `/tmp` 目录和临时会话 Token 已删除。

## 9. 日志、临时文件与磁盘

- 最近日志 `Maximum call stack size exceeded`：0。
- `SQLITE_BUSY`：0。
- Unhandled/unhandledRejection：0。
- 支付/退款失败日志：0。
- Token、Authorization、APIv3 key、private key、session secret、Worker token 标签命中：0。
- Nginx 最近观察窗口 HTTP 500：0。
- 无效 STEP 的预期转换错误记录：1。
- 服务端受限结构化 STEP 诊断日志包含内部工作路径，这是当前诊断设计；未包含 Token、客户隐私或支付秘密。
- stale/all `.part.stl`、`.tmp`：0。
- 末检磁盘：40 GB 总量，26 GB 已用，12 GB 可用，69%。
- 上传目录：52 个文件，约 78 MB。
- 派生模型目录：5 个文件，约 6.9 MB。
- G-code 目录：46 个文件，约 447 MB。

## 10. 回滚方法

若后续观察发现目标 Commit 引入业务回归：

1. 保留当前数据库和上传目录，不直接覆盖数据库。
2. 基于部署前 Commit `2d7e225ac3ea65afd62dac5bc8484e8eb9946820` 创建明确的 rollback 分支。
3. 使用备份目录中的代码/环境记录核对配置。
4. 重建旧 Commit 的 `make3d` 镜像并使用 `docker compose --env-file .env.production up -d make3d` 更新应用；不得执行 `down -v`。
5. 重新检查公开页面、数据库完整性、支付 TEST_ONLY 配置和日志。
6. 仅当确认数据库被本次部署错误修改时，才评估恢复 SQLite 备份；本次没有迁移或核心业务数据变更，正常不应恢复数据库。

## 11. 后续观察

- 单独修复公共报价 API：返回 `saved_upload` 时移除 `filepath`，错误响应不得带容器路径或完整工具 stderr，并增加生产形态回归测试。
- 持续观察 24 小时内 STEP 转换错误分类、HTTP 500、容器重启次数和 G-code 磁盘增长。
- 本次不继续开发新功能，不修改报价规则，不启动常驻切片 Worker。

