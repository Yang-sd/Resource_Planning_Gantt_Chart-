# Human Gantt Workbench

一个基于 React + TypeScript + Vite 的人力甘特图工作台 MVP。

当前版本不再只是视觉原型，而是已经补齐了可演示的核心闭环：

- 搜索项目、成员、团队
- 按团队 / 状态筛选
- 切换 7 / 10 / 14 天时间视窗
- 点击项目查看和编辑详情
- 新建项目
- 调整进度、持续时间、开始时间
- 自动保存到浏览器本地 `localStorage`
- 导出 JSON 工作区快照
- Docker 本地部署

详细的产品、UI/UX 和开发说明见：

- [docs/product-uiux-dev-plan.md](/Users/yangjunhu/Documents/Codex/2026-04-19-codex-figma/docs/product-uiux-dev-plan.md)

## 本地开发

前提：

- Node.js 可用
- `pnpm` 已安装

启动：

```bash
pnpm install
pnpm dev
```

默认开发地址：

```text
http://localhost:5173
```

生产构建：

```bash
pnpm build
```

## Docker 运行

如果本机没有 `docker compose` 插件，使用下面这组命令：

```bash
docker build -t human-gantt-workbench .
docker rm -f human-gantt-workbench-app 2>/dev/null || true
docker run -d --name human-gantt-workbench-app -p 8080:8080 human-gantt-workbench
```

运行后访问：

```text
http://127.0.0.1:8080
```

查看运行状态：

```bash
docker ps
docker logs human-gantt-workbench-app
```

## GitHub 发布

如果要由本地命令创建 GitHub 仓库并推送，需要：

```bash
gh auth login
```

完成认证后即可执行建仓、提交和推送流程。
