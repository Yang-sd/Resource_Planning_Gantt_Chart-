import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  createMember as createMemberRequest,
  createTask as createTaskRequest,
  createTeam as createTeamRequest,
  createViewOperationRecord,
  deleteMember as deleteMemberRequest,
  deleteTask as deleteTaskRequest,
  deleteTeam as deleteTeamRequest,
  exportWorkspaceSnapshot,
  fetchBootstrap,
  fetchOperationRecords,
  fetchReleaseRecords,
  type ApiMember,
  type ApiOperationRecord,
  type ApiReleaseRecord,
  type ApiTask,
  type ApiTeam,
  updateMember as updateMemberRequest,
  updateTask as updateTaskRequest,
  updateTeam as updateTeamRequest,
} from './api'
import './App.css'

type Status = '计划中' | '进行中' | '风险' | '已完成'
type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

type Team = {
  id: string
  name: string
  lead: string
  color: string
  sortOrder: number
}

type Member = {
  id: string
  name: string
  role: string
  teamId: string
  avatar: string
  capacityHours: number
  sortOrder: number
}

type Task = {
  id: string
  title: string
  ownerId: string
  teamId: string
  progress: number
  status: Status
  priority: Priority
  startOffset: number
  duration: number
  sortOrder: number
  color: string
  summary: string
  milestone: string
  updatedAt: string
}

type ReleaseRecord = {
  id: string
  version: string
  updatedAt: string
  features: string[]
}

type OperationRecord = {
  id: string
  actor: string
  time: string
  action: '新增' | '修改' | '删除' | '导出' | '查看' | '历史迁移'
  target: string
  detail: string
}

type Workspace = {
  teams: Team[]
  members: Member[]
  tasks: Task[]
  updateRecords: ReleaseRecord[]
  operationRecords: OperationRecord[]
}

type TaskDraft = Pick<
  Task,
  | 'title'
  | 'ownerId'
  | 'status'
  | 'priority'
  | 'progress'
  | 'startOffset'
  | 'duration'
  | 'summary'
  | 'milestone'
>

type TeamDraft = Pick<Team, 'name' | 'lead' | 'color'>

type MemberDraft = Pick<Member, 'name' | 'role' | 'teamId' | 'avatar' | 'capacityHours'>

type ContextMenuState = {
  taskId: string
  x: number
  y: number
} | null

type EditModalState =
  | {
      mode: 'create'
      draft: TaskDraft
      insertAtStart?: boolean
      operationDetail?: string
    }
  | {
      mode: 'edit'
      taskId: string
      draft: TaskDraft
    }
  | null

type TeamEditorState = {
  mode: 'create' | 'edit'
  teamId?: string
  draft: TeamDraft
} | null

type MemberEditorState = {
  mode: 'create' | 'edit'
  memberId?: string
  draft: MemberDraft
} | null

type ResourceNoticeState = {
  tone: 'success' | 'danger'
  message: string
} | null

type ResourceDeleteTarget = {
  kind: 'team' | 'member'
  id: string
  name: string
} | null

type ResourcePanelTab = 'team' | 'member'

type DragSelectionState = {
  memberId: string
  anchorDay: number
  currentDay: number
  rectLeft: number
  rectWidth: number
  dayCount: number
} | null

type TaskTimelineInteractionMode = 'move' | 'resize-start' | 'resize-end'

type TaskTimelineInteractionState = {
  taskId: string
  mode: TaskTimelineInteractionMode
  pointerStartX: number
  laneWidth: number
  dayCount: number
  originalLaneIndex: number
  originalOwnerId: string
  originalTeamId: string
  originalStartOffset: number
  originalDuration: number
  previewLaneIndex: number
  previewOwnerId: string
  previewTeamId: string
  previewStartOffset: number
  previewDuration: number
} | null

type TaskCoachState = {
  taskId: string
  message: string
} | null

type MemberRowReorderState = {
  memberId: string
  previewIndex: number
  startY: number
  currentY: number
} | null

type TimelineBrowseState = {
  lastX: number
  stepWidth: number
} | null

type HolidayCalendarPeriodKind = 'holiday' | 'makeup-workday'

type HolidayCalendarPeriod = {
  id: string
  name: string
  start: string
  end: string
  kind: HolidayCalendarPeriodKind
}

type HolidayCalendarDayInfo = {
  holidayLabels: string[]
  makeupWorkdayLabels: string[]
}

type TimelineDay = {
  key: string
  date: Date
  dayLabel: string
  weekdayLabel: string
  specialDayLabel: string | null
  isHoliday: boolean
  isMakeupWorkday: boolean
  isToday: boolean
  isFocused: boolean
  isWeekend: boolean
  isOutsideVisibleMonth: boolean
  isMonthStart: boolean
}

type NavSection =
  | '总览'
  | '组织管理'
  | '资源排期'
  | '记录中心'
  | '账号管理'
type RecordView = '更新记录' | '操作记录'
type OverviewDurationFilter = '1天' | '2-3天' | '4-7天' | '8天以上'
type OverviewFilterMenu = 'owner' | 'status' | 'priority' | 'duration' | null
type TimelineFilterMenu = 'member' | 'holiday' | null

const STORAGE_KEY = 'human-gantt-workbench:v4'
const BASE_DATE = new Date()
const TIMELINE_WINDOW_DAYS = 14
const TIMELINE_WINDOW_STEP_DAYS = 7
const OVERVIEW_PAGE_SIZE = 10
const RECORD_PAGE_SIZE = 10
const priorityOrder: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']
const CURRENT_OPERATOR = '当前用户'

type RecordCollectionState<T> = {
  items: T[]
  total: number
}

const CHINA_OFFICIAL_HOLIDAY_CALENDAR_2026: HolidayCalendarPeriod[] = [
  { id: 'yuan-dan', name: '元旦', start: '2026-01-01', end: '2026-01-03', kind: 'holiday' },
  { id: 'yuan-dan-workday', name: '元旦', start: '2026-01-04', end: '2026-01-04', kind: 'makeup-workday' },
  { id: 'chun-jie', name: '春节', start: '2026-02-15', end: '2026-02-23', kind: 'holiday' },
  { id: 'chun-jie-workday-1', name: '春节', start: '2026-02-14', end: '2026-02-14', kind: 'makeup-workday' },
  { id: 'chun-jie-workday-2', name: '春节', start: '2026-02-28', end: '2026-02-28', kind: 'makeup-workday' },
  { id: 'qing-ming', name: '清明节', start: '2026-04-04', end: '2026-04-06', kind: 'holiday' },
  { id: 'lao-dong', name: '劳动节', start: '2026-05-01', end: '2026-05-05', kind: 'holiday' },
  { id: 'lao-dong-workday', name: '劳动节', start: '2026-05-09', end: '2026-05-09', kind: 'makeup-workday' },
  { id: 'duan-wu', name: '端午节', start: '2026-06-19', end: '2026-06-21', kind: 'holiday' },
  { id: 'zhong-qiu', name: '中秋节', start: '2026-09-25', end: '2026-09-27', kind: 'holiday' },
  { id: 'guo-qing-workday', name: '国庆节', start: '2026-09-20', end: '2026-09-20', kind: 'makeup-workday' },
  { id: 'guo-qing', name: '国庆节', start: '2026-10-01', end: '2026-10-07', kind: 'holiday' },
  { id: 'guo-qing-workday-2', name: '国庆节', start: '2026-10-10', end: '2026-10-10', kind: 'makeup-workday' },
]
const CHINA_OFFICIAL_HOLIDAY_CALENDAR_MAP_2026 = buildHolidayCalendarMap(
  CHINA_OFFICIAL_HOLIDAY_CALENDAR_2026,
)

const SEEDED_UPDATE_RECORDS: ReleaseRecord[] = [
  {
    id: 'release-12',
    version: 'v1.6.3',
    updatedAt: '2026/04/22 21:50',
    features: [
      '总览页项目表头与数据列重新统一列宽和内边距，负责人、状态、优先级、周期、里程碑对齐更稳定。',
      '项目清单增加更清晰的行区分样式，列表浏览时更容易锁定当前行，减少看错行的情况。',
    ],
  },
  {
    id: 'release-11',
    version: 'v1.6.2',
    updatedAt: '2026/04/22 21:36',
    features: [
      '左侧导航顺序微调，将组织管理入口下移一位，浏览路径更贴近先排期后管理的使用节奏。',
      '记录中心继续补齐最新页面调整，确保本地版本历史与当前界面保持一致。',
    ],
  },
  {
    id: 'release-10',
    version: 'v1.6.1',
    updatedAt: '2026/04/22 21:28',
    features: [
      '组织管理页移除成员周容量字段，成员清单、成员详情与成员编辑表单统一精简。',
      '成员编辑仅保留姓名、角色、所属团队和头像文字四个核心信息，减少无效维护项。',
      '成员信息卡片与详情指标重新收敛，只保留当前管理动作真正需要的内容。',
    ],
  },
  {
    id: 'release-9',
    version: 'v1.6.0',
    updatedAt: '2026/04/22 21:05',
    features: [
      '资源排期改为固定工作台布局，顶部筛选与日期头常驻，纵向浏览时不再带着整页一起滚动。',
      '成员行支持从左侧姓名区域直接左键拖拽调整上下顺序，排期视图与成员管理顺序同步。',
      '资源排期纵向滚动条改为隐藏式滚动，保留触控板与鼠标滚动体验，页面右侧不再出现明显长滚动条。',
    ],
  },
  {
    id: 'release-8',
    version: 'v1.5.0',
    updatedAt: '2026/04/22 20:10',
    features: [
      '总览页改为固定工作台布局，压缩顶部统计、筛选与表格行高，页面整体不再上下滚动。',
      '组织管理页与总览页统一改为局部滚动结构，团队列表与关联项目支持在各自区域内独立滚动。',
      '左侧导航精简为总览、组织管理、资源排期与记录中心四个主入口，并补齐记录中心版本更新记录。',
    ],
  },
  {
    id: 'release-7',
    version: 'v1.4.0',
    updatedAt: '2026/04/22 18:20',
    features: [
      '组织管理从弹窗迁移为独立页面，统一为团队视图与成员视图双工作台。',
      '团队与成员管理改为左侧目录加右侧详情编辑的主从结构，并补充搜索、筛选计数与安全删除校验。',
      '组织管理页头部信息、统计卡片与操作区重新梳理，新增成员入口移动到团队详情操作区。',
    ],
  },
  {
    id: 'release-6',
    version: 'v1.3.0',
    updatedAt: '2026/04/22 11:40',
    features: [
      '法定节假日默认标记，并补充调休工作日展示，支持在排期中直接识别休假与补班日期。',
      '总览列表支持批量选择与批量删除，记录中心可追踪对应的增删改与导出动作。',
      '项目清单补齐项目执行周期列，并继续优化优先级标签、行内信息密度和负责人识别效率。',
    ],
  },
  {
    id: 'release-5',
    version: 'v1.2.0',
    updatedAt: '2026/04/21 22:10',
    features: [
      '项目条支持停留提示、整体拖动、首尾拉伸与上下移动负责人，排期调整更接近真实甘特交互。',
      '资源排期支持按天丝滑横向浏览，优化触控板与鼠标横向滑动并降低浏览器误回退。',
      '日期展示补充月份信息，今天日期加入淡色高亮，并把默认时间窗口收敛到更适合日常查看的短周期视图。',
    ],
  },
  {
    id: 'release-4',
    version: 'v1.1.0',
    updatedAt: '2026/04/21 19:20',
    features: [
      '资源排期支持按天丝滑横向浏览，优化触控板与鼠标横向滑动并降低浏览器误回退。',
      '项目条支持停留提示、整体拖动、首尾拉伸和上下换负责人，今天日期增加淡色高亮。',
      '导航与总览信息密度同步优化，项目清单新增项目执行周期列并提升优先级标签可读性。',
    ],
  },
  {
    id: 'release-3',
    version: 'v1.0.0',
    updatedAt: '2026/04/21 13:30',
    features: [
      '新增记录中心页面，支持按下拉框切换更新记录与操作记录。',
      '组织管理支持团队与成员的新增、编辑、删除与安全校验。',
      '甘特图项目条统一按照 P0 - P5 优先级颜色进行展示。',
    ],
  },
  {
    id: 'release-2',
    version: 'v0.9.0',
    updatedAt: '2026/04/20 17:50',
    features: [
      '月度资源排期视图支持整月日期展示与前后月份切换。',
      '支持在空白日期区域拖拽创建项目周期，并直接绑定负责人。',
      'Docker 本地部署链路可用，支持直接在本机容器中运行。',
    ],
  },
  {
    id: 'release-1',
    version: 'v0.8.0',
    updatedAt: '2026/04/19 16:20',
    features: [
      '页面整体切换为 Figma gantt dashboard 风格的中文业务界面。',
      '项目详情编辑、本地保存与基础筛选能力完成。',
      '团队、成员、项目三层数据结构完成建模。',
    ],
  },
]

const SEEDED_OPERATION_RECORDS: OperationRecord[] = [
  {
    id: 'operation-1',
    actor: '系统',
    time: '2026/04/21 13:30',
    action: '历史迁移',
    target: '记录中心',
    detail: '已启用更新记录与操作记录双表视图。',
  },
]

const priorityPalette: Record<
  Priority,
  { hint: string; background: string; border: string; text: string; solid: string }
> = {
  P0: {
    hint: '立即处理',
    background: 'rgba(239, 68, 68, 0.14)',
    border: 'rgba(239, 68, 68, 0.28)',
    text: '#dc2626',
    solid: '#ef4444',
  },
  P1: {
    hint: '本周关键',
    background: 'rgba(249, 115, 22, 0.14)',
    border: 'rgba(249, 115, 22, 0.30)',
    text: '#ea580c',
    solid: '#f97316',
  },
  P2: {
    hint: '高优推进',
    background: 'rgba(245, 158, 11, 0.16)',
    border: 'rgba(245, 158, 11, 0.30)',
    text: '#b45309',
    solid: '#f59e0b',
  },
  P3: {
    hint: '常规排期',
    background: 'rgba(14, 165, 233, 0.14)',
    border: 'rgba(14, 165, 233, 0.28)',
    text: '#0369a1',
    solid: '#0ea5e9',
  },
  P4: {
    hint: '可顺延',
    background: 'rgba(99, 102, 241, 0.14)',
    border: 'rgba(99, 102, 241, 0.28)',
    text: '#4f46e5',
    solid: '#6366f1',
  },
  P5: {
    hint: '观察项',
    background: 'rgba(100, 116, 139, 0.14)',
    border: 'rgba(100, 116, 139, 0.28)',
    text: '#475569',
    solid: '#64748b',
  },
}

const defaultWorkspace: Workspace = {
  teams: [
    { id: 'strategy', name: '产品策略组', lead: '林青', color: '#5568ff', sortOrder: 0 },
    { id: 'design', name: '体验设计组', lead: '周亦', color: '#22c55e', sortOrder: 1 },
    { id: 'delivery', name: '前端交付组', lead: '许衡', color: '#06b6d4', sortOrder: 2 },
  ],
  members: [
    {
      id: 'linqing',
      name: '林青',
      role: '产品负责人',
      teamId: 'strategy',
      avatar: '林',
      capacityHours: 40,
      sortOrder: 0,
    },
    {
      id: 'mina',
      name: '米娜',
      role: '项目运营',
      teamId: 'strategy',
      avatar: '米',
      capacityHours: 36,
      sortOrder: 1,
    },
    {
      id: 'zhouyi',
      name: '周亦',
      role: '设计负责人',
      teamId: 'design',
      avatar: '周',
      capacityHours: 40,
      sortOrder: 2,
    },
    {
      id: 'xuheng',
      name: '许衡',
      role: '前端工程师',
      teamId: 'delivery',
      avatar: '许',
      capacityHours: 44,
      sortOrder: 3,
    },
  ],
  tasks: [
    {
      id: 'alpha',
      title: '资源排期工作台重构',
      ownerId: 'linqing',
      teamId: 'strategy',
      progress: 72,
      status: '进行中',
      priority: 'P0',
      startOffset: 0,
      duration: 4,
      sortOrder: 0,
      color: '#ef4444',
      summary:
        '统一桌面端与移动浏览器信息架构，确保一屏内完成资源分配、进度查看和风险识别。',
      milestone: '4 月 28 日设计冻结',
      updatedAt: '今天 09:10',
    },
    {
      id: 'beta',
      title: '客户交付彩排',
      ownerId: 'mina',
      teamId: 'strategy',
      progress: 43,
      status: '风险',
      priority: 'P1',
      startOffset: 5,
      duration: 3,
      sortOrder: 1,
      color: '#f97316',
      summary:
        '需要补齐导出模板和风险清单，当前最大阻塞是客户评审时间和素材确认。',
      milestone: '5 月 1 日对外彩排',
      updatedAt: '今天 10:35',
    },
    {
      id: 'gamma',
      title: '中文化视觉升级',
      ownerId: 'zhouyi',
      teamId: 'design',
      progress: 88,
      status: '进行中',
      priority: 'P2',
      startOffset: 1,
      duration: 5,
      sortOrder: 2,
      color: '#f59e0b',
      summary:
        '对齐 Figma gantt dashboard 的版式关系，并将核心文案、状态和操作全部本地化。',
      milestone: '4 月 27 日视觉定稿',
      updatedAt: '今天 11:20',
    },
    {
      id: 'delta',
      title: '时间线交互开发',
      ownerId: 'xuheng',
      teamId: 'delivery',
      progress: 57,
      status: '进行中',
      priority: 'P1',
      startOffset: 2,
      duration: 6,
      sortOrder: 3,
      color: '#f97316',
      summary:
        '补齐搜索、筛选、时间调整、详情编辑和本地持久化，形成真正可演示的 MVP。',
      milestone: '4 月 30 日联调完成',
      updatedAt: '今天 13:05',
    },
    {
      id: 'epsilon',
      title: '导出模块验证',
      ownerId: 'xuheng',
      teamId: 'delivery',
      progress: 100,
      status: '已完成',
      priority: 'P5',
      startOffset: 7,
      duration: 2,
      sortOrder: 4,
      color: '#64748b',
      summary: 'JSON、打印视图与 Docker 部署链路已经跑通。',
      milestone: '已完成',
      updatedAt: '昨天 18:20',
    },
    {
      id: 'zeta',
      title: '团队周报运营面板',
      ownerId: 'mina',
      teamId: 'strategy',
      progress: 18,
      status: '计划中',
      priority: 'P3',
      startOffset: 6,
      duration: 2,
      sortOrder: 5,
      color: '#0ea5e9',
      summary: '为 PMO 增加风险摘要和里程碑播报，方便每周例会快速汇报。',
      milestone: '5 月 3 日上线',
      updatedAt: '今天 08:30',
    },
  ],
  updateRecords: SEEDED_UPDATE_RECORDS,
  operationRecords: SEEDED_OPERATION_RECORDS,
}

function cloneDefaultWorkspace() {
  return JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
}

function formatTimeLabel() {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function formatTaskUpdatedAtFromApi(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const parsedDate = normalizeDate(parsed)
  const today = normalizeDate(BASE_DATE)
  const yesterday = addCalendarDays(today, -1)
  const timeLabel = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed)

  if (diffCalendarDays(parsedDate, today) === 0) {
    return `今天 ${timeLabel}`
  }

  if (diffCalendarDays(parsedDate, yesterday) === 0) {
    return `昨天 ${timeLabel}`
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed)
}

function formatAuditTimeLabelFromApi(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed)
}

function mapApiTeamToTeam(team: ApiTeam): Team {
  return {
    id: team.id,
    name: team.name,
    lead: team.lead,
    color: team.color,
    sortOrder: team.sortOrder,
  }
}

function mapApiMemberToMember(member: ApiMember): Member {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    teamId: member.teamId,
    avatar: member.avatar,
    capacityHours: member.capacityHours,
    sortOrder: member.sortOrder,
  }
}

function mapApiTaskToTask(task: ApiTask): Task {
  return {
    id: task.id,
    title: task.title,
    ownerId: task.ownerId,
    teamId: task.teamId,
    progress: task.progress,
    status: task.status as Status,
    priority: task.priority as Priority,
    startOffset: diffCalendarDays(parseDateInputValue(task.startDate), normalizeDate(BASE_DATE)),
    duration: task.duration,
    sortOrder: task.sortOrder,
    color: task.color,
    summary: task.summary,
    milestone: task.milestone,
    updatedAt: formatTaskUpdatedAtFromApi(task.updatedAt),
  }
}

function mapApiReleaseRecordToReleaseRecord(record: ApiReleaseRecord): ReleaseRecord {
  return {
    id: record.id,
    version: record.version,
    updatedAt: formatAuditTimeLabelFromApi(record.updatedAt),
    features: record.features,
  }
}

function mapApiOperationRecordToOperationRecord(record: ApiOperationRecord): OperationRecord {
  return {
    id: record.id,
    actor: record.actor,
    time: formatAuditTimeLabelFromApi(record.time),
    action: record.action,
    target: record.target,
    detail: record.detail,
  }
}

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return normalizeDate(next)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function startOfWeek(date: Date) {
  const normalizedDate = normalizeDate(date)
  const weekday = normalizedDate.getDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  return addCalendarDays(normalizedDate, offset)
}

function isDateInsideWindow(date: Date, windowStart: Date, windowEnd: Date) {
  const normalizedDate = normalizeDate(date)
  return normalizedDate >= normalizeDate(windowStart) && normalizedDate <= normalizeDate(windowEnd)
}

function diffCalendarDays(later: Date, earlier: Date) {
  const laterDate = normalizeDate(later).getTime()
  const earlierDate = normalizeDate(earlier).getTime()
  return Math.round((laterDate - earlierDate) / 86_400_000)
}

function formatMonthHeading(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

function formatFullDateHeading(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDateRangeKeys(start: string, end: string) {
  const startDate = parseDateInputValue(start)
  const endDate = parseDateInputValue(end)
  const dayCount = diffCalendarDays(endDate, startDate)
  return Array.from({ length: dayCount + 1 }, (_, index) =>
    formatDateInputValue(addCalendarDays(startDate, index)),
  )
}

function buildHolidayCalendarMap(periods: ReadonlyArray<HolidayCalendarPeriod>) {
  return periods.reduce((map, period) => {
    buildDateRangeKeys(period.start, period.end).forEach((dateKey) => {
      const calendarInfo = map.get(dateKey) ?? { holidayLabels: [], makeupWorkdayLabels: [] }

      if (period.kind === 'holiday') {
        map.set(dateKey, {
          ...calendarInfo,
          holidayLabels: [...calendarInfo.holidayLabels, period.name],
        })
        return
      }

      map.set(dateKey, {
        ...calendarInfo,
        makeupWorkdayLabels: [...calendarInfo.makeupWorkdayLabels, period.name],
      })
    })
    return map
  }, new Map<string, HolidayCalendarDayInfo>())
}

function formatTimelineSpecialDayLabel(dayInfo?: HolidayCalendarDayInfo) {
  if (!dayInfo) {
    return null
  }

  const labels: string[] = []
  if (dayInfo.holidayLabels.length > 0) {
    labels.push(`${dayInfo.holidayLabels.join(' / ')}假期`)
  }
  if (dayInfo.makeupWorkdayLabels.length > 0) {
    labels.push(`${dayInfo.makeupWorkdayLabels.join(' / ')}调休上班`)
  }

  return labels.length > 0 ? labels.join('；') : null
}

function formatCalendarDateLabel(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

function formatShortDateLabel(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}`
}

function formatMonthRangeLabel(date: Date) {
  return `${formatShortDateLabel(startOfMonth(date))} - ${formatShortDateLabel(endOfMonth(date))}`
}

function formatTimelineRangeLabel(startDate: Date, endDate: Date) {
  return `${formatShortDateLabel(startDate)} - ${formatShortDateLabel(endDate)}`
}

function formatTimelineHeading(startDate: Date, endDate: Date) {
  if (
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()
  ) {
    return formatMonthHeading(startDate)
  }

  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.getFullYear()}年${startDate.getMonth() + 1}月 - ${endDate.getMonth() + 1}月`
  }

  return `${formatMonthHeading(startDate)} - ${formatMonthHeading(endDate)}`
}

function parseDateInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

function resolveValidDate(value: string, fallback: Date) {
  const parsed = parseDateInputValue(value)
  return Number.isNaN(parsed.getTime()) ? normalizeDate(fallback) : normalizeDate(parsed)
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  )
}

function getTaskStartDate(task: Pick<Task, 'startOffset'>) {
  return addCalendarDays(BASE_DATE, task.startOffset)
}

function getTaskEndDate(task: Pick<Task, 'startOffset' | 'duration'>) {
  return addCalendarDays(getTaskStartDate(task), Math.max(task.duration - 1, 0))
}

function formatTaskExecutionRange(task: Pick<Task, 'startOffset' | 'duration'>) {
  return `${formatCalendarDateLabel(getTaskStartDate(task))} ~ ${formatCalendarDateLabel(
    getTaskEndDate(task),
  )}`
}

function parseTaskUpdatedAtValue(value: string) {
  const normalized = value.trim()

  const relativeMatch = normalized.match(/^(今天|昨天)\s+(\d{1,2})[:：](\d{2})$/)
  if (relativeMatch) {
    const [, label, hour, minute] = relativeMatch
    const baseDate = label === '昨天' ? addCalendarDays(BASE_DATE, -1) : BASE_DATE
    return new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate(),
      Number(hour),
      Number(minute),
    ).getTime()
  }

  const fullDateMatch = normalized.match(
    /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\s+(\d{1,2})[:：](\d{2})$/,
  )
  if (fullDateMatch) {
    const [, year, month, day, hour, minute] = fullDateMatch
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ).getTime()
  }

  const monthDayMatch = normalized.match(/^(\d{1,2})[/.-](\d{1,2})\s+(\d{1,2})[:：](\d{2})$/)
  if (monthDayMatch) {
    const [, month, day, hour, minute] = monthDayMatch
    return new Date(
      BASE_DATE.getFullYear(),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ).getTime()
  }

  const chineseMonthDayMatch = normalized.match(
    /^(\d{1,2})月(\d{1,2})日?\s+(\d{1,2})[:：](\d{2})$/,
  )
  if (chineseMonthDayMatch) {
    const [, month, day, hour, minute] = chineseMonthDayMatch
    return new Date(
      BASE_DATE.getFullYear(),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ).getTime()
  }

  return 0
}

function matchesOverviewDuration(duration: number, filter: OverviewDurationFilter) {
  if (filter === '1天') {
    return duration <= 1
  }

  if (filter === '2-3天') {
    return duration >= 2 && duration <= 3
  }

  if (filter === '4-7天') {
    return duration >= 4 && duration <= 7
  }

  return duration >= 8
}

function getTimelineHorizontalGestureDelta(input: {
  ctrlKey?: boolean
  deltaX: number
  deltaY: number
  shiftKey: boolean
  target: EventTarget | null
}) {
  if (input.ctrlKey) {
    return 0
  }

  const targetElement = input.target instanceof HTMLElement ? input.target : null
  if (targetElement?.closest('input, textarea, select, [contenteditable="true"]')) {
    return 0
  }

  const isHeaderBrowse = targetElement?.closest('.date-grid-browse') !== null
  const isHorizontalGesture = Math.abs(input.deltaX) > Math.abs(input.deltaY) * 1.15

  if (isHorizontalGesture) {
    return input.deltaX
  }

  if (input.shiftKey || isHeaderBrowse) {
    return input.deltaY
  }

  return 0
}

function buildTimelineDays(
  windowStart: Date,
  windowEnd: Date,
  focusedDate: Date | null,
  holidayCalendarMap?: Map<string, HolidayCalendarDayInfo>,
) {
  const today = normalizeDate(BASE_DATE)
  const normalizedFocus = focusedDate ? normalizeDate(focusedDate) : null
  const dayCount = diffCalendarDays(windowEnd, windowStart) + 1

  return Array.from({ length: dayCount }, (_, index) => {
    const date = addCalendarDays(windowStart, index)
    const dateKey = formatDateInputValue(date)
    const calendarInfo = holidayCalendarMap?.get(dateKey)
    const weekdayIndex = date.getDay()
    const weekdayLabel = ['日', '一', '二', '三', '四', '五', '六'][weekdayIndex] ?? '日'
    const isHoliday = (calendarInfo?.holidayLabels.length ?? 0) > 0
    const isMakeupWorkday = (calendarInfo?.makeupWorkdayLabels.length ?? 0) > 0

    return {
      key: dateKey,
      date,
      dayLabel: `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`,
      weekdayLabel: `周${weekdayLabel}`,
      specialDayLabel: formatTimelineSpecialDayLabel(calendarInfo),
      isHoliday,
      isMakeupWorkday,
      isFocused: normalizedFocus ? diffCalendarDays(date, normalizedFocus) === 0 : false,
      isToday: diffCalendarDays(date, today) === 0,
      isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
      isOutsideVisibleMonth: false,
      isMonthStart: date.getDate() === 1,
    } satisfies TimelineDay
  })
}

function taskOverlapsWindow(task: Pick<Task, 'startOffset' | 'duration'>, windowStart: Date, windowEnd: Date) {
  const taskStart = getTaskStartDate(task)
  const taskEnd = getTaskEndDate(task)
  return taskStart <= windowEnd && taskEnd >= windowStart
}

function resolveDayIndexFromPointer(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
  dayCount: number,
) {
  const safeWidth = Math.max(rectWidth, 1)
  const rawIndex = Math.floor(((clientX - rectLeft) / safeWidth) * dayCount)
  return Math.max(0, Math.min(dayCount - 1, rawIndex))
}

function resolveLaneIndexFromPointer(clientY: number, rectTop: number, taskCount: number) {
  const slotHeight = 40
  const rawIndex = Math.floor((clientY - rectTop + slotHeight * 0.5 - 10) / slotHeight)
  return Math.max(0, Math.min(taskCount, rawIndex))
}

function reorderVisibleMembers(allMembers: Member[], nextVisibleMemberIds: string[]) {
  const visibleMemberIds = new Set(nextVisibleMemberIds)
  const visibleMembersById = new Map(
    allMembers
      .filter((member) => visibleMemberIds.has(member.id))
      .map((member) => [member.id, member] as const),
  )
  let nextVisibleIndex = 0

  return allMembers.map((member) => {
    if (!visibleMemberIds.has(member.id)) {
      return member
    }

    const nextMemberId = nextVisibleMemberIds[nextVisibleIndex]
    nextVisibleIndex += 1
    return visibleMembersById.get(nextMemberId) ?? member
  })
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function createDraft(task: Task): TaskDraft {
  return {
    title: task.title,
    ownerId: task.ownerId,
    status: task.status,
    priority: task.priority,
    progress: task.progress,
    startOffset: task.startOffset,
    duration: task.duration,
    summary: task.summary,
    milestone: task.milestone,
  }
}

function createTeamDraft(team?: Team): TeamDraft {
  return {
    name: team?.name ?? '',
    lead: team?.lead ?? '',
    color: team?.color ?? '#5568ff',
  }
}

function createMemberDraft(member?: Member, fallbackTeamId?: string): MemberDraft {
  return {
    name: member?.name ?? '',
    role: member?.role ?? '',
    teamId: member?.teamId ?? fallbackTeamId ?? '',
    avatar: member?.avatar ?? '',
    capacityHours: member?.capacityHours ?? 40,
  }
}

function buildAvatarLabel(name: string) {
  return name.trim().charAt(0) || '新'
}

function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => cloneDefaultWorkspace())
  const [releaseRecordState, setReleaseRecordState] = useState<RecordCollectionState<ReleaseRecord>>({
    items: SEEDED_UPDATE_RECORDS.slice(0, RECORD_PAGE_SIZE),
    total: SEEDED_UPDATE_RECORDS.length,
  })
  const [operationRecordState, setOperationRecordState] = useState<
    RecordCollectionState<OperationRecord>
  >({
    items: SEEDED_OPERATION_RECORDS.slice(0, RECORD_PAGE_SIZE),
    total: SEEDED_OPERATION_RECORDS.length,
  })
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [activeNav, setActiveNav] = useState<NavSection>('资源排期')
  const [recordView, setRecordView] = useState<RecordView>('更新记录')
  const [recordPage, setRecordPage] = useState(1)
  const [selectedTaskId, setSelectedTaskId] = useState(() => defaultWorkspace.tasks[0].id)
  const [overviewPage, setOverviewPage] = useState(1)
  const [teamFilter, setTeamFilter] = useState('全部团队')
  const [statusFilter, setStatusFilter] = useState<'全部状态' | Status>('全部状态')
  const [timelineMemberFilter, setTimelineMemberFilter] = useState<string[]>([])
  const [timelineFilterMenu, setTimelineFilterMenu] = useState<TimelineFilterMenu>(null)
  const [isHolidayHighlightEnabled, setIsHolidayHighlightEnabled] = useState(true)
  const [overviewOwnerFilter, setOverviewOwnerFilter] = useState<string[]>([])
  const [overviewStatusFilter, setOverviewStatusFilter] = useState<Status[]>([])
  const [overviewPriorityFilter, setOverviewPriorityFilter] = useState<Priority[]>([])
  const [overviewDurationFilter, setOverviewDurationFilter] = useState<OverviewDurationFilter[]>([])
  const [overviewFilterMenu, setOverviewFilterMenu] = useState<OverviewFilterMenu>(null)
  const [overviewSelectedTaskIds, setOverviewSelectedTaskIds] = useState<string[]>([])
  const [timelineStartDate, setTimelineStartDate] = useState(() => startOfWeek(BASE_DATE))
  const [focusedDate, setFocusedDate] = useState(() => normalizeDate(BASE_DATE))
  const [isDateJumpOpen, setIsDateJumpOpen] = useState(false)
  const [pendingDateValue, setPendingDateValue] = useState(() => formatDateInputValue(BASE_DATE))
  const [searchValue, setSearchValue] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [editModal, setEditModal] = useState<EditModalState>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [overviewDeleteTargetIds, setOverviewDeleteTargetIds] = useState<string[]>([])
  const [teamEditor, setTeamEditor] = useState<TeamEditorState>(null)
  const [memberEditor, setMemberEditor] = useState<MemberEditorState>(null)
  const [resourceNotice, setResourceNotice] = useState<ResourceNoticeState>(null)
  const [resourceDeleteTarget, setResourceDeleteTarget] = useState<ResourceDeleteTarget>(null)
  const [resourcePanelTab, setResourcePanelTab] = useState<ResourcePanelTab>('team')
  const [resourceSearchValue, setResourceSearchValue] = useState('')
  const [selectedResourceTeamId, setSelectedResourceTeamId] = useState(
    () => defaultWorkspace.teams[0]?.id ?? '',
  )
  const [selectedResourceMemberId, setSelectedResourceMemberId] = useState(
    () => defaultWorkspace.members[0]?.id ?? '',
  )
  const [dragSelection, setDragSelection] = useState<DragSelectionState>(null)
  const [taskTimelineInteraction, setTaskTimelineInteraction] =
    useState<TaskTimelineInteractionState>(null)
  const [memberRowReorder, setMemberRowReorder] = useState<MemberRowReorderState>(null)
  const [pendingTaskCoachId, setPendingTaskCoachId] = useState<string | null>(null)
  const [taskCoach, setTaskCoach] = useState<TaskCoachState>(null)
  const deferredSearch = useDeferredValue(searchValue)
  const dragSelectionRef = useRef<DragSelectionState>(null)
  const taskTimelineInteractionRef = useRef<TaskTimelineInteractionState>(null)
  const memberRowReorderRef = useRef<MemberRowReorderState>(null)
  const dateJumpRef = useRef<HTMLDivElement | null>(null)
  const overviewFilterBarRef = useRef<HTMLDivElement | null>(null)
  const timelineFilterBarRef = useRef<HTMLDivElement | null>(null)
  const timelineGestureRegionRef = useRef<HTMLDivElement | null>(null)
  const timelineLaneRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const timelineRowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const timelineLaneMemberIdsRef = useRef<string[]>([])
  const timelineVisibleMemberIdsRef = useRef<string[]>([])
  const ignoreTaskClickRef = useRef(false)
  const hasUsedTimelineGestureRef = useRef(false)
  const timelineBrowseRef = useRef<TimelineBrowseState>(null)
  const wheelMonthSwitchRef = useRef({ delta: 0, lastAt: 0 })

  const applyBootstrapPayload = useCallback((payload: Awaited<ReturnType<typeof fetchBootstrap>>) => {
    setWorkspace((current) => ({
      ...current,
      teams: payload.teams
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(mapApiTeamToTeam),
      members: payload.members
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(mapApiMemberToMember),
      tasks: payload.tasks
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(mapApiTaskToTask),
    }))
    setReleaseRecordState((current) => ({
      ...current,
      total: payload.summary.releaseRecordCount,
    }))
    setOperationRecordState((current) => ({
      ...current,
      total: payload.summary.operationRecordCount,
    }))
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const refreshWorkspace = useCallback(async () => {
    try {
      setWorkspaceError(null)
      const payload = await fetchBootstrap()
      applyBootstrapPayload(payload)
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : '工作区数据加载失败。')
    } finally {
      setIsWorkspaceLoading(false)
    }
  }, [applyBootstrapPayload])

  const refreshRecordPage = async (nextView: RecordView, nextPage: number) => {
    try {
      setWorkspaceError(null)
      if (nextView === '更新记录') {
        const payload = await fetchReleaseRecords(nextPage, RECORD_PAGE_SIZE)
        setReleaseRecordState({
          items: payload.items.map(mapApiReleaseRecordToReleaseRecord),
          total: payload.total,
        })
        return
      }

      const payload = await fetchOperationRecords(nextPage, RECORD_PAGE_SIZE)
      setOperationRecordState({
        items: payload.items.map(mapApiOperationRecordToOperationRecord),
        total: payload.total,
      })
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : '记录中心数据加载失败。')
    }
  }

  const recordViewAction = async (target: string, detail: string) => {
    try {
      await createViewOperationRecord({
        actor: CURRENT_OPERATOR,
        target,
        detail,
      })
      await refreshWorkspace()
      if (activeNav === '记录中心' || target === '记录中心') {
        await refreshRecordPage('操作记录', recordView === '操作记录' ? recordPage : 1)
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : '查看记录写入失败。')
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadWorkspace = async () => {
      try {
        setWorkspaceError(null)
        const payload = await fetchBootstrap()
        if (cancelled) {
          return
        }
        applyBootstrapPayload(payload)
      } catch (error) {
        if (!cancelled) {
          setWorkspaceError(error instanceof Error ? error.message : '工作区数据加载失败。')
        }
      } finally {
        if (!cancelled) {
          setIsWorkspaceLoading(false)
        }
      }
    }

    void loadWorkspace()

    return () => {
      cancelled = true
    }
  }, [applyBootstrapPayload])

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null)
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
        setEditModal(null)
        setDeleteTargetId(null)
        setOverviewDeleteTargetIds([])
        setTeamEditor(null)
        setMemberEditor(null)
        setResourceNotice(null)
        setResourceDeleteTarget(null)
        setIsDateJumpOpen(false)
        setTimelineFilterMenu(null)
        dragSelectionRef.current = null
        setDragSelection(null)
        taskTimelineInteractionRef.current = null
        setTaskTimelineInteraction(null)
        memberRowReorderRef.current = null
        setMemberRowReorder(null)
        setPendingTaskCoachId(null)
        setTaskCoach(null)
      }
    }

    window.addEventListener('click', closeContextMenu)
    window.addEventListener('scroll', closeContextMenu, true)
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('scroll', closeContextMenu, true)
      window.removeEventListener('keydown', onEscape)
    }
  }, [])

  useEffect(() => {
    if (!isDateJumpOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!dateJumpRef.current?.contains(event.target as Node)) {
        setIsDateJumpOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isDateJumpOpen])

  useEffect(() => {
    if (!overviewFilterMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!overviewFilterBarRef.current?.contains(event.target as Node)) {
        setOverviewFilterMenu(null)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [overviewFilterMenu])

  useEffect(() => {
    if (!timelineFilterMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!timelineFilterBarRef.current?.contains(event.target as Node)) {
        setTimelineFilterMenu(null)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [timelineFilterMenu])

  useEffect(() => {
    const handleDeleteShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }

      if (
        isEditableKeyboardTarget(event.target) ||
        editModal ||
        deleteTargetId ||
        overviewDeleteTargetIds.length > 0 ||
        activeNav === '组织管理' ||
        teamEditor ||
        memberEditor ||
        resourceDeleteTarget
      ) {
        return
      }

      const keyboardSelectedTask = workspace.tasks.find((task) => task.id === selectedTaskId)
      if (!keyboardSelectedTask) {
        return
      }

      event.preventDefault()
      setContextMenu(null)
      setDeleteTargetId(keyboardSelectedTask.id)
    }

    window.addEventListener('keydown', handleDeleteShortcut)
    return () => {
      window.removeEventListener('keydown', handleDeleteShortcut)
    }
  }, [
    deleteTargetId,
    editModal,
    activeNav,
    memberEditor,
    overviewDeleteTargetIds,
    resourceDeleteTarget,
    selectedTaskId,
    teamEditor,
    workspace.tasks,
  ])

  const teamsById = useMemo(
    () => Object.fromEntries(workspace.teams.map((team) => [team.id, team])),
    [workspace.teams],
  )
  const membersById = useMemo(
    () => Object.fromEntries(workspace.members.map((member) => [member.id, member])),
    [workspace.members],
  )
  const tasksSnapshot = useMemo(() => {
    if (!taskTimelineInteraction) {
      return workspace.tasks
    }

    return workspace.tasks.map((task) =>
      task.id === taskTimelineInteraction.taskId
        ? {
            ...task,
            ownerId: taskTimelineInteraction.previewOwnerId,
            teamId: taskTimelineInteraction.previewTeamId,
            startOffset: taskTimelineInteraction.previewStartOffset,
            duration: taskTimelineInteraction.previewDuration,
          }
        : task,
    )
  }, [taskTimelineInteraction, workspace.tasks])
  const teamStats = useMemo(
    () =>
      Object.fromEntries(
        workspace.teams.map((team) => [
          team.id,
          {
            memberCount: workspace.members.filter((member) => member.teamId === team.id).length,
            taskCount: tasksSnapshot.filter((task) => task.teamId === team.id).length,
          },
        ]),
      ),
    [tasksSnapshot, workspace.members, workspace.teams],
  )
  const memberTaskCounts = useMemo(
    () =>
      Object.fromEntries(
        workspace.members.map((member) => [
          member.id,
          tasksSnapshot.filter((task) => task.ownerId === member.id).length,
        ]),
      ),
    [tasksSnapshot, workspace.members],
  )

  const visibleMonthStart = useMemo(
    () => normalizeDate(timelineStartDate),
    [timelineStartDate],
  )
  const timelineWindowDayCount = TIMELINE_WINDOW_DAYS
  const visibleMonthEnd = useMemo(
    () => addCalendarDays(visibleMonthStart, timelineWindowDayCount - 1),
    [timelineWindowDayCount, visibleMonthStart],
  )
  const isFocusedDateInVisibleMonth = isDateInsideWindow(
    focusedDate,
    visibleMonthStart,
    visibleMonthEnd,
  )
  const timelineDays = useMemo(
    () =>
      buildTimelineDays(
        visibleMonthStart,
        visibleMonthEnd,
        isFocusedDateInVisibleMonth ? focusedDate : null,
        isHolidayHighlightEnabled ? CHINA_OFFICIAL_HOLIDAY_CALENDAR_MAP_2026 : undefined,
      ),
    [
      focusedDate,
      isFocusedDateInVisibleMonth,
      isHolidayHighlightEnabled,
      visibleMonthEnd,
      visibleMonthStart,
    ],
  )
  const focusedDayIndex = diffCalendarDays(focusedDate, visibleMonthStart)
  const isFocusedDateVisible =
    isFocusedDateInVisibleMonth && focusedDayIndex >= 0 && focusedDayIndex < timelineDays.length
  const todayDayIndex = diffCalendarDays(normalizeDate(BASE_DATE), visibleMonthStart)
  const isTodayVisible = todayDayIndex >= 0 && todayDayIndex < timelineDays.length
  const timelineStyle = {
    '--days': timelineDays.length,
    '--day-size': 'clamp(38px, 2.9vw, 46px)',
    '--name-col': 'clamp(78px, 7vw, 94px)',
    '--focused-left': `${isFocusedDateVisible ? (focusedDayIndex / timelineDays.length) * 100 : 0}%`,
    '--focused-width': `${100 / timelineDays.length}%`,
    '--focus-opacity': isFocusedDateVisible ? 1 : 0,
    '--today-left': `${isTodayVisible ? (todayDayIndex / timelineDays.length) * 100 : 0}%`,
    '--today-width': `${100 / timelineDays.length}%`,
    '--today-opacity': isTodayVisible ? 1 : 0,
  } as CSSProperties

  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const overviewDurationOptions: OverviewDurationFilter[] = ['1天', '2-3天', '4-7天', '8天以上']
  const resetOverviewPage = () => setOverviewPage(1)
  const toggleOverviewOwnerFilter = (ownerId: string) => {
    setOverviewOwnerFilter((current) =>
      current.includes(ownerId) ? current.filter((item) => item !== ownerId) : [...current, ownerId],
    )
    resetOverviewPage()
  }
  const toggleOverviewStatusFilter = (status: Status) => {
    setOverviewStatusFilter((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
    )
    resetOverviewPage()
  }
  const toggleOverviewPriorityFilter = (priority: Priority) => {
    setOverviewPriorityFilter((current) =>
      current.includes(priority) ? current.filter((item) => item !== priority) : [...current, priority],
    )
    resetOverviewPage()
  }
  const toggleOverviewDurationFilter = (durationOption: OverviewDurationFilter) => {
    setOverviewDurationFilter((current) =>
      current.includes(durationOption)
        ? current.filter((item) => item !== durationOption)
        : [...current, durationOption],
    )
    resetOverviewPage()
  }
  const clearOverviewOwnerFilter = () => {
    setOverviewOwnerFilter([])
    resetOverviewPage()
  }
  const clearOverviewStatusFilter = () => {
    setOverviewStatusFilter([])
    resetOverviewPage()
  }
  const clearOverviewPriorityFilter = () => {
    setOverviewPriorityFilter([])
    resetOverviewPage()
  }
  const clearOverviewDurationFilter = () => {
    setOverviewDurationFilter([])
    resetOverviewPage()
  }
  const clearOverviewFilters = () => {
    setSearchValue('')
    setTeamFilter('全部团队')
    setOverviewOwnerFilter([])
    setOverviewStatusFilter([])
    setOverviewPriorityFilter([])
    setOverviewDurationFilter([])
    setOverviewPage(1)
  }
  const effectiveTimelineMemberFilter = useMemo(
    () => timelineMemberFilter.filter((memberId) => Boolean(membersById[memberId])),
    [membersById, timelineMemberFilter],
  )
  const timelineMemberSummary =
    effectiveTimelineMemberFilter.length === 0 ? '全部成员' : `成员 ${effectiveTimelineMemberFilter.length}`
  const toggleTimelineMemberFilter = (memberId: string) => {
    setTimelineMemberFilter((current) =>
      current.includes(memberId)
        ? current.filter((item) => item !== memberId)
        : [...current, memberId],
    )
  }
  const clearTimelineMemberFilter = () => {
    setTimelineMemberFilter([])
  }
  const hasOverviewFilters =
    normalizedSearch.length > 0 ||
    teamFilter !== '全部团队' ||
    overviewOwnerFilter.length > 0 ||
    overviewStatusFilter.length > 0 ||
    overviewPriorityFilter.length > 0 ||
    overviewDurationFilter.length > 0
  const overviewOwnerSummary =
    overviewOwnerFilter.length === 0 ? '全部负责人' : `负责人 ${overviewOwnerFilter.length}`
  const overviewStatusSummary =
    overviewStatusFilter.length === 0 ? '全部状态' : `状态 ${overviewStatusFilter.length}`
  const overviewPrioritySummary =
    overviewPriorityFilter.length === 0 ? '全部优先级' : `优先级 ${overviewPriorityFilter.length}`
  const overviewDurationSummary =
    overviewDurationFilter.length === 0 ? '全部周期' : `周期 ${overviewDurationFilter.length}`
  const overviewTasks = useMemo(() => {
    return tasksSnapshot
      .filter((task) => {
        const member = membersById[task.ownerId]
        const matchesSearch =
          !normalizedSearch ||
          task.title.toLowerCase().includes(normalizedSearch) ||
          member?.name.toLowerCase().includes(normalizedSearch)

        const matchesTeam = teamFilter === '全部团队' || task.teamId === teamFilter
        const matchesOwner =
          overviewOwnerFilter.length === 0 || overviewOwnerFilter.includes(task.ownerId)
        const matchesStatus =
          overviewStatusFilter.length === 0 || overviewStatusFilter.includes(task.status)
        const matchesPriority =
          overviewPriorityFilter.length === 0 || overviewPriorityFilter.includes(task.priority)
        const matchesDuration =
          overviewDurationFilter.length === 0 ||
          overviewDurationFilter.some((filter) => matchesOverviewDuration(task.duration, filter))

        return (
          matchesSearch &&
          matchesTeam &&
          matchesOwner &&
          matchesStatus &&
          matchesPriority &&
          matchesDuration
        )
      })
      .sort((left, right) => {
        const updatedAtDelta =
          parseTaskUpdatedAtValue(right.updatedAt) - parseTaskUpdatedAtValue(left.updatedAt)
        if (updatedAtDelta !== 0) {
          return updatedAtDelta
        }

        return right.startOffset - left.startOffset
      })
  }, [
    membersById,
    normalizedSearch,
    overviewDurationFilter,
    overviewOwnerFilter,
    overviewPriorityFilter,
    overviewStatusFilter,
    tasksSnapshot,
    teamFilter,
  ])
  const overviewTotalPages = Math.max(1, Math.ceil(overviewTasks.length / OVERVIEW_PAGE_SIZE))
  const effectiveOverviewPage = Math.min(overviewPage, overviewTotalPages)
  const overviewVisibleTasks = useMemo(() => {
    const startIndex = (effectiveOverviewPage - 1) * OVERVIEW_PAGE_SIZE
    return overviewTasks.slice(startIndex, startIndex + OVERVIEW_PAGE_SIZE)
  }, [effectiveOverviewPage, overviewTasks])
  const recordTotalCount =
    recordView === '更新记录'
      ? releaseRecordState.total
      : operationRecordState.total
  const recordTotalPages = Math.max(1, Math.ceil(recordTotalCount / RECORD_PAGE_SIZE))
  const effectiveRecordPage = Math.min(recordPage, recordTotalPages)
  const visibleUpdateRecords = releaseRecordState.items
  const visibleOperationRecords = operationRecordState.items
  const overviewTaskIds = useMemo(() => overviewTasks.map((task) => task.id), [overviewTasks])
  const overviewVisibleTaskIds = useMemo(
    () => overviewVisibleTasks.map((task) => task.id),
    [overviewVisibleTasks],
  )
  const overviewTaskIdSet = useMemo(() => new Set(overviewTaskIds), [overviewTaskIds])
  const effectiveOverviewSelectedTaskIds = useMemo(
    () => overviewSelectedTaskIds.filter((taskId) => overviewTaskIdSet.has(taskId)),
    [overviewSelectedTaskIds, overviewTaskIdSet],
  )
  const overviewSelectedTaskSet = useMemo(
    () => new Set(effectiveOverviewSelectedTaskIds),
    [effectiveOverviewSelectedTaskIds],
  )
  const overviewSelectedVisibleCount = overviewVisibleTaskIds.filter((taskId) =>
    overviewSelectedTaskSet.has(taskId),
  ).length
  const isAllOverviewTasksSelected =
    overviewTasks.length > 0 && effectiveOverviewSelectedTaskIds.length === overviewTasks.length
  const isAllOverviewVisibleTasksSelected =
    overviewVisibleTasks.length > 0 &&
    overviewSelectedVisibleCount === overviewVisibleTasks.length
  const isSomeOverviewVisibleTasksSelected =
    overviewSelectedVisibleCount > 0 && !isAllOverviewVisibleTasksSelected

  const overviewSelectedTaskId = overviewVisibleTasks.some((task) => task.id === selectedTaskId)
    ? selectedTaskId
    : overviewVisibleTasks[0]?.id ?? null
  const toggleOverviewTaskSelection = (taskId: string) => {
    setOverviewSelectedTaskIds((current) =>
      current.includes(taskId) ? current.filter((item) => item !== taskId) : [...current, taskId],
    )
  }
  const toggleOverviewVisibleTaskSelection = () => {
    if (overviewVisibleTaskIds.length === 0) {
      return
    }

    const visibleTaskIdSet = new Set(overviewVisibleTaskIds)
    setOverviewSelectedTaskIds((current) => {
      const areAllVisibleSelected = overviewVisibleTaskIds.every((taskId) => current.includes(taskId))
      if (areAllVisibleSelected) {
        return current.filter((taskId) => !visibleTaskIdSet.has(taskId))
      }

      const nextSelection = new Set(current)
      overviewVisibleTaskIds.forEach((taskId) => nextSelection.add(taskId))
      return Array.from(nextSelection)
    })
  }
  const selectAllOverviewTasks = () => {
    setOverviewSelectedTaskIds(overviewTaskIds)
  }
  const clearOverviewTaskSelection = () => {
    setOverviewSelectedTaskIds([])
  }
  const ganttTasks = useMemo(
    () => tasksSnapshot.filter((task) => statusFilter === '全部状态' || task.status === statusFilter),
    [statusFilter, tasksSnapshot],
  )
  const visibleMonthTasks = useMemo(
    () =>
      ganttTasks.filter((task) => taskOverlapsWindow(task, visibleMonthStart, visibleMonthEnd)),
    [ganttTasks, visibleMonthEnd, visibleMonthStart],
  )

  const memberRows = useMemo(() => {
    return workspace.members
      .filter(
        (member) =>
          effectiveTimelineMemberFilter.length === 0 ||
          effectiveTimelineMemberFilter.includes(member.id),
      )
      .map((member) => {
        const tasks = visibleMonthTasks.filter((task) => task.ownerId === member.id)
        const visibleMonthBookedHours = visibleMonthTasks
          .filter((task) => task.ownerId === member.id)
          .reduce((sum, task) => sum + task.duration * 4, 0)
        const utilization = Math.min(
          100,
          Math.round((visibleMonthBookedHours / Math.max(member.capacityHours, 1)) * 100),
        )

        return {
          member,
          tasks,
          utilization,
          freeHours: Math.max(0, member.capacityHours - visibleMonthBookedHours),
        }
      })
  }, [effectiveTimelineMemberFilter, visibleMonthTasks, workspace.members])

  useEffect(() => {
    timelineLaneMemberIdsRef.current = memberRows.map((row) => row.member.id)
    timelineVisibleMemberIdsRef.current = memberRows.map((row) => row.member.id)
  }, [memberRows])

  const riskTasks = tasksSnapshot.filter((task) => task.status === '风险')
  const activeTasks = tasksSnapshot.filter((task) => task.status === '进行中')
  const visibleMonthLabel = formatTimelineHeading(visibleMonthStart, visibleMonthEnd)
  const visibleMonthRange = formatTimelineRangeLabel(visibleMonthStart, visibleMonthEnd)
  const defaultTimelineStartDate = startOfWeek(BASE_DATE)
  const isCurrentTimelineWindow =
    diffCalendarDays(visibleMonthStart, defaultTimelineStartDate) === 0
  const isDraggingSelection = dragSelection !== null
  const isTaskTimelineInteracting = taskTimelineInteraction !== null
  const isMemberRowReordering = memberRowReorder !== null
  const isRecordsPage = activeNav === '记录中心'
  const isResourceManagementPage = activeNav === '组织管理'
  const isResourceTimelinePage = activeNav === '资源排期'
  const isOverviewPage =
    !isRecordsPage && !isResourceTimelinePage && !isResourceManagementPage
  const normalizedResourceSearch = resourceSearchValue.trim().toLowerCase()
  const filteredResourceTeams = useMemo(
    () =>
      workspace.teams.filter((team) => {
        if (!normalizedResourceSearch) {
          return true
        }

        return (
          team.name.toLowerCase().includes(normalizedResourceSearch) ||
          team.lead.toLowerCase().includes(normalizedResourceSearch)
        )
      }),
    [normalizedResourceSearch, workspace.teams],
  )
  const filteredResourceMembers = useMemo(
    () =>
      workspace.members.filter((member) => {
        if (!normalizedResourceSearch) {
          return true
        }

        return (
          member.name.toLowerCase().includes(normalizedResourceSearch) ||
          member.role.toLowerCase().includes(normalizedResourceSearch) ||
          (teamsById[member.teamId]?.name ?? '').toLowerCase().includes(normalizedResourceSearch)
        )
      }),
    [normalizedResourceSearch, teamsById, workspace.members],
  )
  const effectiveSelectedResourceTeamId = useMemo(() => {
    if (resourcePanelTab === 'team' && normalizedResourceSearch && filteredResourceTeams.length > 0) {
      return filteredResourceTeams.some((team) => team.id === selectedResourceTeamId)
        ? selectedResourceTeamId
        : filteredResourceTeams[0].id
    }

    if (workspace.teams.some((team) => team.id === selectedResourceTeamId)) {
      return selectedResourceTeamId
    }

    return filteredResourceTeams[0]?.id ?? workspace.teams[0]?.id ?? ''
  }, [
    filteredResourceTeams,
    normalizedResourceSearch,
    resourcePanelTab,
    selectedResourceTeamId,
    workspace.teams,
  ])
  const effectiveSelectedResourceMemberId = useMemo(() => {
    if (
      resourcePanelTab === 'member' &&
      normalizedResourceSearch &&
      filteredResourceMembers.length > 0
    ) {
      return filteredResourceMembers.some((member) => member.id === selectedResourceMemberId)
        ? selectedResourceMemberId
        : filteredResourceMembers[0].id
    }

    if (workspace.members.some((member) => member.id === selectedResourceMemberId)) {
      return selectedResourceMemberId
    }

    return filteredResourceMembers[0]?.id ?? workspace.members[0]?.id ?? ''
  }, [
    filteredResourceMembers,
    normalizedResourceSearch,
    resourcePanelTab,
    selectedResourceMemberId,
    workspace.members,
  ])
  const activeResourceTeam = teamsById[effectiveSelectedResourceTeamId] ?? workspace.teams[0] ?? null
  const activeResourceMember =
    membersById[effectiveSelectedResourceMemberId] ?? workspace.members[0] ?? null
  const activeResourceTeamMembers = useMemo(
    () =>
      activeResourceTeam
        ? workspace.members.filter((member) => member.teamId === activeResourceTeam.id)
        : [],
    [activeResourceTeam, workspace.members],
  )
  const activeResourceTeamTasks = useMemo(
    () =>
      activeResourceTeam ? workspace.tasks.filter((task) => task.teamId === activeResourceTeam.id) : [],
    [activeResourceTeam, workspace.tasks],
  )
  const activeResourceMemberTeam = activeResourceMember
    ? teamsById[activeResourceMember.teamId] ?? null
    : null
  const activeResourceMemberTasks = useMemo(
    () =>
      activeResourceMember
        ? workspace.tasks.filter((task) => task.ownerId === activeResourceMember.id)
        : [],
    [activeResourceMember, workspace.tasks],
  )
  const activeResourcePanelTitle = resourcePanelTab === 'team' ? '团队目录' : '成员目录'
  const activeResourcePanelCopy =
    resourcePanelTab === 'team'
      ? '按团队快速浏览负责人、成员规模和项目负载，右侧统一查看与编辑。'
      : '按成员集中查看角色、归属团队与负责项目，减少来回切换确认。'
  const deleteConfirmTaskIds = deleteTargetId ? [deleteTargetId] : effectiveOverviewSelectedTaskIds
  const deleteConfirmTaskIdSet = new Set(deleteConfirmTaskIds)
  const deleteConfirmTasks = workspace.tasks.filter((task) => deleteConfirmTaskIdSet.has(task.id))
  const deleteConfirmCount = deleteConfirmTaskIds.length
  const isBulkDeleteConfirm = !deleteTargetId && effectiveOverviewSelectedTaskIds.length > 0
  const deleteConfirmPreview = deleteConfirmTasks
    .slice(0, 3)
    .map((task) => task.title)
    .join('、')
  const pendingJumpDate = useMemo(
    () =>
      resolveValidDate(
        pendingDateValue,
        isFocusedDateInVisibleMonth ? focusedDate : visibleMonthStart,
      ),
    [focusedDate, isFocusedDateInVisibleMonth, pendingDateValue, visibleMonthStart],
  )
  const pendingJumpMonthLabel = formatMonthHeading(pendingJumpDate)
  const pendingJumpMonthRange = formatMonthRangeLabel(pendingJumpDate)
  const isFixedWorkspacePage =
    isRecordsPage || isResourceManagementPage || isOverviewPage || isResourceTimelinePage
  const mainPanelClassName = isRecordsPage
    ? 'main-panel main-panel-fixed main-panel-records'
    : isResourceTimelinePage
      ? 'main-panel main-panel-fixed main-panel-resource'
    : isResourceManagementPage || isOverviewPage
      ? 'main-panel main-panel-fixed'
      : 'main-panel'
  const syncBannerMessage = isWorkspaceLoading
    ? '正在连接 Flask API 并同步最新工作区数据...'
    : isExporting
      ? '正在导出 MySQL 当前工作区快照...'
      : null

  useEffect(() => {
    if (activeNav !== '记录中心') {
      return
    }

    let cancelled = false

    const loadRecords = async () => {
      try {
        setWorkspaceError(null)
        if (recordView === '更新记录') {
          const payload = await fetchReleaseRecords(effectiveRecordPage, RECORD_PAGE_SIZE)
          if (!cancelled) {
            setReleaseRecordState({
              items: payload.items.map(mapApiReleaseRecordToReleaseRecord),
              total: payload.total,
            })
          }
          return
        }

        const payload = await fetchOperationRecords(effectiveRecordPage, RECORD_PAGE_SIZE)
        if (!cancelled) {
          setOperationRecordState({
            items: payload.items.map(mapApiOperationRecordToOperationRecord),
            total: payload.total,
          })
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceError(error instanceof Error ? error.message : '记录中心数据加载失败。')
        }
      }
    }

    void loadRecords()

    return () => {
      cancelled = true
    }
  }, [activeNav, effectiveRecordPage, recordView])

  const syncDragSelection = (nextSelection: DragSelectionState) => {
    dragSelectionRef.current = nextSelection
    setDragSelection(nextSelection)
  }

  const syncTaskTimelineInteraction = (nextInteraction: TaskTimelineInteractionState) => {
    taskTimelineInteractionRef.current = nextInteraction
    setTaskTimelineInteraction(nextInteraction)
  }

  const syncMemberRowReorder = (nextReorder: MemberRowReorderState) => {
    memberRowReorderRef.current = nextReorder
    setMemberRowReorder(nextReorder)
  }

  const jumpToDate = (date: Date) => {
    const normalizedDate = normalizeDate(date)
    setFocusedDate(normalizedDate)
    setPendingDateValue(formatDateInputValue(normalizedDate))
    setTimelineStartDate(startOfWeek(normalizedDate))
    setIsDateJumpOpen(false)
  }

  const handlePendingDateChange = (value: string) => {
    const parsedDate = parseDateInputValue(value)
    if (Number.isNaN(parsedDate.getTime())) {
      setPendingDateValue(value)
      return
    }

    jumpToDate(parsedDate)
  }

  const shiftTimelineDays = (delta: number) => {
    if (delta === 0) {
      return
    }

    setTimelineStartDate((current) => addCalendarDays(current, delta))
    setIsDateJumpOpen(false)
  }

  const shiftTimelineWindow = (delta: number) => {
    const nextWindowStart = addCalendarDays(visibleMonthStart, delta * TIMELINE_WINDOW_STEP_DAYS)
    setPendingDateValue(formatDateInputValue(nextWindowStart))
    setTimelineStartDate(nextWindowStart)
    setIsDateJumpOpen(false)
  }

  const commitTimelineBrowse = useEffectEvent((delta: number) => {
    shiftTimelineDays(delta)
  })

  const commitWheelMonthSwitch = (horizontalDelta: number) => {
    const gestureRegion = timelineGestureRegionRef.current
    const dayStepWidth = Math.max(
      ((gestureRegion?.getBoundingClientRect().width ?? 720) / Math.max(timelineDays.length, 1)) * 0.7,
      12,
    )
    const now = Date.now()
    if (now - wheelMonthSwitchRef.current.lastAt > 180) {
      wheelMonthSwitchRef.current.delta = 0
    }

    wheelMonthSwitchRef.current.delta += horizontalDelta
    wheelMonthSwitchRef.current.lastAt = now

    const dayShift = Math.trunc(wheelMonthSwitchRef.current.delta / dayStepWidth)
    if (dayShift === 0) {
      return
    }

    shiftTimelineDays(dayShift)
    wheelMonthSwitchRef.current.delta -= dayShift * dayStepWidth
  }

  const handleTimelineWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const horizontalDelta = getTimelineHorizontalGestureDelta({
      ctrlKey: event.ctrlKey,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      shiftKey: event.shiftKey,
      target: event.target,
    })

    if (Math.abs(horizontalDelta) < 1) {
      return
    }

    event.preventDefault()
    commitWheelMonthSwitch(horizontalDelta)
  }

  const startTimelineBrowse = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    timelineBrowseRef.current = {
      lastX: event.clientX,
      stepWidth: Math.max(event.currentTarget.getBoundingClientRect().width / Math.max(timelineDays.length, 1), 1),
    }
  }

  const startMemberRowReorder = (
    event: ReactMouseEvent<HTMLDivElement>,
    memberId: string,
  ) => {
    if (event.button !== 0 || isTaskTimelineInteracting || isDraggingSelection) {
      return
    }

    const visibleMemberIds = memberRows.map((row) => row.member.id)
    const originalIndex = visibleMemberIds.indexOf(memberId)

    if (originalIndex === -1 || visibleMemberIds.length <= 1) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setPendingTaskCoachId(null)
    setTaskCoach(null)

    syncMemberRowReorder({
      memberId,
      previewIndex: originalIndex,
      startY: event.clientY,
      currentY: event.clientY,
    })
  }

  useEffect(() => {
    if (
      !pendingTaskCoachId ||
      activeNav !== '资源排期' ||
      hasUsedTimelineGestureRef.current ||
      isTaskTimelineInteracting
    ) {
      return
    }

    const revealTimer = window.setTimeout(() => {
      if (hasUsedTimelineGestureRef.current) {
        return
      }

      setTaskCoach({
        taskId: pendingTaskCoachId,
        message: '拖动中间可改时间并移交成员，拖动两端可调整起止时间',
      })
    }, 1500)

    const hideTimer = window.setTimeout(() => {
      setTaskCoach((current) =>
        current?.taskId === pendingTaskCoachId ? null : current,
      )
    }, 4300)

    return () => {
      window.clearTimeout(revealTimer)
      window.clearTimeout(hideTimer)
    }
  }, [activeNav, isTaskTimelineInteracting, pendingTaskCoachId])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const currentBrowse = timelineBrowseRef.current
      if (!currentBrowse) {
        return
      }

      const deltaX = currentBrowse.lastX - event.clientX
      const browseStep = Math.max(currentBrowse.stepWidth * 0.88, 18)
      const dayShift = Math.trunc(deltaX / browseStep)
      if (dayShift === 0) {
        return
      }

      timelineBrowseRef.current = {
        ...currentBrowse,
        lastX: currentBrowse.lastX - dayShift * browseStep,
      }
      commitTimelineBrowse(dayShift)
    }

    const handleMouseUp = () => {
      timelineBrowseRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    const rootElement = document.documentElement
    const bodyElement = document.body
    const lockClassName = 'resource-swipe-lock'

    if (activeNav === '资源排期') {
      rootElement.classList.add(lockClassName)
      bodyElement.classList.add(lockClassName)
    } else {
      rootElement.classList.remove(lockClassName)
      bodyElement.classList.remove(lockClassName)
    }

    return () => {
      rootElement.classList.remove(lockClassName)
      bodyElement.classList.remove(lockClassName)
    }
  }, [activeNav])

  useEffect(() => {
    const gestureRegion = timelineGestureRegionRef.current
    if (!gestureRegion || activeNav !== '资源排期') {
      return
    }

    const handleNativeWheel = (event: WheelEvent) => {
      const horizontalDelta = getTimelineHorizontalGestureDelta({
        ctrlKey: event.ctrlKey,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
        target: event.target,
      })

      if (Math.abs(horizontalDelta) < 1) {
        return
      }

      event.preventDefault()
    }

    gestureRegion.addEventListener('wheel', handleNativeWheel, {
      capture: true,
      passive: false,
    })

    return () => {
      gestureRegion.removeEventListener('wheel', handleNativeWheel, true)
    }
  }, [activeNav])

  const openRecordsCenter = (nextView: RecordView) => {
    setContextMenu(null)
    setPendingTaskCoachId(null)
    setTaskCoach(null)
    setRecordView(nextView)
    setRecordPage(1)
    setActiveNav('记录中心')
    void recordViewAction('记录中心', `打开了${nextView}页面。`)
  }

  const createTaskFromMemberAndRange = (
    memberId: string,
    startDate: Date,
    duration: number,
    options?: {
      title?: string
      openEditor?: boolean
      insertAtStart?: boolean
      operationDetail?: string
    },
  ) => {
    const owner = membersById[memberId]
    if (!owner) {
      return
    }

    const taskStatus = statusFilter === '全部状态' ? '计划中' : statusFilter
    const newTask: Task = {
      id: createClientId('task'),
      title: options?.title ?? '新建项目计划',
      ownerId: owner.id,
      teamId: owner.teamId,
      progress: 0,
      status: taskStatus,
      priority: 'P3',
      startOffset: diffCalendarDays(startDate, BASE_DATE),
      duration,
      sortOrder: options?.insertAtStart ? 0 : workspace.tasks.length,
      color: priorityPalette.P3.solid,
      summary: '请补充项目背景、目标、交付物以及当前风险。',
      milestone: '待补充里程碑',
      updatedAt: formatTimeLabel(),
    }

    if (options?.openEditor) {
      setEditModal({
        mode: 'create',
        draft: createDraft(newTask),
        insertAtStart: options.insertAtStart,
        operationDetail: options.operationDetail,
      })
      return
    }

    setEditModal({
      mode: 'create',
      draft: createDraft(newTask),
      insertAtStart: options?.insertAtStart,
      operationDetail: options?.operationDetail,
    })
  }

  const handleSelectTask = (taskId: string, options?: { fromTimeline?: boolean }) => {
    if (ignoreTaskClickRef.current) {
      ignoreTaskClickRef.current = false
      return
    }

    startTransition(() => {
      setSelectedTaskId(taskId)
    })

    if (options?.fromTimeline && !hasUsedTimelineGestureRef.current) {
      setPendingTaskCoachId(taskId)
    } else {
      setPendingTaskCoachId(null)
      setTaskCoach(null)
    }
  }

  const startTaskTimelineInteraction = (
    event: ReactMouseEvent<HTMLElement>,
    task: Task,
    mode: TaskTimelineInteractionMode,
    laneIndex = 0,
  ) => {
    if (event.button !== 0) {
      return
    }

    const laneElement = event.currentTarget.closest('.bars-column')
    if (!(laneElement instanceof HTMLElement)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setPendingTaskCoachId(null)
    setTaskCoach(null)
    setSelectedTaskId(task.id)

    syncTaskTimelineInteraction({
      taskId: task.id,
      mode,
      pointerStartX: event.clientX,
      laneWidth: Math.max(laneElement.getBoundingClientRect().width, 1),
      dayCount: timelineDays.length,
      originalLaneIndex: laneIndex,
      originalOwnerId: task.ownerId,
      originalTeamId: task.teamId,
      originalStartOffset: task.startOffset,
      originalDuration: task.duration,
      previewLaneIndex: laneIndex,
      previewOwnerId: task.ownerId,
      previewTeamId: task.teamId,
      previewStartOffset: task.startOffset,
      previewDuration: task.duration,
    })
  }

  const openContextMenu = (event: ReactMouseEvent, taskId: string) => {
    event.preventDefault()
    setPendingTaskCoachId(null)
    setTaskCoach(null)
    setSelectedTaskId(taskId)
    setContextMenu({
      taskId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const openEditModal = (taskId: string) => {
    const task = workspace.tasks.find((item) => item.id === taskId)
    if (!task) {
      return
    }

    setContextMenu(null)
    setSelectedTaskId(taskId)
    setEditModal({
      mode: 'edit',
      taskId,
      draft: createDraft(task),
    })
  }

  const openDeleteConfirm = (taskId: string) => {
    setContextMenu(null)
    setOverviewDeleteTargetIds([])
    setDeleteTargetId(taskId)
  }

  const closeDeleteConfirm = () => {
    setDeleteTargetId(null)
    setOverviewDeleteTargetIds([])
  }

  const openBulkDeleteConfirm = () => {
    if (effectiveOverviewSelectedTaskIds.length === 0) {
      return
    }

    setContextMenu(null)
    setDeleteTargetId(null)
    setOverviewDeleteTargetIds(effectiveOverviewSelectedTaskIds)
  }

  const openResourceModal = () => {
    setContextMenu(null)
    setResourceNotice(null)
    setTeamEditor(null)
    setMemberEditor(null)
    setResourceSearchValue('')
    setResourceDeleteTarget(null)
    setResourcePanelTab('team')
    setActiveNav('组织管理')
    void recordViewAction('组织管理', '打开了团队与成员管理页面。')
  }

  const openTeamCreate = () => {
    setResourceNotice(null)
    setResourcePanelTab('team')
    setTeamEditor({
      mode: 'create',
      draft: createTeamDraft(),
    })
  }

  const openTeamEdit = (teamId: string) => {
    const team = teamsById[teamId]
    if (!team) {
      return
    }

    setResourceNotice(null)
    setResourcePanelTab('team')
    setSelectedResourceTeamId(teamId)
    setTeamEditor({
      mode: 'edit',
      teamId,
      draft: createTeamDraft(team),
    })
  }

  const openMemberCreate = (preferredTeamIdOverride?: string) => {
    if (workspace.teams.length === 0) {
      setResourceNotice({
        tone: 'danger',
        message: '请先创建团队，再添加成员。',
      })
      return
    }

    const preferredTeamId =
      preferredTeamIdOverride && teamsById[preferredTeamIdOverride]
        ? preferredTeamIdOverride
        : teamFilter !== '全部团队' && teamsById[teamFilter]
          ? teamFilter
          : workspace.teams[0]?.id

    setResourceNotice(null)
    setResourcePanelTab('member')
    setMemberEditor({
      mode: 'create',
      draft: createMemberDraft(undefined, preferredTeamId),
    })
  }

  const openMemberEdit = (memberId: string) => {
    const member = membersById[memberId]
    if (!member) {
      return
    }

    setResourceNotice(null)
    setResourcePanelTab('member')
    setSelectedResourceMemberId(memberId)
    setMemberEditor({
      mode: 'edit',
      memberId,
      draft: createMemberDraft(member),
    })
  }

  const selectResourceTeam = (teamId: string) => {
    setResourcePanelTab('team')
    setSelectedResourceTeamId(teamId)
    setTeamEditor(null)
  }

  const selectResourceMember = (memberId: string) => {
    setResourcePanelTab('member')
    setSelectedResourceMemberId(memberId)
    setMemberEditor(null)
  }

  const openTeamDeleteConfirm = (teamId: string) => {
    const team = teamsById[teamId]
    if (!team) {
      return
    }

    setResourceDeleteTarget({
      kind: 'team',
      id: teamId,
      name: team.name,
    })
  }

  const openMemberDeleteConfirm = (memberId: string) => {
    const member = membersById[memberId]
    if (!member) {
      return
    }

    setResourceDeleteTarget({
      kind: 'member',
      id: memberId,
      name: member.name,
    })
  }

  const saveTeamEditor = async () => {
    if (!teamEditor) {
      return
    }

    const normalizedName = teamEditor.draft.name.trim()
    if (!normalizedName) {
      setResourceNotice({
        tone: 'danger',
        message: '团队名称不能为空。',
      })
      return
    }

    const hasDuplicateName = workspace.teams.some(
      (team) =>
        team.name.trim().toLowerCase() === normalizedName.toLowerCase() &&
        team.id !== teamEditor.teamId,
    )

    if (hasDuplicateName) {
      setResourceNotice({
        tone: 'danger',
        message: '团队名称已存在，请换一个更容易区分的名称。',
      })
      return
    }

    const draft = {
      ...teamEditor.draft,
      name: normalizedName,
      lead: teamEditor.draft.lead.trim() || '待设置',
    }

    try {
      if (teamEditor.mode === 'create') {
        const response = await createTeamRequest(draft)
        setSelectedResourceTeamId(response.item.id)
        setResourceNotice({
          tone: 'success',
          message: `团队“${response.item.name}”创建成功。`,
        })
      } else if (teamEditor.teamId) {
        await updateTeamRequest(teamEditor.teamId, draft)
        setSelectedResourceTeamId(teamEditor.teamId)
        setResourceNotice({
          tone: 'success',
          message: `团队“${draft.name}”保存成功。`,
        })
      }

      setTeamEditor(null)
      await refreshWorkspace()
    } catch (error) {
      setResourceNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '团队保存失败，请稍后重试。',
      })
    }
  }

  const saveMemberEditor = async () => {
    if (!memberEditor) {
      return
    }

    const normalizedName = memberEditor.draft.name.trim()
    const normalizedRole = memberEditor.draft.role.trim()
    const selectedTeam = teamsById[memberEditor.draft.teamId]

    if (!normalizedName || !normalizedRole) {
      setResourceNotice({
        tone: 'danger',
        message: '成员姓名和角色不能为空。',
      })
      return
    }

    if (!selectedTeam) {
      setResourceNotice({
        tone: 'danger',
        message: '请先为成员选择所属团队。',
      })
      return
    }

    const draft = {
      ...memberEditor.draft,
      name: normalizedName,
      role: normalizedRole,
      avatar: memberEditor.draft.avatar.trim() || buildAvatarLabel(normalizedName),
      capacityHours: Math.max(1, Number(memberEditor.draft.capacityHours) || 40),
    }

    try {
      if (memberEditor.mode === 'create') {
        const response = await createMemberRequest(draft)
        setSelectedResourceMemberId(response.item.id)
        setResourceNotice({
          tone: 'success',
          message: `成员“${response.item.name}”创建成功。`,
        })
      } else if (memberEditor.memberId) {
        await updateMemberRequest(memberEditor.memberId, draft)
        setSelectedResourceMemberId(memberEditor.memberId)
        setResourceNotice({
          tone: 'success',
          message: `成员“${draft.name}”保存成功。`,
        })
      }

      setMemberEditor(null)
      await refreshWorkspace()
    } catch (error) {
      setResourceNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '成员保存失败，请稍后重试。',
      })
    }
  }

  const handleDeleteTeam = async (teamId: string) => {
    const team = teamsById[teamId]
    if (!team) {
      return
    }

    try {
      await deleteTeamRequest(teamId)
      if (teamFilter === teamId) {
        setTeamFilter('全部团队')
      }
      setResourceNotice({
        tone: 'success',
        message: `团队“${team.name}”已删除。`,
      })
      setResourceDeleteTarget(null)
      if (teamEditor?.teamId === teamId) {
        setTeamEditor(null)
      }
      await refreshWorkspace()
    } catch (error) {
      setResourceNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '团队删除失败，请稍后重试。',
      })
      setResourceDeleteTarget(null)
    }
  }

  const handleDeleteMember = async (memberId: string) => {
    const member = membersById[memberId]
    if (!member) {
      return
    }

    try {
      await deleteMemberRequest(memberId)
      setResourceNotice({
        tone: 'success',
        message: `成员“${member.name}”已删除。`,
      })
      setResourceDeleteTarget(null)
      if (memberEditor?.memberId === memberId) {
        setMemberEditor(null)
      }
      await refreshWorkspace()
    } catch (error) {
      setResourceNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : '成员删除失败，请稍后重试。',
      })
      setResourceDeleteTarget(null)
    }
  }

  const handleTimelineMouseDown = (
    memberId: string,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('.task-bar')) {
      return
    }

    event.preventDefault()
    setContextMenu(null)

    const bounds = event.currentTarget.getBoundingClientRect()
    const dayIndex = resolveDayIndexFromPointer(
      event.clientX,
      bounds.left,
      bounds.width,
      timelineDays.length,
    )

    syncDragSelection({
      memberId,
      anchorDay: dayIndex,
      currentDay: dayIndex,
      rectLeft: bounds.left,
      rectWidth: bounds.width,
      dayCount: timelineDays.length,
    })
  }

  useEffect(() => {
    if (!isDraggingSelection) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      const currentSelection = dragSelectionRef.current
      if (!currentSelection) {
        return
      }

      const nextDay = resolveDayIndexFromPointer(
        event.clientX,
        currentSelection.rectLeft,
        currentSelection.rectWidth,
        currentSelection.dayCount,
      )

      if (nextDay === currentSelection.currentDay) {
        return
      }

      syncDragSelection({
        ...currentSelection,
        currentDay: nextDay,
      })
    }

    const handleMouseUp = () => {
      const currentSelection = dragSelectionRef.current
      syncDragSelection(null)

      if (currentSelection) {
        const startDay = Math.min(currentSelection.anchorDay, currentSelection.currentDay)
        const endDay = Math.max(currentSelection.anchorDay, currentSelection.currentDay)
        const startDate = addCalendarDays(visibleMonthStart, startDay)
        const duration = endDay - startDay + 1
        const endDate = addCalendarDays(visibleMonthStart, endDay)
        const rangeLabel = `${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}`
        const owner = membersById[currentSelection.memberId]
        const taskStatus = statusFilter === '全部状态' ? '计划中' : statusFilter

        if (owner) {
          setEditModal({
            mode: 'create',
            draft: {
              title: '新建项目计划',
              ownerId: owner.id,
              status: taskStatus,
              priority: 'P3',
              progress: 0,
              startOffset: diffCalendarDays(startDate, BASE_DATE),
              duration,
              summary: '请补充项目背景、目标、交付物以及当前风险。',
              milestone: '待补充里程碑',
            },
            operationDetail: `通过甘特图拖拽，为 ${owner.name} 创建了 ${rangeLabel} 的项目周期。`,
          })
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingSelection, membersById, statusFilter, visibleMonthStart])

  useEffect(() => {
    if (!isTaskTimelineInteracting) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      const currentInteraction = taskTimelineInteractionRef.current
      if (!currentInteraction) {
        return
      }

      const stepWidth = currentInteraction.laneWidth / Math.max(currentInteraction.dayCount, 1)
      const dayDelta = Math.round((event.clientX - currentInteraction.pointerStartX) / stepWidth)

      let previewStartOffset = currentInteraction.originalStartOffset
      let previewDuration = currentInteraction.originalDuration
      let previewLaneIndex = currentInteraction.previewLaneIndex
      let previewOwnerId = currentInteraction.previewOwnerId
      let previewTeamId = currentInteraction.previewTeamId

      if (currentInteraction.mode === 'move') {
        previewStartOffset = currentInteraction.originalStartOffset + dayDelta
        let hoveredOwner = null as Member | null

        for (const memberId of timelineLaneMemberIdsRef.current) {
          const laneElement = timelineLaneRefs.current[memberId]
          if (!laneElement) {
            continue
          }

          const rect = laneElement.getBoundingClientRect()
          if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
            hoveredOwner = membersById[memberId] ?? null
            previewLaneIndex = resolveLaneIndexFromPointer(
              event.clientY,
              rect.top,
              workspace.tasks.filter(
                (task) =>
                  task.id !== currentInteraction.taskId &&
                  task.ownerId === memberId &&
                  taskOverlapsWindow(task, visibleMonthStart, visibleMonthEnd),
              ).length,
            )
            break
          }
        }

        if (hoveredOwner) {
          previewOwnerId = hoveredOwner.id
          previewTeamId = hoveredOwner.teamId
        }
      } else if (currentInteraction.mode === 'resize-start') {
        const maxStartOffset =
          currentInteraction.originalStartOffset + currentInteraction.originalDuration - 1
        previewStartOffset = Math.min(
          currentInteraction.originalStartOffset + dayDelta,
          maxStartOffset,
        )
        previewDuration =
          currentInteraction.originalDuration +
          (currentInteraction.originalStartOffset - previewStartOffset)
      } else {
        previewDuration = Math.max(1, currentInteraction.originalDuration + dayDelta)
      }

      if (
        previewLaneIndex === currentInteraction.previewLaneIndex &&
        previewOwnerId === currentInteraction.previewOwnerId &&
        previewTeamId === currentInteraction.previewTeamId &&
        previewStartOffset === currentInteraction.previewStartOffset &&
        previewDuration === currentInteraction.previewDuration
      ) {
        return
      }

      if (
        previewLaneIndex !== currentInteraction.originalLaneIndex ||
        previewOwnerId !== currentInteraction.originalOwnerId ||
        previewStartOffset !== currentInteraction.originalStartOffset ||
        previewDuration !== currentInteraction.originalDuration
      ) {
        hasUsedTimelineGestureRef.current = true
      }

      setTaskCoach(null)
      syncTaskTimelineInteraction({
        ...currentInteraction,
        previewLaneIndex,
        previewOwnerId,
        previewTeamId,
        previewStartOffset,
        previewDuration,
      })
    }

    const handleMouseUp = () => {
      const currentInteraction = taskTimelineInteractionRef.current
      syncTaskTimelineInteraction(null)

      if (!currentInteraction) {
        return
      }

      const hasChanged =
        currentInteraction.previewLaneIndex !== currentInteraction.originalLaneIndex ||
        currentInteraction.previewOwnerId !== currentInteraction.originalOwnerId ||
        currentInteraction.previewStartOffset !== currentInteraction.originalStartOffset ||
        currentInteraction.previewDuration !== currentInteraction.originalDuration

      ignoreTaskClickRef.current = hasChanged

      if (!hasChanged) {
        return
      }

      const previousTask = workspace.tasks.find((task) => task.id === currentInteraction.taskId)
      if (!previousTask) {
        return
      }

      const nextStartDate = getTaskStartDate({
        startOffset: currentInteraction.previewStartOffset,
      })
      const nextEndDate = getTaskEndDate({
        startOffset: currentInteraction.previewStartOffset,
        duration: currentInteraction.previewDuration,
      })
      const previousStartDate = getTaskStartDate(previousTask)
      const previousEndDate = getTaskEndDate(previousTask)
      const previousOwner = membersById[previousTask.ownerId]
      const nextOwner = membersById[currentInteraction.previewOwnerId]
      const orderChanged = currentInteraction.previewLaneIndex !== currentInteraction.originalLaneIndex
      const ownerChanged = currentInteraction.previewOwnerId !== currentInteraction.originalOwnerId
      const scheduleChanged =
        currentInteraction.previewStartOffset !== currentInteraction.originalStartOffset ||
        currentInteraction.previewDuration !== currentInteraction.originalDuration

      let detail = `已将项目时间调整为 ${formatShortDateLabel(nextStartDate)} - ${formatShortDateLabel(nextEndDate)}。`

      if (ownerChanged) {
        detail = scheduleChanged
          ? `已将项目从 ${previousOwner?.name ?? '原负责人'} 调整给 ${nextOwner?.name ?? '当前负责人'}，排期同步为 ${formatShortDateLabel(nextStartDate)} - ${formatShortDateLabel(nextEndDate)}。`
          : `已将项目从 ${previousOwner?.name ?? '原负责人'} 调整给 ${nextOwner?.name ?? '当前负责人'}，时间保持 ${formatShortDateLabel(nextStartDate)} - ${formatShortDateLabel(nextEndDate)}。`
      } else if (currentInteraction.mode === 'move' && orderChanged && !scheduleChanged) {
        detail = `已调整项目在 ${nextOwner?.name ?? '当前负责人'} 名下的上下顺序。`
      } else if (currentInteraction.mode === 'move') {
        detail = `已将项目整体平移到 ${formatShortDateLabel(nextStartDate)} - ${formatShortDateLabel(nextEndDate)}，原计划为 ${formatShortDateLabel(previousStartDate)} - ${formatShortDateLabel(previousEndDate)}。`
      } else if (currentInteraction.mode === 'resize-start') {
        detail = `已将项目开始时间调整为 ${formatShortDateLabel(nextStartDate)}，结束时间保持到 ${formatShortDateLabel(nextEndDate)}。`
      } else if (currentInteraction.mode === 'resize-end') {
        detail = `已将项目结束时间调整为 ${formatShortDateLabel(nextEndDate)}，当前总工期为 ${currentInteraction.previewDuration} 天。`
      }

      const remainingTasks = workspace.tasks.filter((task) => task.id !== currentInteraction.taskId)
      const visibleOwnerTasks = remainingTasks.filter(
        (task) =>
          task.ownerId === currentInteraction.previewOwnerId &&
          taskOverlapsWindow(task, visibleMonthStart, visibleMonthEnd),
      )
      const clampedLaneIndex = Math.max(
        0,
        Math.min(currentInteraction.previewLaneIndex, visibleOwnerTasks.length),
      )

      let insertIndex = remainingTasks.length

      if (visibleOwnerTasks.length > 0 && clampedLaneIndex < visibleOwnerTasks.length) {
        const anchorTask = visibleOwnerTasks[clampedLaneIndex]
        const anchorIndex = remainingTasks.findIndex((task) => task.id === anchorTask.id)
        insertIndex = anchorIndex === -1 ? remainingTasks.length : anchorIndex
      } else {
        const ownerTaskIndices = remainingTasks.reduce<number[]>((indices, task, index) => {
          if (task.ownerId === currentInteraction.previewOwnerId) {
            indices.push(index)
          }
          return indices
        }, [])

        if (ownerTaskIndices.length > 0) {
          insertIndex = ownerTaskIndices[ownerTaskIndices.length - 1] + 1
        }
      }

      const optimisticTask: Task = {
        ...previousTask,
        ownerId: currentInteraction.previewOwnerId,
        teamId: currentInteraction.previewTeamId,
        startOffset: currentInteraction.previewStartOffset,
        duration: currentInteraction.previewDuration,
        sortOrder: insertIndex,
        updatedAt: formatTimeLabel(),
      }

      setWorkspace((current) => ({
        ...current,
        tasks: [
          ...remainingTasks.slice(0, insertIndex),
          optimisticTask,
          ...remainingTasks.slice(insertIndex),
        ].map((task, index) => ({
          ...task,
          sortOrder: index,
        })),
      }))

      void (async () => {
        try {
          await updateTaskRequest(currentInteraction.taskId, {
            ownerId: currentInteraction.previewOwnerId,
            startDate: formatDateInputValue(nextStartDate),
            duration: currentInteraction.previewDuration,
            sortOrder: insertIndex,
            operationDetail: detail,
          })
          await refreshWorkspace()
          setSelectedTaskId(currentInteraction.taskId)
        } catch (error) {
          setWorkspaceError(error instanceof Error ? error.message : '项目排期更新失败。')
          await refreshWorkspace()
        }
      })()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isTaskTimelineInteracting, membersById, refreshWorkspace, visibleMonthEnd, visibleMonthStart, workspace.tasks])

  useEffect(() => {
    if (!isMemberRowReordering) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      const currentReorder = memberRowReorderRef.current
      if (!currentReorder) {
        return
      }

      const otherMemberIds = timelineVisibleMemberIdsRef.current.filter(
        (memberId) => memberId !== currentReorder.memberId,
      )
      let previewIndex = otherMemberIds.length

      for (let index = 0; index < otherMemberIds.length; index += 1) {
        const rowElement = timelineRowRefs.current[otherMemberIds[index]]
        if (!rowElement) {
          continue
        }

        const rowRect = rowElement.getBoundingClientRect()
        if (event.clientY < rowRect.top + rowRect.height / 2) {
          previewIndex = index
          break
        }
      }

      if (
        previewIndex === currentReorder.previewIndex &&
        event.clientY === currentReorder.currentY
      ) {
        return
      }

      syncMemberRowReorder({
        ...currentReorder,
        currentY: event.clientY,
        previewIndex,
      })
    }

    const handleMouseUp = () => {
      const currentReorder = memberRowReorderRef.current
      syncMemberRowReorder(null)

      if (!currentReorder) {
        return
      }

      const visibleMemberIds = timelineVisibleMemberIdsRef.current
      const otherMemberIds = visibleMemberIds.filter(
        (memberId) => memberId !== currentReorder.memberId,
      )
      const nextVisibleMemberIds = [
        ...otherMemberIds.slice(0, currentReorder.previewIndex),
        currentReorder.memberId,
        ...otherMemberIds.slice(currentReorder.previewIndex),
      ]
      const hasChanged = nextVisibleMemberIds.some(
        (memberId, index) => memberId !== visibleMemberIds[index],
      )

      if (!hasChanged) {
        return
      }

      const nextMembers = reorderVisibleMembers(workspace.members, nextVisibleMemberIds).map(
        (member, index) => ({
          ...member,
          sortOrder: index,
        }),
      )
      const nextIndex = nextMembers.findIndex((member) => member.id === currentReorder.memberId)

      setWorkspace((current) => ({
        ...current,
        members: nextMembers,
      }))

      void (async () => {
        try {
          await updateMemberRequest(currentReorder.memberId, {
            sortOrder: Math.max(0, nextIndex),
          })
          await refreshWorkspace()
        } catch (error) {
          setWorkspaceError(error instanceof Error ? error.message : '成员顺序更新失败。')
          await refreshWorkspace()
        }
      })()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isMemberRowReordering, membersById, refreshWorkspace, workspace.members])

  const handleSaveEdit = async () => {
    if (!editModal) {
      return
    }

    const nextOwner = membersById[editModal.draft.ownerId]

    if (!nextOwner) {
      setWorkspaceError('请先为项目选择有效负责人。')
      return
    }

    try {
      const payload = {
        title: editModal.draft.title.trim(),
        ownerId: editModal.draft.ownerId,
        progress: Math.max(0, Math.min(100, Number(editModal.draft.progress) || 0)),
        status: editModal.draft.status,
        priority: editModal.draft.priority,
        startDate: formatDateInputValue(getTaskStartDate(editModal.draft)),
        duration: Math.max(1, Number(editModal.draft.duration) || 1),
        summary: editModal.draft.summary.trim(),
        milestone: editModal.draft.milestone.trim(),
      }

      if (editModal.mode === 'create') {
        const response = await createTaskRequest({
          ...payload,
          sortOrder: editModal.insertAtStart ? 0 : workspace.tasks.length,
        })
        setSelectedTaskId(response.item.id)
      } else {
        await updateTaskRequest(editModal.taskId, {
          ...payload,
          operationDetail: '已通过弹窗保存项目详情。',
        })
        setSelectedTaskId(editModal.taskId)
      }

      setEditModal(null)
      await refreshWorkspace()
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : '项目保存失败，请稍后重试。')
    }
  }

  const handleDeleteTask = async () => {
    const deletingIds = deleteTargetId ? [deleteTargetId] : overviewDeleteTargetIds
    if (deletingIds.length === 0) {
      return
    }

    const deletingTaskIdSet = new Set(deletingIds)
    const remainingTasks = workspace.tasks.filter((task) => !deletingTaskIdSet.has(task.id))

    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => !deletingTaskIdSet.has(task.id)),
    }))

    if (selectedTaskId && deletingTaskIdSet.has(selectedTaskId)) {
      setSelectedTaskId(remainingTasks[0]?.id ?? '')
    }

    setOverviewSelectedTaskIds((current) => current.filter((taskId) => !deletingTaskIdSet.has(taskId)))
    closeDeleteConfirm()

    try {
      for (const taskId of deletingIds) {
        await deleteTaskRequest(taskId)
      }
      await refreshWorkspace()
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : '项目删除失败，请稍后重试。')
      await refreshWorkspace()
    }
  }

  const handleCreateTask = () => {
    const fallbackMember =
      workspace.members.find((member) => teamFilter === '全部团队' || member.teamId === teamFilter) ??
      workspace.members[0]

    if (!fallbackMember) {
      setResourceNotice({
        tone: 'danger',
        message: '当前还没有成员，请先在组织管理里创建成员后再新增项目。',
      })
      setActiveNav('组织管理')
      return
    }

    const suggestedStartDate = addCalendarDays(visibleMonthStart, 2)
    createTaskFromMemberAndRange(fallbackMember.id, suggestedStartDate, 5, {
      openEditor: true,
      insertAtStart: true,
    })
  }

  const exportWorkspace = async () => {
    try {
      setIsExporting(true)
      const blob = await exportWorkspaceSnapshot()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'resource-planning-workspace.json'
      link.click()
      URL.revokeObjectURL(url)
      await refreshWorkspace()
      if (activeNav === '记录中心') {
        await refreshRecordPage(recordView, recordPage)
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : '导出失败，请稍后重试。')
    } finally {
      setIsExporting(false)
    }
  }

  const navItems: NavSection[] = ['总览', '资源排期', '组织管理', '记录中心']

  return (
    <div
      className={
        isFixedWorkspacePage
          ? 'dashboard-shell dashboard-shell-fixed'
          : 'dashboard-shell'
      }
    >
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-mark">RG</div>
          <div className="brand-copy">
            <p className="caps">产品定位</p>
            <h1 className="brand-title">人力排期工作台</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navItems.map((item) => (
            <button
              key={item}
              className={activeNav === item ? 'nav-item is-active' : 'nav-item'}
              onClick={() => {
                setPendingTaskCoachId(null)
                setTaskCoach(null)

                if (item === '记录中心') {
                  openRecordsCenter('更新记录')
                  return
                }

                if (item === '组织管理') {
                  openResourceModal()
                  return
                }

                setActiveNav(item)
              }}
            >
              <span className="nav-dot"></span>
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className={mainPanelClassName}>
        {syncBannerMessage ? (
          <div className="resource-notice is-success">{syncBannerMessage}</div>
        ) : null}
        {workspaceError ? <div className="resource-notice is-danger">{workspaceError}</div> : null}
        {isRecordsPage ? (
          <>
            <header className="topbar records-topbar">
              <div className="topbar-main">
                <p className="caps">记录中心</p>
                <h2>更新记录与操作记录</h2>
                <p className="timeline-copy">
                  将版本迭代与日常操作拆开管理，既方便对外汇报，也方便内部追溯每次增删改导出动作。
                </p>
              </div>

              <div className="topbar-actions records-head-meta">
                <span className="summary-tag neutral-tag">
                  更新 {releaseRecordState.total}
                </span>
                <span className="summary-tag blue-tag">
                  操作 {operationRecordState.total}
                </span>
              </div>
            </header>

            <section className="records-page">
              <article className="records-card">
                <div className="records-toolbar">
                  <div>
                    <p className="caps">列表表格</p>
                    <h3>{recordView === '更新记录' ? '版本更新记录' : '操作审计记录'}</h3>
                    <p className="timeline-copy">
                      {recordView === '更新记录'
                        ? '记录每个版本的发布时间与新增能力，方便做对外同步与里程碑复盘。'
                        : '记录关键操作的执行人、时间和对象，便于做审计追踪与问题回溯。'}
                    </p>
                  </div>

                  <div className="records-toolbar-actions">
                    <label className="records-filter">
                      <span>展示内容</span>
                      <select
                        className="toolbar-select"
                        value={recordView}
                        onChange={(event) => {
                          setRecordView(event.target.value as RecordView)
                          setRecordPage(1)
                        }}
                      >
                        <option value="更新记录">更新记录</option>
                        <option value="操作记录">操作记录</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="records-meta-bar">
                  <span>
                    {recordView === '更新记录' ? '版本记录' : '操作记录'}共 {recordTotalCount} 条
                  </span>
                  <span>每页 {RECORD_PAGE_SIZE} 条</span>
                </div>

                <div className="records-table-wrap">
                  {recordView === '更新记录' ? (
                    <table className="records-table records-table-updates">
                      <thead>
                        <tr>
                          <th>版本号</th>
                          <th>更新时间</th>
                          <th>新增功能</th>
                        </tr>
                      </thead>
                      <tbody>
                        {releaseRecordState.total === 0 ? (
                          <tr>
                            <td colSpan={3} className="records-empty-cell">
                              还没有版本更新记录。
                            </td>
                          </tr>
                        ) : (
                          visibleUpdateRecords.map((record) => (
                            <tr key={record.id}>
                              <td>
                                <strong>{record.version}</strong>
                              </td>
                              <td>{record.updatedAt}</td>
                              <td>
                                <ul className="record-feature-list">
                                  {record.features.map((feature) => (
                                    <li key={feature}>{feature}</li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="records-table records-table-operations">
                      <thead>
                        <tr>
                          <th>操作人</th>
                          <th>操作时间</th>
                          <th>操作类型</th>
                          <th>操作对象</th>
                          <th>操作详情</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operationRecordState.total === 0 ? (
                          <tr>
                            <td colSpan={5} className="records-empty-cell">
                              还没有操作记录。
                            </td>
                          </tr>
                        ) : (
                          visibleOperationRecords.map((record) => (
                            <tr key={record.id}>
                              <td title={record.actor}>
                                <span className="records-cell-ellipsis">{record.actor}</span>
                              </td>
                              <td>{record.time}</td>
                              <td>
                                <span className="record-action-chip">{record.action}</span>
                              </td>
                              <td title={record.target}>
                                <span className="records-cell-ellipsis">{record.target}</span>
                              </td>
                              <td title={record.detail}>
                                <span className="records-cell-ellipsis">{record.detail}</span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                {recordTotalPages > 1 ? (
                  <div className="table-footer records-table-footer">
                    <div className="table-pagination">
                      <button
                        className="ghost-button table-page-button"
                        onClick={() =>
                          setRecordPage((current) =>
                            Math.max(1, Math.min(current, recordTotalPages) - 1),
                          )
                        }
                        disabled={effectiveRecordPage === 1}
                      >
                        上一页
                      </button>
                      <span className="table-page-status">
                        第 {effectiveRecordPage} / {recordTotalPages} 页
                      </span>
                      <button
                        className="ghost-button table-page-button"
                        onClick={() =>
                          setRecordPage((current) =>
                            Math.min(recordTotalPages, Math.min(current, recordTotalPages) + 1),
                          )
                        }
                        disabled={effectiveRecordPage === recordTotalPages}
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            </section>
          </>
        ) : (
          <>
            {isResourceManagementPage ? (
              <section className="resource-page">
                <header className="topbar resource-page-topbar">
                  <div className="topbar-main">
                    <h2>团队与成员管理台</h2>
                  </div>
                </header>

                {resourceNotice ? (
                  <div
                    className={
                      resourceNotice.tone === 'danger'
                        ? 'resource-notice is-danger'
                        : 'resource-notice is-success'
                    }
                  >
                    {resourceNotice.message}
                  </div>
                ) : null}

                <section className="gantt-card resource-page-card">
                  <div className="resource-workspace resource-page-workspace">
                    <aside className="resource-sidebar resource-page-sidebar">
                      <div className="resource-panel-tabs" role="tablist" aria-label="组织管理视图切换">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={resourcePanelTab === 'team'}
                          className={resourcePanelTab === 'team' ? 'resource-panel-tab is-active' : 'resource-panel-tab'}
                          onClick={() => {
                            setResourcePanelTab('team')
                            setResourceSearchValue('')
                          }}
                        >
                          团队视图
                          <span>{workspace.teams.length}</span>
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={resourcePanelTab === 'member'}
                          className={resourcePanelTab === 'member' ? 'resource-panel-tab is-active' : 'resource-panel-tab'}
                          onClick={() => {
                            setResourcePanelTab('member')
                            setResourceSearchValue('')
                          }}
                        >
                          成员视图
                          <span>{workspace.members.length}</span>
                        </button>
                      </div>

                      <div className="resource-sidebar-head">
                        <div>
                          <p className="caps">{activeResourcePanelTitle}</p>
                          <h4>{resourcePanelTab === 'team' ? '团队清单' : '成员清单'}</h4>
                          <p className="resource-sidebar-copy">{activeResourcePanelCopy}</p>
                        </div>
                        <button
                          className="ghost-button resource-add-button"
                          onClick={() => {
                            if (resourcePanelTab === 'team') {
                              openTeamCreate()
                              return
                            }

                            openMemberCreate()
                          }}
                          type="button"
                        >
                          {resourcePanelTab === 'team' ? '新增团队' : '新增成员'}
                        </button>
                      </div>

                      <div className="resource-sidebar-tools">
                        <label
                          className="search-box resource-search-box"
                          aria-label={resourcePanelTab === 'team' ? '搜索团队或负责人' : '搜索成员、角色或团队'}
                        >
                          <input
                            value={resourceSearchValue}
                            onChange={(event) => setResourceSearchValue(event.target.value)}
                            placeholder={resourcePanelTab === 'team' ? '搜索团队名、负责人' : '搜索成员名、角色、团队'}
                          />
                        </label>
                        <span className="resource-sidebar-summary">
                          {resourcePanelTab === 'team'
                            ? `显示 ${filteredResourceTeams.length} 个团队`
                            : `显示 ${filteredResourceMembers.length} 位成员`}
                        </span>
                      </div>

                      <div className="resource-sidebar-list">
                        {resourcePanelTab === 'team' ? (
                          workspace.teams.length === 0 ? (
                            <div className="resource-empty">还没有团队，先创建团队再安排成员与项目。</div>
                          ) : filteredResourceTeams.length === 0 ? (
                            <div className="resource-empty">没有找到匹配的团队，可以换个关键词再试试。</div>
                          ) : (
                            filteredResourceTeams.map((team) => (
                              <button
                                key={team.id}
                                type="button"
                                className={
                                  team.id === activeResourceTeam?.id
                                    ? 'resource-nav-item is-active'
                                    : 'resource-nav-item'
                                }
                                onClick={() => selectResourceTeam(team.id)}
                              >
                                <span
                                  className="resource-swatch resource-nav-icon"
                                  style={{ background: team.color }}
                                  aria-hidden="true"
                                ></span>
                                <span className="resource-nav-copy">
                                  <strong>{team.name}</strong>
                                  <span>{team.lead === '待设置' ? '待设置负责人' : `负责人 ${team.lead}`}</span>
                                  <span className="resource-nav-meta">
                                    <em>{teamStats[team.id]?.memberCount ?? 0} 名成员</em>
                                    <em>{teamStats[team.id]?.taskCount ?? 0} 个项目</em>
                                  </span>
                                </span>
                              </button>
                            ))
                          )
                        ) : workspace.members.length === 0 ? (
                          <div className="resource-empty">还没有成员，创建成员后才能在时间线上分配项目。</div>
                        ) : filteredResourceMembers.length === 0 ? (
                          <div className="resource-empty">没有找到匹配的成员，可以换个关键词再试试。</div>
                        ) : (
                          filteredResourceMembers.map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              className={
                                member.id === activeResourceMember?.id
                                  ? 'resource-nav-item is-active'
                                  : 'resource-nav-item'
                              }
                              onClick={() => selectResourceMember(member.id)}
                            >
                              <span className="resource-avatar resource-nav-icon">{member.avatar}</span>
                              <span className="resource-nav-copy">
                                <strong>{member.name}</strong>
                                <span>
                                  {member.role} · {teamsById[member.teamId]?.name ?? '未分配团队'}
                                </span>
                                <span className="resource-nav-meta">
                                  <em>负责 {memberTaskCounts[member.id] ?? 0} 个项目</em>
                                </span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </aside>

                    <section className="resource-detail-panel resource-page-detail">
                      {resourcePanelTab === 'team' ? (
                        teamEditor ? (
                          <div className="resource-editor-shell">
                            <div className="resource-editor-head">
                              <div>
                                <p className="caps">团队编辑</p>
                                <h4>{teamEditor.mode === 'create' ? '新建团队' : '编辑团队'}</h4>
                                <p className="resource-section-copy">补全团队基础信息后，成员和项目归属会更清晰。</p>
                              </div>
                              <button
                                className="icon-button resource-form-dismiss"
                                onClick={() => setTeamEditor(null)}
                                type="button"
                              >
                                关闭编辑
                              </button>
                            </div>

                            <div className="resource-editor-preview">
                              <span
                                className="resource-swatch resource-editor-preview-icon"
                                style={{ background: teamEditor.draft.color }}
                                aria-hidden="true"
                              ></span>
                              <div className="resource-editor-preview-copy">
                                <strong>{teamEditor.draft.name.trim() || '未命名团队'}</strong>
                                <span>{teamEditor.draft.lead.trim() || '待设置负责人'}</span>
                              </div>
                            </div>

                            <div className="editor-grid resource-editor-grid">
                              <label>
                                团队名称
                                <input
                                  placeholder="例如：体验设计组"
                                  value={teamEditor.draft.name}
                                  onChange={(event) =>
                                    setTeamEditor((current) =>
                                      current
                                        ? {
                                            ...current,
                                            draft: { ...current.draft, name: event.target.value },
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </label>

                              <label>
                                团队负责人
                                <input
                                  placeholder="填写负责人姓名"
                                  value={teamEditor.draft.lead}
                                  onChange={(event) =>
                                    setTeamEditor((current) =>
                                      current
                                        ? {
                                            ...current,
                                            draft: { ...current.draft, lead: event.target.value },
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </label>

                              <label className="resource-color-field">
                                主题色
                                <input
                                  type="color"
                                  value={teamEditor.draft.color}
                                  onChange={(event) =>
                                    setTeamEditor((current) =>
                                      current
                                        ? {
                                            ...current,
                                            draft: { ...current.draft, color: event.target.value },
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </label>
                            </div>

                            <div className="dialog-actions">
                              <button className="ghost-button" onClick={() => setTeamEditor(null)} type="button">
                                取消编辑
                              </button>
                              <button className="primary-button" onClick={saveTeamEditor} type="button">
                                保存团队
                              </button>
                            </div>
                          </div>
                        ) : activeResourceTeam ? (
                          <div className="resource-detail-shell">
                            <div className="resource-detail-hero">
                              <div className="resource-detail-identity">
                                <span
                                  className="resource-swatch resource-detail-icon"
                                  style={{ background: activeResourceTeam.color }}
                                  aria-hidden="true"
                                ></span>
                                <div className="resource-detail-copy-block">
                                  <p className="caps">团队档案</p>
                                  <h4>{activeResourceTeam.name}</h4>
                                  <p className="resource-section-copy">
                                    聚焦团队负责人、成员规模与关联项目，把组织关系和排期责任放在同一页里管理。
                                  </p>
                                  <div className="resource-meta-list">
                                    <span className="resource-count-badge">
                                      {activeResourceTeam.lead === '待设置'
                                        ? '待设置负责人'
                                        : `负责人 ${activeResourceTeam.lead}`}
                                    </span>
                                    <span className="resource-meta-pill">
                                      {teamStats[activeResourceTeam.id]?.memberCount ?? 0} 名成员
                                    </span>
                                    <span className="resource-meta-pill">
                                      {teamStats[activeResourceTeam.id]?.taskCount ?? 0} 个项目
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="resource-detail-actions">
                                <button
                                  className="primary-button"
                                  onClick={() => openMemberCreate(activeResourceTeam.id)}
                                  type="button"
                                >
                                  新增成员
                                </button>
                                <button
                                  className="icon-button"
                                  onClick={() => openTeamEdit(activeResourceTeam.id)}
                                  type="button"
                                >
                                  编辑团队
                                </button>
                                <button
                                  className="danger-button"
                                  onClick={() => openTeamDeleteConfirm(activeResourceTeam.id)}
                                  type="button"
                                >
                                  删除团队
                                </button>
                              </div>
                            </div>

                            <div className="resource-detail-metrics">
                              <article className="resource-metric-card">
                                <span>团队负责人</span>
                                <strong>{activeResourceTeam.lead}</strong>
                              </article>
                              <article className="resource-metric-card">
                                <span>团队成员</span>
                                <strong>{activeResourceTeamMembers.length} 名</strong>
                              </article>
                              <article className="resource-metric-card">
                                <span>关联项目</span>
                                <strong>{activeResourceTeamTasks.length} 个</strong>
                              </article>
                            </div>

                            <div className="resource-detail-grid">
                              <div className="resource-detail-section resource-members-section">
                                <div className="resource-detail-section-head">
                                  <h5>团队成员</h5>
                                  <span className="resource-meta-pill">{activeResourceTeamMembers.length} 名</span>
                                </div>
                                {activeResourceTeamMembers.length === 0 ? (
                                  <div className="resource-inline-empty">当前团队还没有成员，可以先新增成员后再分配项目。</div>
                                ) : (
                                  <div className="resource-member-grid">
                                    {activeResourceTeamMembers.map((member) => (
                                      <button
                                        key={member.id}
                                        type="button"
                                        className="resource-member-card"
                                        onClick={() => selectResourceMember(member.id)}
                                      >
                                        <span className="resource-avatar resource-member-card-avatar">{member.avatar}</span>
                                        <span className="resource-member-card-copy">
                                          <strong>{member.name}</strong>
                                          <span>{member.role}</span>
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="resource-detail-section resource-projects-section">
                                <div className="resource-detail-section-head">
                                  <h5>关联项目</h5>
                                  <span className="resource-meta-pill">{activeResourceTeamTasks.length} 个</span>
                                </div>
                                {activeResourceTeamTasks.length === 0 ? (
                                  <div className="resource-inline-empty">当前团队还没有关联项目，后续排期会自动显示在这里。</div>
                                ) : (
                                  <div className="resource-task-list">
                                    {activeResourceTeamTasks.map((task) => {
                                      const priorityMeta = priorityPalette[task.priority]
                                      return (
                                        <article key={task.id} className="resource-task-card">
                                          <div className="resource-task-card-main">
                                            <strong>{task.title}</strong>
                                            <p>
                                              {membersById[task.ownerId]?.name ?? '未分配'} · {formatTaskExecutionRange(task)}
                                            </p>
                                          </div>
                                          <div className="resource-task-card-side">
                                            <em
                                              className="priority-pill"
                                              style={{
                                                background: priorityMeta.background,
                                                borderColor: priorityMeta.border,
                                                color: priorityMeta.text,
                                              }}
                                            >
                                              {task.priority}
                                            </em>
                                            <span className="resource-task-status">{task.status}</span>
                                          </div>
                                        </article>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="resource-empty resource-detail-empty">还没有团队，先创建一个团队再开始管理。</div>
                        )
                      ) : memberEditor ? (
                        <div className="resource-editor-shell">
                          <div className="resource-editor-head">
                            <div>
                              <p className="caps">成员编辑</p>
                              <h4>{memberEditor.mode === 'create' ? '新建成员' : '编辑成员'}</h4>
                              <p className="resource-section-copy">统一维护成员角色与团队归属，减少排期时反复确认。</p>
                            </div>
                            <button
                              className="icon-button resource-form-dismiss"
                              onClick={() => setMemberEditor(null)}
                              type="button"
                            >
                              关闭编辑
                            </button>
                          </div>

                          <div className="resource-editor-preview">
                            <span className="resource-avatar resource-editor-preview-icon">
                              {memberEditor.draft.avatar.trim() || buildAvatarLabel(memberEditor.draft.name)}
                            </span>
                            <div className="resource-editor-preview-copy">
                              <strong>{memberEditor.draft.name.trim() || '未命名成员'}</strong>
                              <span>
                                {memberEditor.draft.role.trim() || '待设置角色'} ·{' '}
                                {teamsById[memberEditor.draft.teamId]?.name ?? '未分配团队'}
                              </span>
                            </div>
                          </div>

                          <div className="editor-grid resource-editor-grid">
                            <label>
                              成员姓名
                              <input
                                placeholder="例如：周亦"
                                value={memberEditor.draft.name}
                                onChange={(event) =>
                                  setMemberEditor((current) =>
                                    current
                                      ? {
                                          ...current,
                                          draft: { ...current.draft, name: event.target.value },
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label>
                              成员角色
                              <input
                                placeholder="例如：产品经理"
                                value={memberEditor.draft.role}
                                onChange={(event) =>
                                  setMemberEditor((current) =>
                                    current
                                      ? {
                                          ...current,
                                          draft: { ...current.draft, role: event.target.value },
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label>
                              所属团队
                              <select
                                value={memberEditor.draft.teamId}
                                onChange={(event) =>
                                  setMemberEditor((current) =>
                                    current
                                      ? {
                                          ...current,
                                          draft: { ...current.draft, teamId: event.target.value },
                                        }
                                      : current,
                                  )
                                }
                              >
                                {workspace.teams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label>
                              头像文字
                              <input
                                maxLength={2}
                                placeholder="2字以内"
                                value={memberEditor.draft.avatar}
                                onChange={(event) =>
                                  setMemberEditor((current) =>
                                    current
                                      ? {
                                          ...current,
                                          draft: { ...current.draft, avatar: event.target.value },
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>
                          </div>

                          <div className="dialog-actions">
                            <button className="ghost-button" onClick={() => setMemberEditor(null)} type="button">
                              取消编辑
                            </button>
                            <button className="primary-button" onClick={saveMemberEditor} type="button">
                              保存成员
                            </button>
                          </div>
                        </div>
                      ) : activeResourceMember ? (
                        <div className="resource-detail-shell">
                          <div className="resource-detail-hero">
                            <div className="resource-detail-identity">
                              <span className="resource-avatar resource-detail-icon">
                                {activeResourceMember.avatar}
                              </span>
                              <div className="resource-detail-copy-block">
                                <p className="caps">成员档案</p>
                                <h4>{activeResourceMember.name}</h4>
                                <p className="resource-section-copy">
                                  把角色、团队归属和项目责任放到同一工作台里，成员管理比弹窗更直观也更容易扩展。
                                </p>
                                <div className="resource-meta-list">
                                  <span className="resource-count-badge">{activeResourceMember.role}</span>
                                  <span className="resource-meta-pill">
                                    {activeResourceMemberTeam?.name ?? '未分配团队'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="resource-detail-actions">
                              <button
                                className="icon-button"
                                onClick={() => openMemberEdit(activeResourceMember.id)}
                                type="button"
                              >
                                编辑成员
                              </button>
                              <button
                                className="danger-button"
                                onClick={() => openMemberDeleteConfirm(activeResourceMember.id)}
                                type="button"
                              >
                                删除成员
                              </button>
                            </div>
                          </div>

                          <div className="resource-detail-metrics">
                            <article className="resource-metric-card">
                              <span>所属团队</span>
                              <strong>{activeResourceMemberTeam?.name ?? '未分配'}</strong>
                            </article>
                            <article className="resource-metric-card">
                              <span>负责项目</span>
                              <strong>{activeResourceMemberTasks.length} 个</strong>
                            </article>
                          </div>

                          <div className="resource-detail-grid">
                            <div className="resource-detail-section">
                              <div className="resource-detail-section-head">
                                <h5>所属团队</h5>
                                <span className="resource-meta-pill">
                                  {activeResourceMemberTeam?.lead ?? '待设置负责人'}
                                </span>
                              </div>
                              {activeResourceMemberTeam ? (
                                <button
                                  type="button"
                                  className="resource-linked-team-card"
                                  onClick={() => selectResourceTeam(activeResourceMemberTeam.id)}
                                >
                                  <span
                                    className="resource-swatch resource-linked-team-icon"
                                    style={{ background: activeResourceMemberTeam.color }}
                                    aria-hidden="true"
                                  ></span>
                                  <span className="resource-linked-team-copy">
                                    <strong>{activeResourceMemberTeam.name}</strong>
                                    <span>
                                      {activeResourceMemberTeam.lead === '待设置'
                                        ? '待设置负责人'
                                        : `负责人 ${activeResourceMemberTeam.lead}`}
                                    </span>
                                  </span>
                                </button>
                              ) : (
                                <div className="resource-inline-empty">当前成员还没有绑定团队。</div>
                              )}
                            </div>

                            <div className="resource-detail-section resource-projects-section">
                              <div className="resource-detail-section-head">
                                <h5>负责项目</h5>
                                <span className="resource-meta-pill">{activeResourceMemberTasks.length} 个</span>
                              </div>
                              {activeResourceMemberTasks.length === 0 ? (
                                <div className="resource-inline-empty">当前成员还没有负责项目，后续分配后会自动显示在这里。</div>
                              ) : (
                                <div className="resource-task-list">
                                  {activeResourceMemberTasks.map((task) => {
                                    const priorityMeta = priorityPalette[task.priority]
                                    return (
                                      <article key={task.id} className="resource-task-card">
                                        <div className="resource-task-card-main">
                                          <strong>{task.title}</strong>
                                          <p>
                                            {formatTaskExecutionRange(task)} · {task.milestone}
                                          </p>
                                        </div>
                                        <div className="resource-task-card-side">
                                          <em
                                            className="priority-pill"
                                            style={{
                                              background: priorityMeta.background,
                                              borderColor: priorityMeta.border,
                                              color: priorityMeta.text,
                                            }}
                                          >
                                            {task.priority}
                                          </em>
                                          <span className="resource-task-status">{task.status}</span>
                                        </div>
                                      </article>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="resource-empty resource-detail-empty">还没有成员，先创建成员再开始分配项目。</div>
                      )}
                    </section>
                  </div>
                </section>
              </section>
            ) : isOverviewPage ? (
              <section className="overview-page">
                <header className="topbar overview-topbar">
                  <div className="topbar-main">
                    <h2>团队资源与项目总览</h2>
                  </div>

                  <div className="topbar-actions">
                    <button className="ghost-button topbar-action-button" onClick={openResourceModal}>
                      组织管理
                    </button>
                    <button className="ghost-button topbar-action-button" onClick={handleCreateTask}>
                      新增项目
                    </button>
                    <button
                      className="ghost-button topbar-action-button"
                      onClick={exportWorkspace}
                      disabled={isExporting}
                    >
                      {isExporting ? '导出中...' : '导出 JSON'}
                    </button>
                  </div>
                </header>

                <section className="summary-grid overview-summary-grid">
                  <article className="summary-card compact-card">
                    <div className="summary-row">
                      <p>总项目数</p>
                      <span className="summary-tag neutral-tag">全部</span>
                    </div>
                    <strong>{workspace.tasks.length}</strong>
                    <span>工作区总量</span>
                  </article>
                  <article className="summary-card compact-card">
                    <div className="summary-row">
                      <p>进行中</p>
                      <span className="summary-tag blue-tag">Active</span>
                    </div>
                    <strong>{activeTasks.length}</strong>
                    <span>当前执行</span>
                  </article>
                  <article className="summary-card compact-card">
                    <div className="summary-row">
                      <p>风险项目</p>
                      <span className="summary-tag orange-tag">Alert</span>
                    </div>
                    <strong>{riskTasks.length}</strong>
                    <span>需优先处理</span>
                  </article>
                </section>

                <section className="content-grid overview-content-grid">
                  <div className="gantt-card overview-card">
                    <div className="card-header overview-card-header">
                      <div>
                        <h3>项目清单与筛选结果</h3>
                      </div>
                    </div>

                    <div className="overview-filter-bar" ref={overviewFilterBarRef}>
                      <label className="search-box overview-search-box" aria-label="模糊搜索项目名或负责人">
                        <input
                          value={searchValue}
                          onChange={(event) => {
                            setSearchValue(event.target.value)
                            resetOverviewPage()
                          }}
                          placeholder="搜索项目名、负责人"
                        />
                      </label>

                      <select
                        className="toolbar-select overview-filter-select"
                        value={teamFilter}
                        onChange={(event) => {
                          setTeamFilter(event.target.value)
                          resetOverviewPage()
                        }}
                      >
                        <option value="全部团队">全部团队</option>
                        {workspace.teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>

                      <div className="overview-filter-group">
                        <button
                          className={`overview-filter-trigger ${overviewFilterMenu === 'owner' ? 'is-open' : ''} ${overviewOwnerFilter.length > 0 ? 'is-active' : ''}`}
                          onClick={() =>
                            setOverviewFilterMenu((current) => (current === 'owner' ? null : 'owner'))
                          }
                          type="button"
                        >
                          <span>{overviewOwnerSummary}</span>
                          <strong>{overviewFilterMenu === 'owner' ? '收起' : '展开'}</strong>
                        </button>
                        {overviewFilterMenu === 'owner' ? (
                          <div className="overview-filter-popover">
                            <div className="overview-filter-popover-head">
                              <span>负责人多选</span>
                              <button type="button" onClick={clearOverviewOwnerFilter}>
                                清空
                              </button>
                            </div>
                            <div className="overview-filter-option-list">
                              {workspace.members.map((member) => (
                                <label key={member.id} className="overview-filter-option">
                                  <input
                                    checked={overviewOwnerFilter.includes(member.id)}
                                    onChange={() => toggleOverviewOwnerFilter(member.id)}
                                    type="checkbox"
                                  />
                                  <span>{member.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="overview-filter-group">
                        <button
                          className={`overview-filter-trigger ${overviewFilterMenu === 'status' ? 'is-open' : ''} ${overviewStatusFilter.length > 0 ? 'is-active' : ''}`}
                          onClick={() =>
                            setOverviewFilterMenu((current) => (current === 'status' ? null : 'status'))
                          }
                          type="button"
                        >
                          <span>{overviewStatusSummary}</span>
                          <strong>{overviewFilterMenu === 'status' ? '收起' : '展开'}</strong>
                        </button>
                        {overviewFilterMenu === 'status' ? (
                          <div className="overview-filter-popover">
                            <div className="overview-filter-popover-head">
                              <span>状态多选</span>
                              <button type="button" onClick={clearOverviewStatusFilter}>
                                清空
                              </button>
                            </div>
                            <div className="overview-filter-option-list">
                              {(['计划中', '进行中', '风险', '已完成'] as Status[]).map((status) => (
                                <label key={status} className="overview-filter-option">
                                  <input
                                    checked={overviewStatusFilter.includes(status)}
                                    onChange={() => toggleOverviewStatusFilter(status)}
                                    type="checkbox"
                                  />
                                  <span>{status}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="overview-filter-group">
                        <button
                          className={`overview-filter-trigger ${overviewFilterMenu === 'priority' ? 'is-open' : ''} ${overviewPriorityFilter.length > 0 ? 'is-active' : ''}`}
                          onClick={() =>
                            setOverviewFilterMenu((current) => (current === 'priority' ? null : 'priority'))
                          }
                          type="button"
                        >
                          <span>{overviewPrioritySummary}</span>
                          <strong>{overviewFilterMenu === 'priority' ? '收起' : '展开'}</strong>
                        </button>
                        {overviewFilterMenu === 'priority' ? (
                          <div className="overview-filter-popover">
                            <div className="overview-filter-popover-head">
                              <span>优先级多选</span>
                              <button type="button" onClick={clearOverviewPriorityFilter}>
                                清空
                              </button>
                            </div>
                            <div className="overview-filter-option-list">
                              {priorityOrder.map((priority) => (
                                <label key={priority} className="overview-filter-option">
                                  <input
                                    checked={overviewPriorityFilter.includes(priority)}
                                    onChange={() => toggleOverviewPriorityFilter(priority)}
                                    type="checkbox"
                                  />
                                  <span>{priority}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="overview-filter-group">
                        <button
                          className={`overview-filter-trigger ${overviewFilterMenu === 'duration' ? 'is-open' : ''} ${overviewDurationFilter.length > 0 ? 'is-active' : ''}`}
                          onClick={() =>
                            setOverviewFilterMenu((current) => (current === 'duration' ? null : 'duration'))
                          }
                          type="button"
                        >
                          <span>{overviewDurationSummary}</span>
                          <strong>{overviewFilterMenu === 'duration' ? '收起' : '展开'}</strong>
                        </button>
                        {overviewFilterMenu === 'duration' ? (
                          <div className="overview-filter-popover">
                            <div className="overview-filter-popover-head">
                              <span>项目周期筛选</span>
                              <button type="button" onClick={clearOverviewDurationFilter}>
                                清空
                              </button>
                            </div>
                            <div className="overview-filter-option-list">
                              {overviewDurationOptions.map((durationOption) => (
                                <label key={durationOption} className="overview-filter-option">
                                  <input
                                    checked={overviewDurationFilter.includes(durationOption)}
                                    onChange={() => toggleOverviewDurationFilter(durationOption)}
                                    type="checkbox"
                                  />
                                  <span>{durationOption}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {hasOverviewFilters ? (
                        <button className="ghost-button overview-filter-reset" onClick={clearOverviewFilters}>
                          清空筛选
                        </button>
                      ) : null}
                    </div>

                    <div className="overview-meta-bar overview-selection-bar">
                      <div className="overview-selection-copy">
                        <strong className="overview-selection-count">
                          已选 {overviewSelectedTaskIds.length} 项
                        </strong>
                        <span className="overview-selection-hint">
                          当前筛选 {overviewTasks.length} 项，本页 {overviewVisibleTasks.length} 项
                        </span>
                      </div>

                      <div className="overview-selection-actions">
                        <button
                          className="ghost-button overview-selection-button"
                          onClick={toggleOverviewVisibleTaskSelection}
                          disabled={overviewVisibleTasks.length === 0}
                          type="button"
                        >
                          {isAllOverviewVisibleTasksSelected ? '取消本页' : '本页全选'}
                        </button>
                        <button
                          className="ghost-button overview-selection-button"
                          onClick={selectAllOverviewTasks}
                          disabled={overviewTasks.length === 0 || isAllOverviewTasksSelected}
                          type="button"
                        >
                          {isAllOverviewTasksSelected ? '已全选筛选结果' : '全选筛选结果'}
                        </button>
                        <button
                          className="ghost-button overview-selection-button"
                          onClick={clearOverviewTaskSelection}
                          disabled={overviewSelectedTaskIds.length === 0}
                          type="button"
                        >
                          清空选择
                        </button>
                        <button
                          className="danger-button overview-selection-button overview-batch-delete"
                          onClick={openBulkDeleteConfirm}
                          disabled={overviewSelectedTaskIds.length === 0}
                          type="button"
                        >
                          批量删除
                        </button>
                      </div>
                    </div>

                    <div className="project-table overview-table">
                      <div className="table-head">
                        <span className="table-head-select">
                          <input
                            ref={(element) => {
                              if (element) {
                                element.indeterminate = isSomeOverviewVisibleTasksSelected
                              }
                            }}
                            aria-label={
                              isAllOverviewVisibleTasksSelected ? '取消当前页项目选择' : '选择当前页项目'
                            }
                            checked={isAllOverviewVisibleTasksSelected}
                            className="table-row-checkbox"
                            disabled={overviewVisibleTasks.length === 0}
                            onChange={toggleOverviewVisibleTaskSelection}
                            type="checkbox"
                          />
                        </span>
                        <span className="table-head-project">项目</span>
                        <span className="table-head-owner">负责人</span>
                        <span className="table-head-status">状态</span>
                        <span className="table-head-priority">优先级</span>
                        <span className="table-head-period">项目执行周期</span>
                        <span className="table-head-milestone">里程碑</span>
                      </div>
                      <div className="overview-table-body">
                        {overviewTasks.length === 0 ? (
                          <div className="table-empty">没有找到符合筛选条件的项目。</div>
                        ) : (
                          overviewVisibleTasks.map((task) => {
                            const priorityMeta = priorityPalette[task.priority]
                            const ownerName = membersById[task.ownerId]?.name ?? '-'
                            const executionRange = formatTaskExecutionRange(task)
                            const executionDuration = `持续 ${Math.max(task.duration, 1)} 天`
                            const isOverviewTaskChecked = overviewSelectedTaskSet.has(task.id)
                            return (
                              <div
                                key={task.id}
                                className={[
                                  'table-row',
                                  task.id === overviewSelectedTaskId ? 'is-selected' : '',
                                  isOverviewTaskChecked ? 'is-checked' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onClick={() => handleSelectTask(task.id)}
                                onContextMenu={(event) => openContextMenu(event, task.id)}
                                onKeyDown={(event) => {
                                  if (event.target !== event.currentTarget) {
                                    return
                                  }

                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    handleSelectTask(task.id)
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                              >
                                <span className="table-cell table-cell-select" onClick={(event) => event.stopPropagation()}>
                                  <input
                                    aria-label={`选择项目 ${task.title}`}
                                    checked={isOverviewTaskChecked}
                                    className="table-row-checkbox"
                                    onChange={() => toggleOverviewTaskSelection(task.id)}
                                    type="checkbox"
                                  />
                                </span>
                                <span
                                  className="table-cell table-cell-project"
                                  title={task.title}
                                  data-tooltip={task.title}
                                >
                                  <span className="truncate-text">{task.title}</span>
                                </span>
                                <span
                                  className="table-cell table-cell-start"
                                  title={ownerName}
                                  data-tooltip={ownerName}
                                >
                                  <span className="truncate-text">{ownerName}</span>
                                </span>
                                <span className="table-cell table-cell-start">
                                  <span>{task.status}</span>
                                </span>
                                <span className="table-cell table-cell-start">
                                  <em
                                    className="priority-pill"
                                    style={{
                                      background: priorityMeta.background,
                                      borderColor: priorityMeta.border,
                                      color: priorityMeta.text,
                                    }}
                                  >
                                    {task.priority}
                                  </em>
                                </span>
                                <span
                                  className="table-cell table-cell-start"
                                  title={`${executionRange} · ${executionDuration}`}
                                  data-tooltip={`${executionRange} · ${executionDuration}`}
                                >
                                  <span className="table-period-stack">
                                    <strong>{executionRange}</strong>
                                    <small>{executionDuration}</small>
                                  </span>
                                </span>
                                <span
                                  className="table-cell table-cell-milestone"
                                  title={task.milestone}
                                  data-tooltip={task.milestone}
                                >
                                  <span className="truncate-text">{task.milestone}</span>
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                      {overviewTotalPages > 1 ? (
                        <div className="table-footer">
                          <div className="table-pagination">
                            <button
                              className="ghost-button table-page-button"
                              onClick={() =>
                                setOverviewPage((current) => Math.max(1, Math.min(current, overviewTotalPages) - 1))
                              }
                              disabled={effectiveOverviewPage === 1}
                            >
                              上一页
                            </button>
                            <span className="table-page-status">
                              第 {effectiveOverviewPage} / {overviewTotalPages} 页
                            </span>
                            <button
                              className="ghost-button table-page-button"
                              onClick={() =>
                                setOverviewPage((current) =>
                                  Math.min(overviewTotalPages, Math.min(current, overviewTotalPages) + 1),
                                )
                              }
                              disabled={effectiveOverviewPage === overviewTotalPages}
                            >
                              下一页
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              </section>
            ) : (
              <section className="resource-focus-layout">
                <div className="gantt-card gantt-card-focus" ref={timelineGestureRegionRef}>
                  <div className="card-header">
                    <div>
                      <h3>{visibleMonthLabel} 项目排期</h3>
                    </div>
                  </div>

                  <div className="timeline-toolbar">
                    <div className="timeline-toolbar-start">
                      <div className="filter-pills">
                        {(['全部状态', '计划中', '进行中', '风险', '已完成'] as const).map((status) => (
                          <button
                            key={status}
                            className={statusFilter === status ? 'pill is-active' : 'pill'}
                            onClick={() => setStatusFilter(status)}
                          >
                            {status}
                          </button>
                        ))}
                      </div>

                      <div className="timeline-filter-tools" ref={timelineFilterBarRef}>
                        <div className="overview-filter-group">
                          <button
                            type="button"
                            className={`overview-filter-trigger timeline-filter-trigger ${timelineFilterMenu === 'member' ? 'is-open' : ''} ${effectiveTimelineMemberFilter.length > 0 ? 'is-active' : ''}`}
                            onClick={() =>
                              setTimelineFilterMenu((current) => (current === 'member' ? null : 'member'))
                            }
                          >
                            <span>{timelineMemberSummary}</span>
                            <strong>{timelineFilterMenu === 'member' ? '收起' : '筛选'}</strong>
                          </button>
                          {timelineFilterMenu === 'member' ? (
                            <div className="overview-filter-popover timeline-filter-popover">
                              <div className="overview-filter-popover-head">
                                <span>成员多选</span>
                                <button type="button" onClick={clearTimelineMemberFilter}>
                                  清空
                                </button>
                              </div>
                              <div className="overview-filter-option-list">
                                {workspace.members.map((member) => (
                                  <label key={member.id} className="overview-filter-option">
                                    <input
                                      checked={effectiveTimelineMemberFilter.includes(member.id)}
                                      onChange={() => toggleTimelineMemberFilter(member.id)}
                                      type="checkbox"
                                    />
                                    <span>
                                      {member.name} · {member.role}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="overview-filter-group">
                          <button
                            type="button"
                            className={`overview-filter-trigger timeline-filter-trigger ${timelineFilterMenu === 'holiday' ? 'is-open' : ''} ${isHolidayHighlightEnabled ? 'is-active' : ''}`}
                            onClick={() =>
                              setTimelineFilterMenu((current) => (current === 'holiday' ? null : 'holiday'))
                            }
                          >
                            <span>节假日与调休</span>
                            <strong>{isHolidayHighlightEnabled ? '已标记' : '查看'}</strong>
                          </button>
                          {timelineFilterMenu === 'holiday' ? (
                            <div className="overview-filter-popover timeline-filter-popover timeline-holiday-popover">
                              <div className="overview-filter-popover-head">
                                <span>2026 年法定节假日与调休安排</span>
                                <button
                                  type="button"
                                  onClick={() => setIsHolidayHighlightEnabled((current) => !current)}
                                >
                                  {isHolidayHighlightEnabled ? '取消标记' : '标记日期'}
                                </button>
                              </div>
                              <div className="timeline-holiday-list">
                                {CHINA_OFFICIAL_HOLIDAY_CALENDAR_2026.map((holiday) => (
                                  <div
                                    key={holiday.id}
                                    className={`timeline-holiday-item ${holiday.kind === 'makeup-workday' ? 'is-workday' : 'is-holiday'}`}
                                  >
                                    <div className="timeline-holiday-item-head">
                                      <strong>{holiday.name}</strong>
                                      <em>{holiday.kind === 'makeup-workday' ? '班' : '休'}</em>
                                    </div>
                                    <span>
                                      {holiday.start === holiday.end
                                        ? holiday.start.replaceAll('-', '.')
                                        : `${holiday.start.replaceAll('-', '.')} - ${holiday.end.replaceAll('-', '.')}`}
                                      {holiday.kind === 'makeup-workday' ? ' 调休上班' : ' 放假'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="month-navigator">
                      {!isCurrentTimelineWindow ? (
                        <button className="icon-button" onClick={() => jumpToDate(BASE_DATE)}>
                          回到当前时间
                        </button>
                      ) : null}
                      <button className="ghost-button" onClick={() => shiftTimelineWindow(-1)}>
                        上周
                      </button>
                      <div className="month-navigator-anchor" ref={dateJumpRef}>
                        <button
                          type="button"
                          className={isDateJumpOpen ? 'month-chip month-chip-button is-open' : 'month-chip month-chip-button'}
                          aria-expanded={isDateJumpOpen}
                          aria-haspopup="dialog"
                          onClick={() => {
                            setPendingDateValue(
                              formatDateInputValue(
                                isFocusedDateInVisibleMonth ? focusedDate : visibleMonthStart,
                              ),
                            )
                            setIsDateJumpOpen((current) => !current)
                          }}
                        >
                          <span className="month-chip-copy">
                            <strong>{visibleMonthLabel}</strong>
                            <small>{visibleMonthRange} · {visibleMonthTasks.length} 个项目</small>
                          </span>
                          <span className="month-chip-action">{isDateJumpOpen ? '收起' : '定位'}</span>
                        </button>

                        {isDateJumpOpen ? (
                          <div className="date-jump-popover" role="dialog" aria-label="快速定位日期">
                            <div className="date-jump-header">
                              <div>
                                <p className="caps">时间定位</p>
                                <strong>{formatFullDateHeading(pendingJumpDate)}</strong>
                                <small>
                                  将切换到 {pendingJumpMonthLabel} · {pendingJumpMonthRange}
                                </small>
                              </div>
                              <button
                                type="button"
                                className="circle-close-button date-jump-close"
                                aria-label="关闭时间定位"
                                onClick={() => setIsDateJumpOpen(false)}
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            </div>

                            <label className="date-jump-field">
                              <span>选择年月日</span>
                              <input
                                type="date"
                                value={pendingDateValue}
                                onChange={(event) => handlePendingDateChange(event.target.value)}
                              />
                            </label>

                            <div className="date-jump-shortcuts">
                              <button
                                type="button"
                                className="pill"
                                onClick={() => jumpToDate(BASE_DATE)}
                              >
                                今天
                              </button>
                              <button
                                type="button"
                                className="pill"
                                onClick={() => jumpToDate(startOfWeek(pendingJumpDate))}
                              >
                                本周
                              </button>
                              <button
                                type="button"
                                className="pill"
                                onClick={() =>
                                  jumpToDate(addCalendarDays(pendingJumpDate, TIMELINE_WINDOW_STEP_DAYS))
                                }
                              >
                                下周
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <button className="ghost-button" onClick={() => shiftTimelineWindow(1)}>
                        下周
                      </button>
                    </div>
                  </div>

                  <div className="timeline-scroll" onWheel={handleTimelineWheel}>
                    <div className="timeline-sheet" style={timelineStyle}>
                      <div className="timeline-head">
                        <div className="name-column">成员 / 项目</div>
                        <div className="date-grid date-grid-browse" onMouseDown={startTimelineBrowse}>
                          {timelineDays.map((day) => (
                            <span
                              key={day.key}
                              data-day-key={day.key}
                              title={day.specialDayLabel ?? undefined}
                              className={[
                                'date-cell',
                                day.isFocused ? 'is-focused' : '',
                                day.isHoliday ? 'is-holiday' : '',
                                day.isMakeupWorkday ? 'is-makeup-workday' : '',
                                day.isWeekend ? 'is-weekend' : '',
                                day.isToday ? 'is-today' : '',
                                day.isOutsideVisibleMonth ? 'is-outside-month' : '',
                                day.isMonthStart ? 'is-month-start' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              <strong>{day.dayLabel}</strong>
                              <small>{day.weekdayLabel}</small>
                              {day.isHoliday ? <em className="date-day-tag is-holiday">休</em> : null}
                              {day.isMakeupWorkday ? <em className="date-day-tag is-workday">班</em> : null}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="timeline-body-scroll">
                        <div className="timeline-body">
                        {memberRows.length === 0 ? (
                          <div className="timeline-empty">当前筛选下没有可展示的成员，请重新选择成员范围。</div>
                        ) : (
                          memberRows.map((row, rowIndex) => {
                          const rowTasks =
                            taskTimelineInteraction?.mode === 'move'
                              ? (() => {
                                  const movingTask =
                                    row.tasks.find((task) => task.id === taskTimelineInteraction.taskId) ??
                                    null
                                  const remainingTasks = row.tasks.filter(
                                    (task) => task.id !== taskTimelineInteraction.taskId,
                                  )

                                  if (row.member.id !== taskTimelineInteraction.previewOwnerId) {
                                    return remainingTasks
                                  }

                                  if (!movingTask) {
                                    return remainingTasks
                                  }

                                  const insertIndex = Math.max(
                                    0,
                                    Math.min(taskTimelineInteraction.previewLaneIndex, remainingTasks.length),
                                  )
                                  return [
                                    ...remainingTasks.slice(0, insertIndex),
                                    movingTask,
                                    ...remainingTasks.slice(insertIndex),
                                  ]
                                })()
                              : row.tasks
                          const hasDragPreview = dragSelection?.memberId === row.member.id
                          const isTaskDropTarget =
                            taskTimelineInteraction?.mode === 'move' &&
                            taskTimelineInteraction.previewOwnerId === row.member.id
                          const previewStartDay = hasDragPreview
                            ? Math.min(dragSelection.anchorDay, dragSelection.currentDay)
                            : 0
                          const previewEndDay = hasDragPreview
                            ? Math.max(dragSelection.anchorDay, dragSelection.currentDay)
                            : 0
                          const previewDuration = previewEndDay - previewStartDay + 1
                          const previewLeft = `${(previewStartDay / timelineDays.length) * 100}%`
                          const previewWidth = `${(previewDuration / timelineDays.length) * 100}%`
                          const previewStartDate = hasDragPreview
                            ? addCalendarDays(visibleMonthStart, previewStartDay)
                            : visibleMonthStart
                          const previewEndDate = hasDragPreview
                            ? addCalendarDays(visibleMonthStart, previewEndDay)
                            : visibleMonthStart
                          const previewLabel = `${previewStartDate.getMonth() + 1}/${previewStartDate.getDate()} - ${previewEndDate.getMonth() + 1}/${previewEndDate.getDate()}`
                          const rowLaneCount = rowTasks.length + (hasDragPreview ? 1 : 0)
                          const isRowBeingReordered = memberRowReorder?.memberId === row.member.id
                          const rowDragOffset = isRowBeingReordered
                            ? memberRowReorder.currentY - memberRowReorder.startY
                            : 0

                          return (
                            <div
                              key={row.member.id}
                              ref={(element) => {
                                timelineRowRefs.current[row.member.id] = element
                              }}
                              className={[
                                'person-row',
                                `row-tone-${(rowIndex % 4) + 1}`,
                                isRowBeingReordered ? 'is-reordering' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              style={
                                isRowBeingReordered
                                  ? {
                                      transform: `translateY(${rowDragOffset}px)`,
                                      zIndex: 4,
                                    }
                                  : undefined
                              }
                            >
                              <div
                                className="person-meta"
                                onMouseDown={(event) => startMemberRowReorder(event, row.member.id)}
                              >
                                <strong>{row.member.name}</strong>
                              </div>

                              <div
                                ref={(element) => {
                                  timelineLaneRefs.current[row.member.id] = element
                                }}
                                className={[
                                  'bars-column',
                                  hasDragPreview ? 'is-selecting' : '',
                                  isTaskDropTarget ? 'is-drop-target' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                style={{
                                  minHeight: `${Math.max(70, rowLaneCount * 40 + 20)}px`,
                                }}
                                onMouseDown={(event) => handleTimelineMouseDown(row.member.id, event)}
                              >
                                {hasDragPreview ? (
                                  <div
                                    className="selection-preview"
                                    style={{
                                      left: previewLeft,
                                      width: previewWidth,
                                      top: `${rowTasks.length * 40 + 10}px`,
                                    }}
                                  >
                                    <span>{previewLabel}</span>
                                  </div>
                                ) : null}

                                {rowTasks.map((task, index) => {
                                  const taskStartDate = getTaskStartDate(task)
                                  const taskEndDate = getTaskEndDate(task)
                                  const clippedStart =
                                    taskStartDate < visibleMonthStart
                                      ? visibleMonthStart
                                      : taskStartDate
                                  const clippedEnd =
                                    taskEndDate > visibleMonthEnd ? visibleMonthEnd : taskEndDate
                                  const leftOffset = diffCalendarDays(clippedStart, visibleMonthStart)
                                  const visibleDuration =
                                    diffCalendarDays(clippedEnd, clippedStart) + 1
                                  const left = `${(leftOffset / timelineDays.length) * 100}%`
                                  const width = `${Math.max(4, (visibleDuration / timelineDays.length) * 100)}%`
                                  const owner = membersById[task.ownerId]
                                  const priorityMeta = priorityPalette[task.priority]
                                  const isTaskSelected = task.id === selectedTaskId
                                  const isTaskCoached = taskCoach?.taskId === task.id
                                  const isTaskBeingManipulated =
                                    taskTimelineInteraction?.taskId === task.id

                                  return (
                                    <button
                                      key={task.id}
                                      className={[
                                        'task-bar',
                                        isTaskSelected ? 'is-selected' : '',
                                        isTaskCoached ? 'is-coached' : '',
                                        isTaskBeingManipulated ? 'is-manipulating' : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                      style={{
                                        left,
                                        width,
                                        top: `${index * 40 + 10}px`,
                                        background: priorityMeta.solid,
                                      }}
                                      onClick={() => handleSelectTask(task.id, { fromTimeline: true })}
                                      onMouseDown={(event) =>
                                        startTaskTimelineInteraction(event, task, 'move', index)
                                      }
                                      onContextMenu={(event) => openContextMenu(event, task.id)}
                                      aria-label={`${task.title}，负责人 ${owner?.name ?? '未分配'}，优先级 ${task.priority}，进度 ${task.progress}%`}
                                    >
                                      <span className="task-title">{task.title}</span>
                                      <em className="priority-pill task-priority-pill">
                                        {task.priority}
                                      </em>
                                      <small className="task-progress-pill">{task.progress}%</small>
                                      <span
                                        className="task-resize-handle is-start"
                                        onMouseDown={(event) =>
                                          startTaskTimelineInteraction(event, task, 'resize-start')
                                        }
                                      ></span>
                                      <span
                                        className="task-resize-handle is-end"
                                        onMouseDown={(event) =>
                                          startTaskTimelineInteraction(event, task, 'resize-end')
                                        }
                                      ></span>
                                      {isTaskCoached ? (
                                        <span className="task-coach-bubble">{taskCoach.message}</span>
                                      ) : null}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })
                        )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {contextMenu ? (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={() => openEditModal(contextMenu.taskId)}>编辑项目</button>
          <button className="danger" onClick={() => openDeleteConfirm(contextMenu.taskId)}>
            删除项目
          </button>
        </div>
      ) : null}

      {resourceDeleteTarget ? (
        <div className="overlay" onClick={() => setResourceDeleteTarget(null)}>
          <div className="dialog confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div>
                <p className="caps">删除确认</p>
                <h3>
                  确定删除这个{resourceDeleteTarget.kind === 'team' ? '团队' : '成员'}吗？
                </h3>
              </div>
            </div>
            <p className="detail-copy">
              {resourceDeleteTarget.kind === 'team'
                ? `团队“${resourceDeleteTarget.name}”删除后将不再出现在筛选与组织管理中。若仍关联成员或项目，系统会阻止本次删除。`
                : `成员“${resourceDeleteTarget.name}”删除后将不再出现在排期工作台中。若仍负责项目，系统会阻止本次删除。`}
            </p>
            <div className="dialog-actions">
              <button className="ghost-button" onClick={() => setResourceDeleteTarget(null)}>
                取消
              </button>
              <button
                className="danger-button"
                onClick={() =>
                  resourceDeleteTarget.kind === 'team'
                    ? handleDeleteTeam(resourceDeleteTarget.id)
                    : handleDeleteMember(resourceDeleteTarget.id)
                }
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editModal ? (
        <div className="overlay" onClick={() => setEditModal(null)}>
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div>
                <p className="caps">{editModal.mode === 'create' ? '新建项目' : '编辑项目'}</p>
                <h3>{editModal.draft.title}</h3>
              </div>
              <button className="circle-close-button" aria-label="关闭项目编辑弹窗" onClick={() => setEditModal(null)}>
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="editor-grid">
              <label>
                项目名称
                <input
                  value={editModal.draft.title}
                  onChange={(event) =>
                    setEditModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: { ...current.draft, title: event.target.value },
                          }
                        : current,
                    )
                  }
                />
              </label>

              <label>
                负责人
                <select
                  value={editModal.draft.ownerId}
                  onChange={(event) =>
                    setEditModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: { ...current.draft, ownerId: event.target.value },
                          }
                        : current,
                    )
                  }
                >
                  {workspace.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {teamsById[member.teamId]?.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                状态
                <select
                  value={editModal.draft.status}
                  onChange={(event) =>
                    setEditModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              status: event.target.value as Status,
                            },
                          }
                        : current,
                    )
                  }
                >
                  {(['计划中', '进行中', '风险', '已完成'] as Status[]).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                优先级
                <select
                  value={editModal.draft.priority}
                  onChange={(event) =>
                    setEditModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              priority: event.target.value as Priority,
                            },
                          }
                        : current,
                    )
                  }
                >
                  {priorityOrder.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority} · {priorityPalette[priority].hint}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                开始日期
                <input
                  type="date"
                  value={formatDateInputValue(getTaskStartDate(editModal.draft))}
                  onChange={(event) =>
                    setEditModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              startOffset: diffCalendarDays(
                                parseDateInputValue(event.target.value),
                                BASE_DATE,
                              ),
                            },
                          }
                        : current,
                    )
                  }
                />
              </label>

              <label>
                持续天数
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={editModal.draft.duration}
                  onChange={(event) =>
                    setEditModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              duration: Number(event.target.value),
                            },
                          }
                        : current,
                    )
                  }
                />
              </label>

              <label>
                完成进度
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editModal.draft.progress}
                  onChange={(event) =>
                    setEditModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              progress: Number(event.target.value),
                            },
                          }
                        : current,
                    )
                  }
                />
              </label>
            </div>

            <label className="editor-block">
              项目说明
              <textarea
                rows={4}
                value={editModal.draft.summary}
                onChange={(event) =>
                  setEditModal((current) =>
                    current
                      ? {
                          ...current,
                          draft: { ...current.draft, summary: event.target.value },
                        }
                      : current,
                  )
                }
              />
            </label>

            <label className="editor-block">
              里程碑
              <input
                value={editModal.draft.milestone}
                onChange={(event) =>
                  setEditModal((current) =>
                    current
                      ? {
                          ...current,
                          draft: { ...current.draft, milestone: event.target.value },
                        }
                      : current,
                  )
                }
              />
            </label>

            <div className="dialog-actions">
              <button className="ghost-button" onClick={() => setEditModal(null)}>
                取消
              </button>
              <button className="primary-button" onClick={handleSaveEdit}>
                {editModal.mode === 'create' ? '创建项目' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmCount > 0 ? (
        <div className="overlay" onClick={closeDeleteConfirm}>
          <div className="dialog confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div>
                <p className="caps">删除确认</p>
                <h3>{isBulkDeleteConfirm ? `确定批量删除 ${deleteConfirmCount} 个项目吗？` : '确定删除这个项目吗？'}</h3>
              </div>
            </div>
            <p className="detail-copy">
              {isBulkDeleteConfirm
                ? `删除后会立即从当前工作区移除所选项目，并写入一条批量删除记录。${deleteConfirmPreview ? ` 本次将删除：${deleteConfirmPreview}${deleteConfirmCount > 3 ? ' 等项目。' : '。'}` : ''}`
                : '删除后会立即从当前工作区移除，并写入操作记录。这一步不可撤销。'}
            </p>
            <div className="dialog-actions">
              <button className="ghost-button" onClick={closeDeleteConfirm}>
                取消
              </button>
              <button className="danger-button" onClick={handleDeleteTask}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
