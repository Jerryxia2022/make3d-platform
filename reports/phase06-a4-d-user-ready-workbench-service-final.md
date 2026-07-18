# Phase06-A4-D User-ready Workbench Service Final

## 1. 结论

Phase06-A4-D 已完成。

- Local Order Workbench 已由临时 Node 进程改为 WSL systemd 常驻服务。
- 服务名：`make3d-order-workbench.service`
- 访问地址：`http://127.0.0.1:5177`
- 开机自动启动：已启用。
- 异常自动恢复：已通过受控进程终止复验。
- TEST/真实订单标识：已增加醒目标识。
- 真实订单线上同步：页面按钮禁用，本地 prepare/run 路由额外返回 HTTP 403。
- 生产数据库 Schema：未修改。
- 支付、退款、微信支付：未修改。
- 邮件、微信通知：未发送。
- PrusaSlicer、Slicing Worker：未运行、未创建常驻服务。

## 2. 修改文件

- `worker/order-workbench/lib/render.mjs`
- `worker/order-workbench/server.mjs`
- `worker/order-workbench/README.md`
- `worker/order-workbench/install-service.sh`
- `worker/order-workbench/systemd/make3d-order-workbench.service.in`
- `tests/orderWorkbenchServerSecurity.test.mjs`
- `tests/orderWorkbenchService.test.mjs`
- `changelog/CHANGELOG.md`
- `reports/phase06-a4-d-user-ready-workbench-service-final.md`

## 3. UI 和写保护

订单列表和详情页显示：

- TEST：`TEST订单`
- 真实客户：`真实订单 · 只读`
- TEST身份缺失或不明确：`身份未确认 · 禁止同步`

真实订单保护：

- “同步线上”准备按钮保持 disabled。
- 直接构造 `POST /orders/:id/online-sync/prepare` 时，本地 Workbench 返回 HTTP 403。
- 直接构造 `POST /orders/:id/online-sync/run` 时，本地 Workbench 在调用云端写 API 前重新读取订单并返回 HTTP 403。
- 云端原有 TEST-only 权威校验继续保留，形成双层门禁。

## 4. systemd 配置

安装位置：

- unit：`/etc/systemd/system/make3d-order-workbench.service`
- env：`/etc/make3d-order-workbench.env`
- 运行用户：`make3d-worker:make3d-worker`
- WorkingDirectory：`/mnt/c/Users/21899/Documents/make3d-platform-phase06-a2-rc`
- 自动启动目标：`multi-user.target`
- 重启策略：`Restart=on-failure`
- 重启等待：5 秒
- 安全配置：`NoNewPrivileges=true`、`PrivateTmp=true`、`ProtectSystem=full`、`ProtectHome=true`
- 可写范围：`/srv/make3d-worker`

监听地址在 `ExecStart` 层强制设置：

- `MAKE3D_ORDER_WORKBENCH_HOST=127.0.0.1`
- `MAKE3D_ORDER_WORKBENCH_PORT=5177`

即使 env 文件误设其他监听地址，systemd 启动命令仍强制使用 `127.0.0.1:5177`。

## 5. 配置和备份

- `/etc/make3d-order-workbench.env` 内容未输出。
- env 权限：`640 root:make3d-worker`
- Token 未写入 Git、代码或日志。
- 有效本地 Workbench DB 备份：
  `/srv/make3d-worker/order-workbench/backups/workbench.db.phase06-a4d-before-systemd.checkpointed.20260718-133505.bak`
- 备份大小：36864 bytes
- 备份模式：600
- 备份 SHA-256：`63baf07b1d09c6db5ff6f10d75ad5513baba5b10731038a6ca3dd26eca2d195a`
- 备份 `integrity_check=ok`

首次在 WAL 尚未 checkpoint 时生成的 4096-byte 主库副本不作为有效备份，已重命名为 `.bak.incomplete`，避免误用；之后完成 checkpoint、完整性检查并生成上述有效备份。

## 6. 部署与运行验收

部署前：

- 临时 Workbench PID：`453793`
- file-sync Worker：active
- file-sync Worker PID：`287`
- file-sync Worker `NRestarts=0`

部署后：

- unit：enabled
- 状态：active/running
- 初始 systemd PID：`465533`
- 监听：仅 `127.0.0.1:5177`
- 首页：HTTP 200
- TEST订单标识：页面已显示
- 页面敏感标识扫描：0

异常恢复测试：

- 受控终止 PID：`465533`
- systemd 自动恢复 PID：`465855`
- `NRestarts=1`
- 恢复后状态：active/running
- 恢复后首页：HTTP 200

现有 file-sync Worker：

- 复验后仍 active
- PID 仍为 `287`
- `NRestarts=0`
- 未停止、未重启、未修改

## 7. 日志和进程检查

Workbench journal：

- 采样日志行数：12
- Token/Authorization/Bearer/OpenID/APIv3/private key/payment secret/手机号模式匹配：0
- `uncaught`、`unhandled`、`SQLITE_BUSY`、权限错误匹配：0
- 记录到 1 次预期的 `status=9/KILL`，对应异常恢复验收。

残留进程：

- PrusaSlicer：0
- Slicing Worker：0
- Slicing Worker systemd unit：0

## 8. 测试结果

环境：

- Node：`v22.22.3`
- npm：`10.9.8`
- 基线 commit：`610108cb7caf069fd130a00fda1919ba4d181f0f`

聚焦测试：

- `node --test tests/orderWorkbenchServerSecurity.test.mjs tests/orderWorkbenchLocalDraftsAndSlicing.test.mjs tests/orderWorkbenchService.test.mjs`
- 19 passed，0 failed，0 skipped

完整回归：

- `npm test`
- 429 tests：428 passed，1 skipped，0 failed
- `npm run lint`：passed
- `npm run build`：passed
- `git diff --check`：passed

## 9. 数据库和业务影响

生产数据库：

- 未连接、未迁移、未修改 Schema。
- 未执行 INSERT、UPDATE、DELETE。
- 未修改订单、报价、支付、退款、微信支付、上传或客户数据。

本地数据库：

- 仅继续使用现有 `/srv/make3d-worker/order-workbench/workbench.db`。
- 本阶段未增加本地 Schema。
- systemd 部署前已生成有效备份。

## 10. 风险

- systemd WorkingDirectory 指向当前 release worktree；移动或删除该目录会导致服务启动失败。
- 后续更新 Workbench 代码后需要执行 `sudo systemctl restart make3d-order-workbench.service`。
- 本次没有重启整个 WSL；开机启动通过 `enabled` 和 `multi-user.target` 配置验收，异常恢复已实际验证。
- 当前生产数据没有真实客户订单，因此真实订单标识和禁用状态由自动化 fixture 验证；云端和本地双层 TEST-only 门禁均通过测试。

## 11. 回滚方法

仅回滚本地 Workbench systemd 托管：

1. `sudo systemctl disable --now make3d-order-workbench.service`
2. 保留 `/etc/make3d-order-workbench.env` 和本地数据库。
3. 如需恢复临时运行方式，按 README 的前台启动命令运行。
4. 如需恢复本地数据库，停止 Workbench 后使用本报告中的 checkpointed 备份。
5. 删除 unit 文件仅在明确批准后执行，再运行 `sudo systemctl daemon-reload`。

生产数据库、支付和订单不需要回滚，因为本阶段未修改这些内容。

## 12. 使用状态

用户现在可以直接访问：

`http://127.0.0.1:5177`

服务已达到日常本地使用条件。TEST订单可继续按既有二次确认流程人工同步；真实订单只读，线上同步入口保持禁用。

