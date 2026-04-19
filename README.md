# Human Gantt Workbench

一个基于 React + TypeScript + Vite 的人力甘特图工作台 Demo，围绕 `Team -> Person -> Project` 组织排期，并把文档抽屉、评论、附件和导出入口放到同一个界面里。首版重点覆盖桌面三栏布局和移动浏览器下的轻量时间线 + 全屏抽屉体验。

## 已实现

- Team / Person / Project 三层资源树
- 右侧 Timeline 项目条展示
- 点击人员或项目打开详情抽屉
- 项目排期微调按钮
- CSV / JSON 导出与打印视图
- 桌面与移动浏览器双布局

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

这个仓库已经包含容器化配置：

```bash
docker compose up --build
```

运行后访问：

```text
http://localhost:8080
```

注意：你当前机器上只有 Docker CLI，还没有可用的 Docker daemon。macOS 上通常需要额外启动 Docker Desktop、Colima 或 OrbStack，`docker ps` 能正常返回后再执行上面的命令。

## GitHub 发布

如果要由本地命令创建 GitHub 仓库并推送，需要：

```bash
gh auth login
```

完成认证后即可执行建仓、提交和推送流程。
