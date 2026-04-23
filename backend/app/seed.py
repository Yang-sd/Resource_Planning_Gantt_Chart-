from __future__ import annotations

from datetime import date, datetime

from .extensions import db
from .models import Member, OperationRecord, ReleaseRecord, Task, Team
from .services import now_local


SEEDED_RELEASE_RECORDS = [
    {
        "id": "release-12",
        "version": "v1.6.3",
        "updated_at": datetime(2026, 4, 22, 21, 50),
        "features": [
            "总览页项目表头与数据列重新统一列宽和内边距，负责人、状态、优先级、周期、里程碑对齐更稳定。",
            "项目清单增加更清晰的行区分样式，列表浏览时更容易锁定当前行，减少看错行的情况。",
        ],
    },
    {
        "id": "release-11",
        "version": "v1.6.2",
        "updated_at": datetime(2026, 4, 22, 21, 36),
        "features": [
            "左侧导航顺序微调，将组织管理入口下移一位，浏览路径更贴近先排期后管理的使用节奏。",
            "记录中心继续补齐最新页面调整，确保本地版本历史与当前界面保持一致。",
        ],
    },
    {
        "id": "release-10",
        "version": "v1.6.1",
        "updated_at": datetime(2026, 4, 22, 21, 28),
        "features": [
            "组织管理页移除成员周容量字段，成员清单、成员详情与成员编辑表单统一精简。",
            "成员编辑仅保留姓名、角色、所属团队和头像文字四个核心信息，减少无效维护项。",
            "成员信息卡片与详情指标重新收敛，只保留当前管理动作真正需要的内容。",
        ],
    },
    {
        "id": "release-9",
        "version": "v1.6.0",
        "updated_at": datetime(2026, 4, 22, 21, 5),
        "features": [
            "资源排期改为固定工作台布局，顶部筛选与日期头常驻，纵向浏览时不再带着整页一起滚动。",
            "成员行支持从左侧姓名区域直接左键拖拽调整上下顺序，排期视图与成员管理顺序同步。",
            "资源排期纵向滚动条改为隐藏式滚动，保留触控板与鼠标滚动体验，页面右侧不再出现明显长滚动条。",
        ],
    },
    {
        "id": "release-8",
        "version": "v1.5.0",
        "updated_at": datetime(2026, 4, 22, 20, 10),
        "features": [
            "总览页改为固定工作台布局，压缩顶部统计、筛选与表格行高，页面整体不再上下滚动。",
            "组织管理页与总览页统一改为局部滚动结构，团队列表与关联项目支持在各自区域内独立滚动。",
            "左侧导航精简为总览、组织管理、资源排期与记录中心四个主入口，并补齐记录中心版本更新记录。",
        ],
    },
    {
        "id": "release-7",
        "version": "v1.4.0",
        "updated_at": datetime(2026, 4, 22, 18, 20),
        "features": [
            "组织管理从弹窗迁移为独立页面，统一为团队视图与成员视图双工作台。",
            "团队与成员管理改为左侧目录加右侧详情编辑的主从结构，并补充搜索、筛选计数与安全删除校验。",
            "组织管理页头部信息、统计卡片与操作区重新梳理，新增成员入口移动到团队详情操作区。",
        ],
    },
    {
        "id": "release-6",
        "version": "v1.3.0",
        "updated_at": datetime(2026, 4, 22, 11, 40),
        "features": [
            "法定节假日默认标记，并补充调休工作日展示，支持在排期中直接识别休假与补班日期。",
            "总览列表支持批量选择与批量删除，记录中心可追踪对应的增删改与导出动作。",
            "项目清单补齐项目执行周期列，并继续优化优先级标签、行内信息密度和负责人识别效率。",
        ],
    },
    {
        "id": "release-5",
        "version": "v1.2.0",
        "updated_at": datetime(2026, 4, 21, 22, 10),
        "features": [
            "项目条支持停留提示、整体拖动、首尾拉伸与上下移动负责人，排期调整更接近真实甘特交互。",
            "资源排期支持按天丝滑横向浏览，优化触控板与鼠标横向滑动并降低浏览器误回退。",
            "日期展示补充月份信息，今天日期加入淡色高亮，并把默认时间窗口收敛到更适合日常查看的短周期视图。",
        ],
    },
    {
        "id": "release-4",
        "version": "v1.1.0",
        "updated_at": datetime(2026, 4, 21, 19, 20),
        "features": [
            "资源排期支持按天丝滑横向浏览，优化触控板与鼠标横向滑动并降低浏览器误回退。",
            "项目条支持停留提示、整体拖动、首尾拉伸和上下换负责人，今天日期增加淡色高亮。",
            "导航与总览信息密度同步优化，项目清单新增项目执行周期列并提升优先级标签可读性。",
        ],
    },
    {
        "id": "release-3",
        "version": "v1.0.0",
        "updated_at": datetime(2026, 4, 21, 13, 30),
        "features": [
            "新增记录中心页面，支持按下拉框切换更新记录与操作记录。",
            "组织管理支持团队与成员的新增、编辑、删除与安全校验。",
            "甘特图项目条统一按照 P0 - P5 优先级颜色进行展示。",
        ],
    },
    {
        "id": "release-2",
        "version": "v0.9.0",
        "updated_at": datetime(2026, 4, 20, 17, 50),
        "features": [
            "月度资源排期视图支持整月日期展示与前后月份切换。",
            "支持在空白日期区域拖拽创建项目周期，并直接绑定负责人。",
            "Docker 本地部署链路可用，支持直接在本机容器中运行。",
        ],
    },
    {
        "id": "release-1",
        "version": "v0.8.0",
        "updated_at": datetime(2026, 4, 19, 16, 20),
        "features": [
            "页面整体切换为 Figma gantt dashboard 风格的中文业务界面。",
            "项目详情编辑、本地保存与基础筛选能力完成。",
            "团队、成员、项目三层数据结构完成建模。",
        ],
    },
]


def seed_database() -> None:
    has_any_data = db.session.query(Team.id).first() is not None
    if has_any_data:
        return

    teams = [
        Team(
            id="strategy",
            name="产品策略组",
            lead="林青",
            color="#5568ff",
            sort_order=0,
            created_at=now_local(),
            updated_at=now_local(),
        ),
        Team(
            id="design",
            name="体验设计组",
            lead="周亦",
            color="#22c55e",
            sort_order=1,
            created_at=now_local(),
            updated_at=now_local(),
        ),
        Team(
            id="delivery",
            name="前端交付组",
            lead="许衡",
            color="#06b6d4",
            sort_order=2,
            created_at=now_local(),
            updated_at=now_local(),
        ),
    ]
    db.session.add_all(teams)

    members = [
        Member(
            id="linqing",
            name="林青",
            role="产品负责人",
            team_id="strategy",
            avatar="林",
            capacity_hours=40,
            sort_order=0,
            created_at=now_local(),
            updated_at=now_local(),
        ),
        Member(
            id="mina",
            name="米娜",
            role="项目运营",
            team_id="strategy",
            avatar="米",
            capacity_hours=36,
            sort_order=1,
            created_at=now_local(),
            updated_at=now_local(),
        ),
        Member(
            id="zhouyi",
            name="周亦",
            role="设计负责人",
            team_id="design",
            avatar="周",
            capacity_hours=40,
            sort_order=2,
            created_at=now_local(),
            updated_at=now_local(),
        ),
        Member(
            id="xuheng",
            name="许衡",
            role="前端工程师",
            team_id="delivery",
            avatar="许",
            capacity_hours=44,
            sort_order=3,
            created_at=now_local(),
            updated_at=now_local(),
        ),
    ]
    db.session.add_all(members)

    tasks = [
        Task(
            id="alpha",
            title="资源排期工作台重构",
            owner_id="linqing",
            team_id="strategy",
            progress=72,
            status="进行中",
            priority="P0",
            start_date=date(2026, 4, 21),
            duration=4,
            sort_order=0,
            summary="统一桌面端与移动浏览器信息架构，确保一屏内完成资源分配、进度查看和风险识别。",
            milestone="4 月 28 日设计冻结",
            created_at=datetime(2026, 4, 21, 9, 10),
            updated_at=datetime(2026, 4, 21, 9, 10),
        ),
        Task(
            id="beta",
            title="客户交付彩排",
            owner_id="mina",
            team_id="strategy",
            progress=43,
            status="风险",
            priority="P1",
            start_date=date(2026, 4, 26),
            duration=3,
            sort_order=1,
            summary="需要补齐导出模板和风险清单，当前最大阻塞是客户评审时间和素材确认。",
            milestone="5 月 1 日对外彩排",
            created_at=datetime(2026, 4, 21, 10, 35),
            updated_at=datetime(2026, 4, 21, 10, 35),
        ),
        Task(
            id="gamma",
            title="中文化视觉升级",
            owner_id="zhouyi",
            team_id="design",
            progress=88,
            status="进行中",
            priority="P2",
            start_date=date(2026, 4, 22),
            duration=5,
            sort_order=2,
            summary="对齐 Figma gantt dashboard 的版式关系，并将核心文案、状态和操作全部本地化。",
            milestone="4 月 27 日视觉定稿",
            created_at=datetime(2026, 4, 21, 11, 20),
            updated_at=datetime(2026, 4, 21, 11, 20),
        ),
        Task(
            id="delta",
            title="时间线交互开发",
            owner_id="xuheng",
            team_id="delivery",
            progress=57,
            status="进行中",
            priority="P1",
            start_date=date(2026, 4, 23),
            duration=6,
            sort_order=3,
            summary="补齐搜索、筛选、时间调整、详情编辑和本地持久化，形成真正可演示的 MVP。",
            milestone="4 月 30 日联调完成",
            created_at=datetime(2026, 4, 21, 13, 5),
            updated_at=datetime(2026, 4, 21, 13, 5),
        ),
        Task(
            id="epsilon",
            title="导出模块验证",
            owner_id="xuheng",
            team_id="delivery",
            progress=100,
            status="已完成",
            priority="P5",
            start_date=date(2026, 4, 28),
            duration=2,
            sort_order=4,
            summary="JSON、打印视图与 Docker 部署链路已经跑通。",
            milestone="已完成",
            created_at=datetime(2026, 4, 20, 18, 20),
            updated_at=datetime(2026, 4, 20, 18, 20),
        ),
        Task(
            id="zeta",
            title="团队周报运营面板",
            owner_id="mina",
            team_id="strategy",
            progress=18,
            status="计划中",
            priority="P3",
            start_date=date(2026, 4, 27),
            duration=2,
            sort_order=5,
            summary="为 PMO 增加风险摘要和里程碑播报，方便每周例会快速汇报。",
            milestone="5 月 3 日上线",
            created_at=datetime(2026, 4, 21, 8, 30),
            updated_at=datetime(2026, 4, 21, 8, 30),
        ),
    ]
    db.session.add_all(tasks)

    releases = [ReleaseRecord(**record) for record in SEEDED_RELEASE_RECORDS]
    db.session.add_all(releases)

    operations = [
        OperationRecord(
            id="operation-1",
            actor="系统",
            action="历史迁移",
            target="记录中心",
            detail="已启用更新记录与操作记录双表视图。",
            created_at=datetime(2026, 4, 21, 13, 30),
        )
    ]
    db.session.add_all(operations)
    db.session.commit()

