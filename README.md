# Resource Planning Workspace

一个基于 React + TypeScript + Vite + Flask + MySQL 的前后端分离项目排期工作台。

当前版本已经完成从前端单页演示到三容器架构的改造：

- 前端：React/Vite，Nginx 静态托管并反向代理 `/api`
- 后端：Flask + SQLAlchemy + Alembic + Gunicorn
- 数据库：MySQL 8 持久化存储
- 核心数据：团队、成员、项目、更新记录、操作记录
- 核心交互：总览筛选、组织管理 CRUD、资源排期拖拽/拉伸/上下调整、记录中心分页、导出 JSON

详细的产品、UI/UX 和开发说明见：

- [docs/product-uiux-dev-plan.md](/Users/yangjunhu/Documents/Codex/2026-04-19-codex-figma/docs/product-uiux-dev-plan.md)

## 本地开发

前提：

- Node.js 可用
- `pnpm` 已安装
- Python 3.11+ 可用

启动：

```bash
pnpm install
pnpm dev
```

默认开发地址：

```text
http://localhost:5173
```

前端开发模式会把 `/api` 自动代理到：

```text
http://127.0.0.1:8000
```

后端本地运行：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
python -m backend.manage init-db
gunicorn --bind 0.0.0.0:8000 backend.wsgi:app
```

生产构建：

```bash
pnpm build
```

## Docker Compose

如果机器支持 `docker compose`：

```bash
docker compose up --build -d
```

运行后访问：

```text
http://127.0.0.1:8080
```

接口健康检查：

```bash
curl http://127.0.0.1:8000/api/health
```

## 纯 Docker 启动

当前仓库额外提供一套不依赖 `docker compose` 的纯 `docker` 脚本：

```bash
pnpm docker:up
```

停止容器：

```bash
pnpm docker:down
```

如果希望同时清空 MySQL 持久卷：

```bash
bash scripts/docker-down.sh --purge-data
```

执行三容器冒烟回归：

```bash
pnpm docker:smoke
```

## 后端测试

后端测试使用真实 MySQL 容器，不用 SQLite 代替：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
pytest backend/tests
```

## GitHub 发布

如果要由本地命令创建 GitHub 仓库并推送，需要：

```bash
gh auth login
```

完成认证后即可执行建仓、提交和推送流程。
