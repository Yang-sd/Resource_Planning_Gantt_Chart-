# 部署与运维说明

本文档说明如何从 GitHub 拉取代码并快速部署项目。项目支持两种部署方式：推荐的纯 Docker 脚本部署，以及可选的 Docker Compose 部署。

## 前置条件

必须安装：

- Docker
- Git

可选安装：

- Node.js + pnpm，仅在需要本地开发或使用 `pnpm docker:*` 快捷命令时需要。
- docker compose，仅在使用 Compose 部署时需要。

## 方式一：纯 Docker 一键部署

这套方式不依赖 `docker compose`，适合只有 Docker 的机器。

```bash
git clone git@github.com:Yang-sd/Resource_Planning_Gantt_Chart-.git
cd Resource_Planning_Gantt_Chart-
bash scripts/docker-up.sh
```

脚本会自动完成：

- 创建 Docker network：`resource-planning-net`
- 创建 MySQL volume：`resource-planning-mysql-data`
- 构建前端镜像：`resource-planning-web:latest`
- 构建后端镜像：`resource-planning-api:latest`
- 启动 MySQL 8、Flask API、Nginx 前端三容器
- 等待容器健康检查通过
- 输出前端、后端、MySQL 的访问地址

默认地址：

```text
前端：http://127.0.0.1:8080
后端：http://127.0.0.1:8000/api/health
MySQL：127.0.0.1:3306
```

## 指定端口

如果默认端口冲突，可以通过环境变量覆盖：

```bash
WEB_PORT=8081 API_PORT=8001 MYSQL_PORT=3307 bash scripts/docker-up.sh
```

常用场景只需要改前端端口：

```bash
WEB_PORT=8081 bash scripts/docker-up.sh
```

## 停止和清理

保留 MySQL 数据，只停止并删除容器和 network：

```bash
bash scripts/docker-down.sh
```

同时清空 MySQL 数据卷，恢复到全新种子数据状态：

```bash
bash scripts/docker-down.sh --purge-data
```

注意：`--purge-data` 会删除 `resource-planning-mysql-data`，本地数据库数据会丢失。

## 方式二：Docker Compose 部署

如果机器支持 Compose：

```bash
docker compose up --build -d
```

停止服务：

```bash
docker compose down
```

停止服务并删除数据卷：

```bash
docker compose down -v
```

## 升级代码

如果后续从 GitHub 拉取新代码：

```bash
git pull
bash scripts/docker-up.sh
```

`docker-up.sh` 会重新构建前后端镜像，并复用已有 MySQL 数据卷。后端容器启动时会自动执行 Alembic migration 和 seed backfill，保证数据库结构升级到最新版本。

## 健康检查

API 健康检查：

```bash
curl http://127.0.0.1:8000/api/health
```

预期返回：

```json
{"status":"ok"}
```

前端反向代理检查：

```bash
curl http://127.0.0.1:8080/api/health
```

## Docker 冒烟测试

完整拉起三容器并执行关键业务流：

```bash
WEB_PORT=8081 bash scripts/docker-smoke.sh
```

冒烟脚本会验证：

- API 健康检查
- 前端首页
- Nginx 到 API 的反向代理
- 管理员登录
- Bootstrap 数据
- 团队、成员、项目 CRUD
- 操作记录分页
- JSON 导出

## 生产部署注意事项

当前仓库默认配置为了本地部署体验，生产环境建议至少调整：

- `SECRET_KEY`：替换为高强度随机值。
- `MYSQL_PASSWORD` 和 `MYSQL_ROOT_PASSWORD`：替换默认密码。
- `AUTH_TOKEN_MAX_AGE_SECONDS`：按企业登录安全策略设置。
- 端口暴露：生产环境建议只暴露前端入口，MySQL 不直接暴露公网。
- HTTPS：由外层网关或云负载均衡配置证书。
- 数据备份：定期备份 Docker volume 或 MySQL dump。

仓库提供了 [.env.example](../.env.example) 作为生产环境变量参考。纯 Docker 脚本为了开箱即用会直接传入本地默认值，正式部署时建议按 `.env.example` 的字段改造为自己的 Compose override、CI/CD 环境变量或服务器环境变量。

## 默认资源占用参考

本地三容器空闲态实测约：

| 容器 | 内存 |
| --- | ---: |
| Nginx 前端 | 约 3 MB |
| Flask API | 约 150 MB |
| MySQL 8 | 约 370 MB |

实际占用会随数据量、并发和宿主机环境变化。
