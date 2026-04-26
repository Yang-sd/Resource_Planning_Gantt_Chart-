# 测试与验收说明

## 本地质量门禁

每次提交前建议执行：

```bash
pnpm lint
pnpm build
.venv/bin/pytest backend/tests -q
```

如果需要验证完整 Docker 栈：

```bash
WEB_PORT=8081 bash scripts/docker-smoke.sh
```

## 前端检查

```bash
pnpm lint
pnpm build
```

覆盖重点：

- TypeScript 类型检查。
- React hooks lint。
- Vite 生产构建。
- 暗夜模式样式不会破坏生产构建。
- 组织管理、资源排期、记录中心相关状态不会引入编译错误。

## 后端测试

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
pytest backend/tests -q
```

测试说明：

- 后端测试会启动真实 MySQL 8 Docker 容器。
- 不使用 SQLite，避免日期、外键、JSON、排序行为和生产环境不一致。
- 每个测试会清空并重新 seed 数据。

覆盖重点：

- 健康检查和 bootstrap。
- 登录、角色、组织管理权限。
- 团队、成员、项目 CRUD。
- 新建成员自动创建账号。
- 项目拖拽/排序/转交所依赖的 owner/team 更新能力。
- 个人资料、头像上传、密码修改。
- 更新记录、操作记录分页。
- JSON 导出。

## Docker smoke

```bash
WEB_PORT=8081 bash scripts/docker-smoke.sh
```

这个脚本会真实构建镜像并拉起三容器，然后执行一轮关键链路：

- API `/api/health`
- 前端首页
- 前端 `/api` 反向代理
- 管理员登录
- 创建团队
- 创建成员
- 创建项目
- 修改项目
- 查询操作记录
- 导出 workspace JSON
- 删除测试项目、成员、团队

通过标志：

```text
Docker smoke test passed.
```

## 手工验收清单

登录：

- `admin/admin` 可以登录。
- 普通成员账号不显示组织管理菜单。
- 团队负责人账号显示组织管理菜单。

资源排期：

- 默认显示当前时间附近日期。
- 可切换双周和一个月范围。
- 今天有淡色提示。
- 项目条可拖动、拉伸、移动负责人。

组织管理：

- 团队视图和成员视图可切换。
- 新增成员后提示默认账号和密码。
- 成员详情中项目卡可点击“转交”。
- 转交后项目出现在新负责人名下。
- 删除仍负责项目的成员会被后端阻止。

个人资料：

- 点击左下角账号卡片打开资料弹窗。
- 不再需要当前密码即可设置新密码。
- 支持上传 PNG/JPG/WebP/GIF 头像，最大 10MB。
- 上传头像后账号栏和成员头像会更新。

记录中心：

- 更新记录能显示最新版本。
- 操作记录能记录新增、修改、删除、导出、查看动作。
- 分页按钮可用。

导出：

- JSON 导出包含 teams、members、tasks、releaseRecords、operationRecords。

## 已知风险

- 当前没有企业级 SSO，也没有多租户隔离。
- 默认账号用于本地体验，生产环境必须改密码。
- 大数据量场景下，bootstrap 后续应拆成按范围分页加载。
- 头像存储在 MySQL，适合当前 10MB 限制和小团队使用；大量头像或附件建议改对象存储。
