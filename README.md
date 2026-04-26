# Resource Planning Gantt Chart

一个面向中小团队、交付负责人、PM/PMO 的人力资源项目排期工作台。项目把团队、成员、项目周期、优先级、状态、操作记录统一放在一个可部署的前后端分离系统里，帮助团队快速判断谁在负责什么、项目排到哪一天、哪些任务需要转交或调整。

## 项目能做什么

- 资源排期：用甘特图按天查看项目周期，支持双周和一个月时间范围切换。
- 项目调整：支持项目拖动、首尾拉伸、上下移动负责人，以及组织管理中的项目转交。
- 组织管理：维护团队、成员、负责人关系，团队负责人和管理员才可进入组织管理。
- 账号权限：内置登录、角色和权限控制；普通成员只能看/用与自己相关的核心功能。
- 个人资料：用户可修改姓名、密码、文字头像，并上传 PNG/JPG/WebP/GIF 头像，最大 10MB。
- 记录中心：展示版本更新记录和操作记录，关键 CRUD、导出、查看动作都会写入后端。
- 数据导出：可导出当前 MySQL 数据快照 JSON，便于备份和排查。
- Docker 部署：提供 Docker Compose 和纯 Docker 两种部署方式。

## 技术架构

- 前端：React 19 + TypeScript + Vite
- 静态服务：Nginx，反向代理 `/api`
- 后端：Flask + SQLAlchemy + Alembic + Gunicorn
- 数据库：MySQL 8，Docker volume 持久化
- 部署形态：三容器，`web` + `api` + `mysql`

更多细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 一键部署

如果机器已经安装 Docker，最简单的部署方式是：

```bash
git clone git@github.com:Yang-sd/Resource_Planning_Gantt_Chart-.git
cd Resource_Planning_Gantt_Chart-
bash scripts/docker-up.sh
```

默认访问地址：

```text
前端：http://127.0.0.1:8080
后端：http://127.0.0.1:8000/api/health
MySQL：127.0.0.1:3306
```

如果 `8080` 已被占用，可以指定端口：

```bash
WEB_PORT=8081 bash scripts/docker-up.sh
```

更多部署、升级、停止和清理说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 默认账号

| 角色 | 账号 | 密码 | 权限 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `admin` | 全部功能 |
| 团队负责人 | `linqing` | `123456` | 可进入组织管理 |
| 团队负责人 | `zhouyi` | `123456` | 可进入组织管理 |
| 团队负责人 | `xuheng` | `123456` | 可进入组织管理 |
| 普通成员 | `mina` | `123456` | 不能进入组织管理 |

生产环境请务必修改默认密码、数据库密码和 `SECRET_KEY`。

## 本地开发

前端开发：

```bash
pnpm install
pnpm dev
```

后端开发：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
python -m backend.manage init-db
gunicorn --bind 0.0.0.0:8000 backend.wsgi:app
```

前端开发地址：

```text
http://127.0.0.1:5173
```

## 测试

```bash
pnpm lint
pnpm build
.venv/bin/pytest backend/tests -q
WEB_PORT=8081 bash scripts/docker-smoke.sh
```

后端测试使用真实 MySQL 容器，不用 SQLite 替代。完整测试说明见 [docs/TESTING.md](docs/TESTING.md)。

## 常用命令

| 场景 | 命令 |
| --- | --- |
| 纯 Docker 启动 | `bash scripts/docker-up.sh` |
| 指定前端端口启动 | `WEB_PORT=8081 bash scripts/docker-up.sh` |
| 停止并删除容器，保留 MySQL 数据 | `bash scripts/docker-down.sh` |
| 停止并删除容器，同时清空 MySQL 数据卷 | `bash scripts/docker-down.sh --purge-data` |
| Docker 冒烟测试 | `WEB_PORT=8081 bash scripts/docker-smoke.sh` |
| Compose 启动 | `docker compose up --build -d` |
| Compose 停止 | `docker compose down` |

## 文档目录

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)：部署、升级、停止、清理、端口配置。
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：系统架构、数据模型、API、权限说明。
- [docs/TESTING.md](docs/TESTING.md)：测试策略、命令、验收清单。
- [docs/CHANGELOG.md](docs/CHANGELOG.md)：版本迭代记录。
- [docs/product-uiux-dev-plan.md](docs/product-uiux-dev-plan.md)：产品定位与 UI/UX 设计原则。
