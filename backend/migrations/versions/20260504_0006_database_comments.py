"""Add Chinese table and column comments for database dictionary lookup."""

from alembic import op


revision = "20260504_0006"
down_revision = "20260426_0005"
branch_labels = None
depends_on = None


TABLE_COMMENTS = {
    "accounts": "账号表：保存登录账号、角色权限、成员绑定关系和个人资料。",
    "members": "成员表：保存参与项目排期的人员、所属团队、头像和默认产能。",
    "operation_records": "操作记录表：保存新增、修改、删除、导出、查看等审计日志。",
    "release_records": "版本更新记录表：保存系统版本迭代说明，用于记录中心展示。",
    "tasks": "项目排期表：保存项目负责人、时间周期、状态、优先级和里程碑。",
    "teams": "团队表：保存组织团队、负责人、展示颜色和排序。",
}


COLUMN_COMMENTS = {
    "accounts": {
        "id": "账号唯一 ID，主键。",
        "username": "登录账号名，唯一。",
        "password_hash": "登录密码哈希值，只保存加密结果，不保存明文密码。",
        "role": "账号基础角色，admin 为管理员，member 为普通成员。",
        "member_id": "绑定的成员 ID，可为空；关联 members.id。",
        "is_active": "账号是否启用，false 表示禁用后不能登录。",
        "created_at": "账号创建时间，按系统本地时区保存。",
        "updated_at": "账号最近更新时间，按系统本地时区保存。",
        "display_name": "未绑定成员时展示的账号姓名。",
        "avatar": "文字头像内容，通常取姓名首字。",
        "avatar_image_mime": "上传头像图片的 MIME 类型，如 image/png、image/gif。",
        "avatar_image_data": "上传头像图片的 Base64 数据。",
    },
    "members": {
        "id": "成员唯一 ID，主键。",
        "name": "成员姓名，用于排期行、负责人和账号展示。",
        "role": "成员岗位或职责名称。",
        "team_id": "所属团队 ID，关联 teams.id。",
        "avatar": "文字头像内容，通常取姓名首字。",
        "avatar_image_mime": "上传头像图片的 MIME 类型，如 image/png、image/gif。",
        "avatar_image_data": "上传头像图片的 Base64 数据。",
        "capacity_hours": "成员默认可用产能小时数，用于资源利用率估算。",
        "sort_order": "成员排序值，数值越小越靠前。",
        "created_at": "成员创建时间，按系统本地时区保存。",
        "updated_at": "成员最近更新时间，按系统本地时区保存。",
    },
    "operation_records": {
        "id": "操作记录唯一 ID，主键。",
        "actor": "操作人名称。",
        "action": "操作类型，如新增、修改、删除、导出、查看、历史迁移。",
        "target": "操作对象名称。",
        "detail": "操作详情说明。",
        "created_at": "操作发生时间，按系统本地时区保存。",
    },
    "release_records": {
        "id": "版本记录唯一 ID，主键。",
        "version": "版本号，如 v1.9.1。",
        "updated_at": "版本发布时间或记录时间，按系统本地时区保存。",
        "features": "版本更新内容列表，JSON 数组。",
    },
    "tasks": {
        "id": "项目唯一 ID，主键。",
        "title": "项目名称。",
        "owner_id": "负责人成员 ID，关联 members.id。",
        "team_id": "所属团队 ID，关联 teams.id。",
        "progress": "项目进度百分比，范围 0 到 100。",
        "status": "项目状态，如计划中、进行中、风险、已完成。",
        "priority": "项目优先级，P0 最高，P5 最低。",
        "start_date": "项目开始日期。",
        "duration": "项目自然持续天数，结束日期由 start_date + duration - 1 推导。",
        "sort_order": "项目排序值，用于同一负责人下的展示顺序。",
        "summary": "项目摘要说明。",
        "milestone": "项目关键里程碑说明。",
        "created_at": "项目创建时间，按系统本地时区保存。",
        "updated_at": "项目最近更新时间，按系统本地时区保存。",
    },
    "teams": {
        "id": "团队唯一 ID，主键。",
        "name": "团队名称，唯一。",
        "lead": "团队负责人姓名。",
        "color": "团队展示颜色，通常为十六进制色值。",
        "sort_order": "团队排序值，数值越小越靠前。",
        "created_at": "团队创建时间，按系统本地时区保存。",
        "updated_at": "团队最近更新时间，按系统本地时区保存。",
    },
}


def _quote_identifier(identifier):
    return '"' + identifier.replace('"', '""') + '"'


def _quote_literal(value):
    return "'" + value.replace("'", "''") + "'"


def _comment_on_table(table_name, comment):
    op.execute(
        f"COMMENT ON TABLE {_quote_identifier(table_name)} IS {_quote_literal(comment)}"
    )


def _comment_on_column(table_name, column_name, comment):
    op.execute(
        "COMMENT ON COLUMN "
        f"{_quote_identifier(table_name)}.{_quote_identifier(column_name)} "
        f"IS {_quote_literal(comment)}"
    )


def _clear_table_comment(table_name):
    op.execute(f"COMMENT ON TABLE {_quote_identifier(table_name)} IS NULL")


def _clear_column_comment(table_name, column_name):
    op.execute(
        "COMMENT ON COLUMN "
        f"{_quote_identifier(table_name)}.{_quote_identifier(column_name)} IS NULL"
    )


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table_name, comment in TABLE_COMMENTS.items():
        _comment_on_table(table_name, comment)

    for table_name, columns in COLUMN_COMMENTS.items():
        for column_name, comment in columns.items():
            _comment_on_column(table_name, column_name, comment)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table_name, columns in COLUMN_COMMENTS.items():
        for column_name in columns:
            _clear_column_comment(table_name, column_name)

    for table_name in TABLE_COMMENTS:
        _clear_table_comment(table_name)
