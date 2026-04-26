# 架构与接口说明

## 系统目标

Resource Planning Gantt Chart 是一个人力资源项目排期系统，用来解决中小团队常见的几个问题：

- 项目负责人和团队归属分散，查找成本高。
- 项目周期、优先级、状态在不同表格里维护，容易不同步。
- 团队负责人需要快速调整成员项目，但不希望进入复杂项目管理系统。
- 交付负责人需要看到近期 14 天或一个月的人力排期。

## 总体架构

推荐生产结构仍然是三容器：

```text
Browser
  |
  | HTTP
  v
Nginx Web Container
  |-- 静态资源：React/Vite dist
  |-- /api 反向代理
  |
  v
Flask API Container
  |-- 认证与权限
  |-- 团队、成员、项目 CRUD
  |-- 操作记录和版本记录
  |-- JSON 导出
  |
  v
MySQL 8 Container
  |-- teams
  |-- members
  |-- tasks
  |-- accounts
  |-- release_records
  |-- operation_records
```

为了降低个人用户和演示部署门槛，仓库也提供单容器镜像：

```text
All-in-one Container
  |-- Nginx :8080
  |-- Flask/Gunicorn :8000 (仅容器内访问)
  |-- MySQL :3306 (仅容器内访问)
  |-- /var/lib/mysql 挂载 Docker volume
```

单容器方案适合快速部署、演示、内网小团队试用。三容器方案更适合后续生产环境扩展、独立数据库备份和资源隔离。

## 前端结构

核心文件：

- `src/App.tsx`：页面状态、路由式导航、资源排期、组织管理、记录中心、登录和个人资料。
- `src/App.css`：主界面、暗夜模式、甘特图、组织管理、弹窗样式。
- `src/api.ts`：前端统一 API client，负责 token、请求、错误处理和 DTO 类型。
- `src/main.tsx`：React 入口。

设计原则：

- 用一个统一工作台保持低跳转成本。
- 资源排期支持局部滚动和虚拟行渲染，避免数据量变大后 DOM 过多。
- 前端不再使用 `localStorage` 保存业务数据，所有业务数据来自后端 API。
- 头像图片通过独立 URL 加载，不塞进 bootstrap JSON，避免首屏变大。

## 后端结构

核心文件：

- `backend/app/models.py`：SQLAlchemy 数据模型。
- `backend/app/api/routes.py`：REST API、认证、权限、数据校验。
- `backend/app/serializers.py`：ORM 到 camelCase JSON 的序列化。
- `backend/app/seed.py`：默认团队、成员、项目、账号和版本记录种子数据。
- `backend/app/services.py`：时间、ID、分页、排序等公共逻辑。
- `backend/manage.py`：数据库迁移和初始化命令。
- `backend/migrations/versions/`：Alembic 迁移脚本。

启动流程：

1. API 容器执行 `python -m backend.manage init-db`。
2. Alembic 将数据库迁移到 head。
3. `seed_database()` 补齐默认数据和新增版本记录。
4. Gunicorn 启动 Flask app。

## 数据模型

| 表 | 用途 |
| --- | --- |
| `teams` | 团队信息、负责人、颜色和排序 |
| `members` | 成员信息、所属团队、头像、工时和排序 |
| `tasks` | 项目排期、负责人、团队、状态、优先级、周期、摘要和里程碑 |
| `accounts` | 登录账号、角色、成员绑定、头像和密码 hash |
| `release_records` | 版本更新记录 |
| `operation_records` | 操作审计记录 |

关键关系：

- `members.team_id -> teams.id`
- `tasks.owner_id -> members.id`
- `tasks.team_id -> teams.id`
- `accounts.member_id -> members.id`

项目转交时，后端会根据新负责人自动同步 `tasks.team_id`。

## 权限模型

| 角色 | 说明 |
| --- | --- |
| `admin` | 管理员，拥有全部功能 |
| `team_lead` | 团队负责人，可进入组织管理 |
| `member` | 普通成员，不能进入组织管理 |

后端权限规则：

- 所有业务 API 需要登录 token。
- 团队和成员写入接口需要组织管理权限。
- 项目读写、记录读取、导出需要登录。
- 前端会隐藏普通成员的组织管理菜单，但真正权限仍由后端兜底。

## API 列表

认证：

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `PATCH /api/auth/profile`

基础数据：

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/export/workspace`

团队：

- `GET /api/teams`
- `POST /api/teams`
- `PATCH /api/teams/<team_id>`
- `DELETE /api/teams/<team_id>`

成员：

- `GET /api/members`
- `POST /api/members`
- `PATCH /api/members/<member_id>`
- `DELETE /api/members/<member_id>`
- `GET /api/members/<member_id>/avatar`

项目：

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/<task_id>`
- `DELETE /api/tasks/<task_id>`

记录中心：

- `GET /api/release-records?page=1&size=10`
- `GET /api/operation-records?page=1&size=10`
- `POST /api/operation-records/view`

## 默认账号

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `admin` | 管理员 |
| `linqing` | `123456` | 团队负责人 |
| `zhouyi` | `123456` | 团队负责人 |
| `xuheng` | `123456` | 团队负责人 |
| `mina` | `123456` | 普通成员 |

新增成员时会自动创建账号，初始密码为 `123456`。

## 性能设计

已经实现：

- 甘特图成员行窗口化，只渲染当前视窗附近行。
- 记录中心后端分页，避免一次拉全量审计记录。
- release/operation 计数使用轻量 count。
- 头像图片独立接口返回，bootstrap 只返回 URL。
- Nginx 托管静态资源，API 只负责 JSON 和业务写入。
- 单容器镜像内 Nginx、API、MySQL 通过 `127.0.0.1` 通信，用户只需要暴露 `8080`。

后续数据量更大时建议继续优化：

- `/api/bootstrap` 按时间范围和成员范围拆分。
- 任务列表支持服务端筛选、分页和增量同步。
- MySQL 增加慢查询监控和更细的组合索引。
- API 根据真实并发调整 Gunicorn worker 数量。
