# Make3D Platform

Make3D V1.0 是一个在线 3D 打印报价与接单系统。当前已创建 Next.js + TypeScript + Tailwind CSS 基础框架，并实现报价页订单提交、SQLite 初始化、模型文件保存、管理员后台和新订单邮件通知。

## 当前范围

已完成：

- 首页 `/`
- 报价页面 `/quote`
- 成功页面 `/success`
- 前端目录 `src/frontend`
- 后端目录 `src/backend`
- 环境变量示例 `.env.example`
- SQLite 数据库初始化
- `orders` 表
- `files` 表
- 支持 STL、STEP、STP、3MF 文件上传
- 单文件最大 50MB
- 提交订单写入数据库并跳转 `/success`
- 管理员登录 `/admin/login`
- 管理员订单列表 `/admin/orders`
- 管理员订单详情 `/admin/orders/[id]`
- 上传文件下载
- 订单状态修改
- 新订单邮件通知
- 3D 模型分析字段预留
- 简单 IP 上传限流：同一 IP 每 10 分钟最多 10 次

暂未实现：

- 在线支付
- AI 客服

## V1 架构边界

V1 只保存客户上传的 3D 模型文件，并由人工进行最终报价确认。

- V1 不调用 CuraEngine / PrusaSlicer。
- V1 不执行用户上传的 3D 模型文件。
- V1 不做复杂模型解析，数据库仅预留 `bounding_box_x`、`bounding_box_y`、`bounding_box_z`、`volume`、`surface_area`、`process_type` 字段。
- V2 再考虑 OSS 直传、异步队列、自动切片和更完整的模型分析流程。

## 技术栈

- Next.js
- TypeScript
- Tailwind CSS

## 本地运行

```bash
npm install
npm run dev
```

开发服务默认运行在：

```text
http://localhost:3000
```

## 常用命令

```bash
npm test
npm run build
npm run lint
```

## Docker 部署

当前提供基础 Docker 部署配置，暂不包含 Nginx 和 SSL。

1. 复制生产环境变量模板：

```bash
cp .env.production.example .env
```

2. 编辑 `.env`，至少填写：

```text
APP_URL=
DATABASE_URL=file:/app/data/make3d.db
UPLOAD_DIR=/app/uploads
ADMIN_USERNAME=
ADMIN_PASSWORD=
SESSION_SECRET=
COOKIE_SECURE=false
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
ADMIN_EMAIL=
```

`SESSION_SECRET` 必须是随机长字符串，生产环境建议至少 32 字节随机值。

HTTP 测试环境使用 `COOKIE_SECURE=false`，否则浏览器不会保存管理员登录 cookie。HTTPS 正式环境使用 `COOKIE_SECURE=true`。

3. 构建并启动：

```bash
docker compose up -d --build
```

4. 查看日志：

```bash
docker compose logs -f
```

5. 停止服务：

```bash
docker compose down
```

Docker Compose 会将数据目录挂载到容器内：

```text
./data:/app/data
./uploads:/app/uploads
```

应用端口映射：

```text
3000:3000
```

## 环境变量

复制 `.env.example` 为 `.env.local` 后按部署环境填写。当前阶段会使用数据库、上传目录、管理员账号和 SMTP 变量。

当前会使用：

```text
DATABASE_URL=file:./data/make3d.db
UPLOAD_DIR=./uploads
ADMIN_USERNAME=
ADMIN_PASSWORD=
SESSION_SECRET=
COOKIE_SECURE=false
ADMIN_EMAIL=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

未配置数据库和上传目录时，默认使用项目根目录下的 `data/make3d.db` 和 `uploads`。管理员登录必须配置 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `SESSION_SECRET`。

`SESSION_SECRET` 用于签名管理员登录 session，必须设置为随机长字符串。生产环境建议至少 32 字节随机值，例如使用 `openssl rand -base64 32` 生成。

`COOKIE_SECURE` 控制管理员登录 cookie 是否带 `Secure` 属性。HTTP 测试环境使用 `COOKIE_SECURE=false`；HTTPS 正式环境使用 `COOKIE_SECURE=true`。

新订单邮件通知需要配置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS` 和 `ADMIN_EMAIL`。客户提交订单成功后，系统会发送标题为 `Make3D 新订单通知 - 订单编号` 的邮件给管理员；如果 SMTP 发送失败，订单提交仍会成功。

## Docker PrusaSlicer

Production Docker images include PrusaSlicer in the runtime container. After rebuilding the image, verify it with:

```bash
docker compose exec make3d prusa-slicer --version
```
