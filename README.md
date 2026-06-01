# Make3D Platform

Make3D V1.0 是一个在线 3D 打印报价与接单系统。本阶段已创建 Next.js + TypeScript + Tailwind CSS 基础框架，并按文档先提供公开页面外壳。

## 当前范围

已完成基础框架：

- 首页 `/`
- 报价页面 `/quote`
- 成功页面 `/success`
- 前端目录 `src/frontend`
- 后端目录 `src/backend`
- 环境变量示例 `.env.example`

暂未实现：

- 数据库
- 文件上传
- 后台管理
- 邮件通知

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

## 环境变量

复制 `.env.example` 为 `.env.local` 后按部署环境填写。当前基础框架不会连接数据库、上传目录或 SMTP 服务，这些变量为后续功能预留。
