import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'

type Status = '计划中' | '进行中' | '风险' | '已完成'
type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

type Team = {
  id: string
  name: string
  lead: string
  color: string
}

type Member = {
  id: string
  name: string
  role: string
  teamId: string
  avatar: string
  capacityHours: number
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

type LegacyActivity = {
  id: string
  title: string
  detail: string
  time: string
}

type AccountRole = 'admin' | 'user'

type UserAccount = {
  id: string
  username: string
  password: string
  displayName: string
  role: AccountRole
  department: string
  group: string
  createdAt: string
}

type Workspace = {
  teams: Team[]
  members: Member[]
  tasks: Task[]
  updateRecords: ReleaseRecord[]
  operationRecords: OperationRecord[]
  accounts: UserAccount[]
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

type AccountDraft = Pick<
  UserAccount,
  'username' | 'password' | 'displayName' | 'role' | 'department' | 'group'
>

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

type AccountEditorState = {
  mode: 'create' | 'edit'
  accountId?: string
  draft: AccountDraft
} | null

type AccountDeleteTarget = {
  id: string
  username: string
} | null

type LoginFormState = {
  username: string
  password: string
}

type DragSelectionState = {
  memberId: string
  anchorDay: number
  currentDay: number
  rectLeft: number
  rectWidth: number
  dayCount: number
} | null

type TimelineDay = {
  key: string
  date: Date
  dayLabel: string
  weekdayLabel: string
  isToday: boolean
  isFocused: boolean
  isWeekend: boolean
}

type NavSection = '总览' | '资源排期' | '项目进度' | '团队协作' | '记录中心' | '账号管理'
type RecordView = '更新记录' | '操作记录'

const STORAGE_KEY = 'human-gantt-workbench:v4'
const SESSION_STORAGE_KEY = 'human-gantt-session:v1'
const BASE_DATE = new Date('2026-04-21T00:00:00+08:00')
const priorityOrder: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']
const CURRENT_OPERATOR = '当前用户'

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
    { id: 'strategy', name: '产品策略组', lead: '林青', color: '#5568ff' },
    { id: 'design', name: '体验设计组', lead: '周亦', color: '#22c55e' },
    { id: 'delivery', name: '前端交付组', lead: '许衡', color: '#06b6d4' },
  ],
  members: [
    {
      id: 'linqing',
      name: '林青',
      role: '产品负责人',
      teamId: 'strategy',
      avatar: '林',
      capacityHours: 40,
    },
    {
      id: 'mina',
      name: '米娜',
      role: '项目运营',
      teamId: 'strategy',
      avatar: '米',
      capacityHours: 36,
    },
    {
      id: 'zhouyi',
      name: '周亦',
      role: '设计负责人',
      teamId: 'design',
      avatar: '周',
      capacityHours: 40,
    },
    {
      id: 'xuheng',
      name: '许衡',
      role: '前端工程师',
      teamId: 'delivery',
      avatar: '许',
      capacityHours: 44,
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
      color: '#0ea5e9',
      summary: '为 PMO 增加风险摘要和里程碑播报，方便每周例会快速汇报。',
      milestone: '5 月 3 日上线',
      updatedAt: '今天 08:30',
    },
  ],
  updateRecords: [
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
  ],
  operationRecords: [
    {
      id: 'operation-1',
      actor: '系统',
      time: '2026/04/21 13:30',
      action: '历史迁移',
      target: '记录中心',
      detail: '已启用更新记录与操作记录双表视图。',
    },
  ],
}

function cloneDefaultWorkspace() {
  return JSON.parse(JSON.stringify(defaultWorkspace)) as Workspace
}

function normalizeWorkspace(input: unknown) {
  const fallback = cloneDefaultWorkspace()

  if (!input || typeof input !== 'object') {
    return fallback
  }

  const candidate = input as Partial<Workspace> & { activities?: LegacyActivity[] }

  const legacyOperationRecords = Array.isArray(candidate.activities)
    ? candidate.activities.map((activity, index) => ({
        id: activity.id || `legacy-operation-${index + 1}`,
        actor: '历史迁移',
        time: activity.time || '历史时间未知',
        action: '历史迁移' as const,
        target: activity.title || `历史记录 ${index + 1}`,
        detail: activity.detail || '历史记录已迁移到操作记录。',
      }))
    : []

  return {
    teams: Array.isArray(candidate.teams) ? candidate.teams : fallback.teams,
    members: Array.isArray(candidate.members) ? candidate.members : fallback.members,
    tasks: Array.isArray(candidate.tasks) ? candidate.tasks : fallback.tasks,
    updateRecords:
      Array.isArray(candidate.updateRecords) && candidate.updateRecords.length > 0
        ? candidate.updateRecords
        : fallback.updateRecords,
    operationRecords:
      Array.isArray(candidate.operationRecords) && candidate.operationRecords.length > 0
        ? candidate.operationRecords
        : legacyOperationRecords.length > 0
          ? legacyOperationRecords
          : fallback.operationRecords,
  } satisfies Workspace
}

function formatTimeLabel() {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function formatAuditTimeLabel() {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return normalizeDate(next)
}

function addCalendarMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function diffCalendarDays(later: Date, earlier: Date) {
  const laterDate = normalizeDate(later).getTime()
  const earlierDate = normalizeDate(earlier).getTime()
  return Math.round((laterDate - earlierDate) / 86_400_000)
}

function diffCalendarMonths(later: Date, earlier: Date) {
  return (
    (later.getFullYear() - earlier.getFullYear()) * 12 + (later.getMonth() - earlier.getMonth())
  )
}

function addCalendarMonthsKeepingDay(date: Date, months: number) {
  const source = normalizeDate(date)
  const targetMonthStart = new Date(source.getFullYear(), source.getMonth() + months, 1)
  const targetDay = Math.min(source.getDate(), endOfMonth(targetMonthStart).getDate())
  return new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth(), targetDay)
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

function formatShortDateLabel(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}`
}

function formatMonthRangeLabel(date: Date) {
  return `${formatShortDateLabel(startOfMonth(date))} - ${formatShortDateLabel(endOfMonth(date))}`
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

function buildMonthTimelineDays(monthDate: Date, focusedDate: Date) {
  const monthStart = startOfMonth(monthDate)
  const monthEnd = endOfMonth(monthDate)
  const today = normalizeDate(BASE_DATE)
  const normalizedFocus = normalizeDate(focusedDate)

  return Array.from({ length: monthEnd.getDate() }, (_, index) => {
    const date = addCalendarDays(monthStart, index)
    const weekdayIndex = date.getDay()
    const weekdayLabel = ['日', '一', '二', '三', '四', '五', '六'][weekdayIndex] ?? '日'

    return {
      key: formatDateInputValue(date),
      date,
      dayLabel: String(date.getDate()).padStart(2, '0'),
      weekdayLabel: `周${weekdayLabel}`,
      isFocused: diffCalendarDays(date, normalizedFocus) === 0,
      isToday: diffCalendarDays(date, today) === 0,
      isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
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
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    const stored =
      typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null

    if (!stored) {
      return cloneDefaultWorkspace()
    }

    try {
      return normalizeWorkspace(JSON.parse(stored))
    } catch {
      return cloneDefaultWorkspace()
    }
  })
  const [activeNav, setActiveNav] = useState<NavSection>('资源排期')
  const [recordView, setRecordView] = useState<RecordView>('更新记录')
  const [selectedTaskId, setSelectedTaskId] = useState(() => defaultWorkspace.tasks[0].id)
  const [teamFilter, setTeamFilter] = useState('全部团队')
  const [statusFilter, setStatusFilter] = useState<'全部状态' | Status>('全部状态')
  const [monthCursor, setMonthCursor] = useState(0)
  const [focusedDate, setFocusedDate] = useState(() => normalizeDate(BASE_DATE))
  const [isDateJumpOpen, setIsDateJumpOpen] = useState(false)
  const [pendingDateValue, setPendingDateValue] = useState(() => formatDateInputValue(BASE_DATE))
  const [searchValue, setSearchValue] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [editModal, setEditModal] = useState<EditModalState>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false)
  const [teamEditor, setTeamEditor] = useState<TeamEditorState>(null)
  const [memberEditor, setMemberEditor] = useState<MemberEditorState>(null)
  const [resourceNotice, setResourceNotice] = useState<ResourceNoticeState>(null)
  const [resourceDeleteTarget, setResourceDeleteTarget] = useState<ResourceDeleteTarget>(null)
  const [dragSelection, setDragSelection] = useState<DragSelectionState>(null)
  const deferredSearch = useDeferredValue(searchValue)
  const dragSelectionRef = useRef<DragSelectionState>(null)
  const dateJumpRef = useRef<HTMLDivElement | null>(null)
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
  }, [workspace])

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null)
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
        setEditModal(null)
        setDeleteTargetId(null)
        setIsResourceModalOpen(false)
        setTeamEditor(null)
        setMemberEditor(null)
        setResourceNotice(null)
        setResourceDeleteTarget(null)
        setIsDateJumpOpen(false)
        dragSelectionRef.current = null
        setDragSelection(null)
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
    const handleDeleteShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }

      if (
        isEditableKeyboardTarget(event.target) ||
        editModal ||
        deleteTargetId ||
        isResourceModalOpen ||
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
    isResourceModalOpen,
    memberEditor,
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
  const teamStats = useMemo(
    () =>
      Object.fromEntries(
        workspace.teams.map((team) => [
          team.id,
          {
            memberCount: workspace.members.filter((member) => member.teamId === team.id).length,
            taskCount: workspace.tasks.filter((task) => task.teamId === team.id).length,
          },
        ]),
      ),
    [workspace.members, workspace.tasks, workspace.teams],
  )
  const memberTaskCounts = useMemo(
    () =>
      Object.fromEntries(
        workspace.members.map((member) => [
          member.id,
          workspace.tasks.filter((task) => task.ownerId === member.id).length,
        ]),
      ),
    [workspace.members, workspace.tasks],
  )

  const selectedTask =
    workspace.tasks.find((task) => task.id === selectedTaskId) ?? workspace.tasks[0] ?? null
  const visibleMonthStart = useMemo(
    () => addCalendarMonths(startOfMonth(BASE_DATE), monthCursor),
    [monthCursor],
  )
  const visibleMonthEnd = useMemo(() => endOfMonth(visibleMonthStart), [visibleMonthStart])
  const timelineDays = useMemo(
    () => buildMonthTimelineDays(visibleMonthStart, focusedDate),
    [focusedDate, visibleMonthStart],
  )
  const focusedDayIndex = diffCalendarDays(focusedDate, visibleMonthStart)
  const isFocusedDateVisible = focusedDayIndex >= 0 && focusedDayIndex < timelineDays.length
  const timelineStyle = {
    '--days': timelineDays.length,
    '--day-size': '42px',
    '--name-col': '176px',
    '--focused-day-index': String(Math.max(focusedDayIndex, 0)),
    '--focus-opacity': isFocusedDateVisible ? 1 : 0,
  } as CSSProperties

  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const overviewTasks = useMemo(() => {
    return workspace.tasks.filter((task) => {
      const member = membersById[task.ownerId]
      const team = teamsById[task.teamId]
      const matchesSearch =
        !normalizedSearch ||
        task.title.toLowerCase().includes(normalizedSearch) ||
        task.summary.toLowerCase().includes(normalizedSearch) ||
        member?.name.toLowerCase().includes(normalizedSearch) ||
        team?.name.toLowerCase().includes(normalizedSearch)

      const matchesTeam = teamFilter === '全部团队' || task.teamId === teamFilter
      return matchesSearch && matchesTeam
    })
  }, [membersById, normalizedSearch, teamFilter, teamsById, workspace.tasks])
  const ganttTasks = useMemo(
    () =>
      workspace.tasks.filter(
        (task) => statusFilter === '全部状态' || task.status === statusFilter,
      ),
    [statusFilter, workspace.tasks],
  )
  const visibleMonthTasks = useMemo(
    () =>
      ganttTasks.filter((task) => taskOverlapsWindow(task, visibleMonthStart, visibleMonthEnd)),
    [ganttTasks, visibleMonthEnd, visibleMonthStart],
  )

  const memberRows = useMemo(() => {
    return workspace.members
      .map((member) => {
        const tasks = visibleMonthTasks.filter((task) => task.ownerId === member.id)
        const bookedHours = tasks.reduce((sum, task) => sum + task.duration * 4, 0)
        const utilization = Math.min(
          100,
          Math.round((bookedHours / Math.max(member.capacityHours, 1)) * 100),
        )

        return {
          member,
          tasks,
          utilization,
          freeHours: Math.max(0, member.capacityHours - bookedHours),
        }
      })
  }, [visibleMonthTasks, workspace.members])

  const riskTasks = workspace.tasks.filter((task) => task.status === '风险')
  const activeTasks = workspace.tasks.filter((task) => task.status === '进行中')
  const averageProgress = Math.round(
    workspace.tasks.reduce((sum, task) => sum + task.progress, 0) /
      Math.max(workspace.tasks.length, 1),
  )
  const averageUtilization = Math.round(
    memberRows.reduce((sum, row) => sum + row.utilization, 0) / Math.max(memberRows.length, 1),
  )
  const visibleMonthLabel = formatMonthHeading(visibleMonthStart)
  const visibleMonthRange = formatMonthRangeLabel(visibleMonthStart)
  const isCurrentMonthView =
    visibleMonthStart.getFullYear() === BASE_DATE.getFullYear() &&
    visibleMonthStart.getMonth() === BASE_DATE.getMonth()
  const isDraggingSelection = dragSelection !== null
  const isRecordsPage = activeNav === '记录中心'
  const isOverviewPage = !isRecordsPage && activeNav !== '资源排期'
  const pendingJumpDate = useMemo(
    () => resolveValidDate(pendingDateValue, focusedDate),
    [focusedDate, pendingDateValue],
  )
  const pendingJumpMonthLabel = formatMonthHeading(pendingJumpDate)
  const pendingJumpMonthRange = formatMonthRangeLabel(pendingJumpDate)

  const syncDragSelection = (nextSelection: DragSelectionState) => {
    dragSelectionRef.current = nextSelection
    setDragSelection(nextSelection)
  }

  const jumpToDate = (date: Date) => {
    const normalizedDate = normalizeDate(date)
    setFocusedDate(normalizedDate)
    setPendingDateValue(formatDateInputValue(normalizedDate))
    setMonthCursor(diffCalendarMonths(startOfMonth(normalizedDate), startOfMonth(BASE_DATE)))
    setIsDateJumpOpen(false)
  }

  const shiftMonth = (delta: number) => {
    jumpToDate(addCalendarMonthsKeepingDay(focusedDate, delta))
  }

  useEffect(() => {
    if (activeNav !== '资源排期' || !isFocusedDateVisible) {
      return
    }

    const timelineElement = timelineScrollRef.current
    if (!timelineElement) {
      return
    }

    const focusKey = formatDateInputValue(focusedDate)
    const frame = window.requestAnimationFrame(() => {
      const dayCell = timelineElement.querySelector<HTMLElement>(`[data-day-key="${focusKey}"]`)
      if (!dayCell) {
        return
      }

      const targetLeft =
        dayCell.offsetLeft - timelineElement.clientWidth / 2 + dayCell.clientWidth / 2

      timelineElement.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'smooth',
      })
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [activeNav, focusedDate, isFocusedDateVisible, visibleMonthStart])

  const appendOperationRecord = (
    action: OperationRecord['action'],
    target: string,
    detail: string,
    actor = CURRENT_OPERATOR,
  ) => {
    const operation: OperationRecord = {
      id: createClientId('operation'),
      actor,
      time: formatAuditTimeLabel(),
      action,
      target,
      detail,
    }

    setWorkspace((current) => ({
      ...current,
      operationRecords: [operation, ...current.operationRecords].slice(0, 60),
    }))
  }

  const openRecordsCenter = (nextView: RecordView) => {
    setContextMenu(null)
    setRecordView(nextView)
    setActiveNav('记录中心')
    appendOperationRecord('查看', '记录中心', `打开了${nextView}页面。`)
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

    setWorkspace((current) => ({
      ...current,
      tasks: options?.insertAtStart ? [newTask, ...current.tasks] : [...current.tasks, newTask],
    }))

    appendOperationRecord(
      '新增',
      `项目 / ${newTask.title}`,
      options?.operationDetail ?? `已将项目排期分配给 ${owner.name}。`,
    )

    setSelectedTaskId(newTask.id)
  }

  const handleSelectTask = (taskId: string) => {
    startTransition(() => {
      setSelectedTaskId(taskId)
    })
  }

  const openContextMenu = (event: ReactMouseEvent, taskId: string) => {
    event.preventDefault()
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
    setDeleteTargetId(taskId)
  }

  const openResourceModal = () => {
    setContextMenu(null)
    setResourceNotice(null)
    setTeamEditor(null)
    setMemberEditor(null)
    setIsResourceModalOpen(true)
    appendOperationRecord('查看', '组织管理', '打开了团队与成员管理面板。')
  }

  const closeResourceModal = () => {
    setIsResourceModalOpen(false)
    setTeamEditor(null)
    setMemberEditor(null)
    setResourceNotice(null)
    setResourceDeleteTarget(null)
  }

  const openTeamCreate = () => {
    setResourceNotice(null)
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
    setTeamEditor({
      mode: 'edit',
      teamId,
      draft: createTeamDraft(team),
    })
  }

  const openMemberCreate = () => {
    if (workspace.teams.length === 0) {
      setResourceNotice({
        tone: 'danger',
        message: '请先创建团队，再添加成员。',
      })
      return
    }

    const preferredTeamId =
      teamFilter !== '全部团队' && teamsById[teamFilter] ? teamFilter : workspace.teams[0]?.id

    setResourceNotice(null)
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
    setMemberEditor({
      mode: 'edit',
      memberId,
      draft: createMemberDraft(member),
    })
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

  const saveTeamEditor = () => {
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

    if (teamEditor.mode === 'create') {
      const newTeam: Team = {
        id: createClientId('team'),
        ...draft,
      }

      setWorkspace((current) => ({
        ...current,
        teams: [...current.teams, newTeam],
      }))
      appendOperationRecord('新增', `团队 / ${newTeam.name}`, `已创建团队，负责人为 ${draft.lead}。`)
      setResourceNotice({
        tone: 'success',
        message: `团队“${newTeam.name}”创建成功。`,
      })
    } else if (teamEditor.teamId) {
      setWorkspace((current) => ({
        ...current,
        teams: current.teams.map((team) =>
          team.id === teamEditor.teamId ? { ...team, ...draft } : team,
        ),
      }))
      appendOperationRecord('修改', `团队 / ${draft.name}`, '已更新团队基础信息。')
      setResourceNotice({
        tone: 'success',
        message: `团队“${draft.name}”保存成功。`,
      })
    }

    setTeamEditor(null)
  }

  const saveMemberEditor = () => {
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

    if (memberEditor.mode === 'create') {
      const newMember: Member = {
        id: createClientId('member'),
        ...draft,
      }

      setWorkspace((current) => ({
        ...current,
        members: [...current.members, newMember],
      }))
      appendOperationRecord('新增', `成员 / ${newMember.name}`, `已加入 ${selectedTeam.name}。`)
      setResourceNotice({
        tone: 'success',
        message: `成员“${newMember.name}”创建成功。`,
      })
    } else if (memberEditor.memberId) {
      const previousMember = membersById[memberEditor.memberId]

      setWorkspace((current) => ({
        ...current,
        members: current.members.map((member) =>
          member.id === memberEditor.memberId ? { ...member, ...draft } : member,
        ),
        tasks: current.tasks.map((task) =>
          task.ownerId === memberEditor.memberId
            ? {
                ...task,
                teamId: draft.teamId,
              }
            : task,
        ),
        teams: current.teams.map((team) =>
          previousMember && team.lead === previousMember.name
            ? { ...team, lead: draft.name }
            : team,
        ),
      }))
      appendOperationRecord('修改', `成员 / ${draft.name}`, '已更新成员档案与团队归属。')
      setResourceNotice({
        tone: 'success',
        message: `成员“${draft.name}”保存成功。`,
      })
    }

    setMemberEditor(null)
  }

  const handleDeleteTeam = (teamId: string) => {
    const team = teamsById[teamId]
    if (!team) {
      return
    }

    const relatedMembers = workspace.members.filter((member) => member.teamId === teamId)
    const relatedTasks = workspace.tasks.filter((task) => task.teamId === teamId)

    if (relatedMembers.length > 0 || relatedTasks.length > 0) {
      setResourceNotice({
        tone: 'danger',
        message: `团队“${team.name}”仍关联 ${relatedMembers.length} 名成员和 ${relatedTasks.length} 个项目，请先迁移或清理后再删除。`,
      })
      setResourceDeleteTarget(null)
      return
    }

    setWorkspace((current) => ({
      ...current,
      teams: current.teams.filter((item) => item.id !== teamId),
    }))

    if (teamFilter === teamId) {
      setTeamFilter('全部团队')
    }

    appendOperationRecord('删除', `团队 / ${team.name}`, '已从当前工作区移除团队。')
    setResourceNotice({
      tone: 'success',
      message: `团队“${team.name}”已删除。`,
    })
    setResourceDeleteTarget(null)
    if (teamEditor?.teamId === teamId) {
      setTeamEditor(null)
    }
  }

  const handleDeleteMember = (memberId: string) => {
    const member = membersById[memberId]
    if (!member) {
      return
    }

    const ownedTasks = workspace.tasks.filter((task) => task.ownerId === memberId)
    if (ownedTasks.length > 0) {
      setResourceNotice({
        tone: 'danger',
        message: `成员“${member.name}”仍负责 ${ownedTasks.length} 个项目，请先转交或删除这些项目后再删除成员。`,
      })
      setResourceDeleteTarget(null)
      return
    }

    setWorkspace((current) => ({
      ...current,
      members: current.members.filter((item) => item.id !== memberId),
      teams: current.teams.map((team) =>
        team.lead === member.name ? { ...team, lead: '待设置' } : team,
      ),
    }))

    appendOperationRecord('删除', `成员 / ${member.name}`, '已从当前工作区移除成员。')
    setResourceNotice({
      tone: 'success',
      message: `成员“${member.name}”已删除。`,
    })
    setResourceDeleteTarget(null)
    if (memberEditor?.memberId === memberId) {
      setMemberEditor(null)
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

  const handleSaveEdit = () => {
    if (!editModal) {
      return
    }

    const nextOwner = membersById[editModal.draft.ownerId]

    if (editModal.mode === 'create') {
      const newTask: Task = {
        id: createClientId('task'),
        ...editModal.draft,
        teamId: nextOwner?.teamId ?? workspace.members[0]?.teamId ?? '',
        color: priorityPalette[editModal.draft.priority].solid,
        updatedAt: formatTimeLabel(),
      }

      setWorkspace((current) => ({
        ...current,
        tasks: editModal.insertAtStart ? [newTask, ...current.tasks] : [...current.tasks, newTask],
      }))

      appendOperationRecord(
        '新增',
        `项目 / ${editModal.draft.title}`,
        editModal.operationDetail ?? `已将项目排期分配给 ${nextOwner?.name ?? '当前负责人'}。`,
      )

      setSelectedTaskId(newTask.id)
      setEditModal(null)
      return
    }

    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === editModal.taskId
          ? {
              ...task,
              ...editModal.draft,
              teamId: nextOwner?.teamId ?? task.teamId,
              color: priorityPalette[editModal.draft.priority].solid,
              updatedAt: formatTimeLabel(),
            }
          : task,
      ),
    }))

    appendOperationRecord('修改', `项目 / ${editModal.draft.title}`, '已通过弹窗保存项目详情。')
    setEditModal(null)
  }

  const handleDeleteTask = () => {
    if (!deleteTargetId) {
      return
    }

    const deletingTask = workspace.tasks.find((task) => task.id === deleteTargetId)
    const remainingTasks = workspace.tasks.filter((task) => task.id !== deleteTargetId)

    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== deleteTargetId),
    }))

    if (selectedTaskId === deleteTargetId) {
      setSelectedTaskId(remainingTasks[0]?.id ?? '')
    }

    appendOperationRecord(
      '删除',
      deletingTask ? `项目 / ${deletingTask.title}` : '项目 / 未知项目',
      deletingTask ? `已删除项目“${deletingTask.title}”。` : '已从当前工作区删除项目。',
    )
    setDeleteTargetId(null)
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
      setIsResourceModalOpen(true)
      return
    }

    const suggestedStartDate = addCalendarDays(visibleMonthStart, 2)
    createTaskFromMemberAndRange(fallbackMember.id, suggestedStartDate, 5, {
      openEditor: true,
      insertAtStart: true,
    })
  }

  const exportWorkspace = () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'human-gantt-workspace.json'
    link.click()
    URL.revokeObjectURL(url)

    appendOperationRecord('导出', '工作区 JSON', '已导出当前本地工作区数据。')
  }

  const navItems: NavSection[] = ['总览', '资源排期', '项目进度', '团队协作', '记录中心']

  return (
    <div className="dashboard-shell">
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
              onClick={() =>
                item === '记录中心' ? openRecordsCenter('更新记录') : setActiveNav(item)
              }
            >
              <span className="nav-dot"></span>
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
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
                  更新 {workspace.updateRecords.length}
                </span>
                <span className="summary-tag blue-tag">
                  操作 {workspace.operationRecords.length}
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
                        onChange={(event) => setRecordView(event.target.value as RecordView)}
                      >
                        <option value="更新记录">更新记录</option>
                        <option value="操作记录">操作记录</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="records-table-wrap">
                  {recordView === '更新记录' ? (
                    <table className="records-table">
                      <thead>
                        <tr>
                          <th>版本号</th>
                          <th>更新时间</th>
                          <th>新增功能</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workspace.updateRecords.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="records-empty-cell">
                              还没有版本更新记录。
                            </td>
                          </tr>
                        ) : (
                          workspace.updateRecords.map((record) => (
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
                    <table className="records-table">
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
                        {workspace.operationRecords.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="records-empty-cell">
                              还没有操作记录。
                            </td>
                          </tr>
                        ) : (
                          workspace.operationRecords.map((record) => (
                            <tr key={record.id}>
                              <td>{record.actor}</td>
                              <td>{record.time}</td>
                              <td>
                                <span className="record-action-chip">{record.action}</span>
                              </td>
                              <td>{record.target}</td>
                              <td>{record.detail}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </article>
            </section>
          </>
        ) : (
          <>
            {isOverviewPage ? (
              <>
                <header className="topbar">
                  <div className="topbar-main">
                    <p className="caps">总览看板</p>
                    <h2>团队资源与项目总览</h2>
                  </div>

                  <div className="topbar-actions">
                    <label className="search-box" aria-label="搜索项目、成员或团队">
                      <input
                        value={searchValue}
                        onChange={(event) => setSearchValue(event.target.value)}
                        placeholder="搜索项目、成员、团队"
                      />
                    </label>

                    <select
                      className="toolbar-select"
                      value={teamFilter}
                      onChange={(event) => setTeamFilter(event.target.value)}
                    >
                      <option value="全部团队">全部团队</option>
                      {workspace.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>

                    <button className="ghost-button" onClick={openResourceModal}>
                      组织管理
                    </button>
                    <button className="ghost-button" onClick={handleCreateTask}>
                      新增项目
                    </button>
                    <button className="ghost-button" onClick={exportWorkspace}>
                      导出 JSON
                    </button>
                  </div>
                </header>

                <section className="summary-grid">
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
                  <article className="summary-card compact-card highlight-card">
                    <div className="summary-row">
                      <p>平均进度 / 负载</p>
                      <span className="summary-tag purple-tag">双指标</span>
                    </div>
                    <div className="dual-stats">
                      <div>
                        <strong>{averageProgress}%</strong>
                        <span>项目进度</span>
                      </div>
                      <div>
                        <strong>{averageUtilization}%</strong>
                        <span>资源占用</span>
                      </div>
                    </div>
                    <div className="mini-progress-stack">
                      <label>
                        进度
                        <div className="mini-progress-bar">
                          <span style={{ width: `${averageProgress}%` }}></span>
                        </div>
                      </label>
                      <label>
                        负载
                        <div className="mini-progress-bar load-bar">
                          <span style={{ width: `${averageUtilization}%` }}></span>
                        </div>
                      </label>
                    </div>
                  </article>
                </section>

                <section className="content-grid">
                  <div className="gantt-card overview-card">
                    <div className="card-header">
                      <div>
                        <p className="caps">总览列表</p>
                        <h3>项目清单与筛选结果</h3>
                        <p className="timeline-copy">
                          将搜索、筛选、组织管理和导出放在总览中，先看清全局，再进入资源排期专注处理时间线。
                        </p>
                      </div>
                    </div>

                    <div className="project-table overview-table">
                      <div className="table-head">
                        <span>项目</span>
                        <span>负责人</span>
                        <span>状态</span>
                        <span>优先级</span>
                        <span>里程碑</span>
                      </div>
                      {overviewTasks.length === 0 ? (
                        <div className="table-empty">没有找到符合筛选条件的项目。</div>
                      ) : (
                        overviewTasks.map((task) => {
                          const priorityMeta = priorityPalette[task.priority]
                          const ownerName = membersById[task.ownerId]?.name ?? '-'
                          return (
                            <button
                              key={task.id}
                              className={task.id === selectedTaskId ? 'table-row is-selected' : 'table-row'}
                              onClick={() => handleSelectTask(task.id)}
                              onContextMenu={(event) => openContextMenu(event, task.id)}
                            >
                              <span className="table-cell" title={task.title} data-tooltip={task.title}>
                                <span className="truncate-text">{task.title}</span>
                              </span>
                              <span
                                className="table-cell table-cell-center"
                                title={ownerName}
                                data-tooltip={ownerName}
                              >
                                <span className="truncate-text">{ownerName}</span>
                              </span>
                              <span className="table-cell table-cell-center">
                                <span>{task.status}</span>
                              </span>
                              <span className="table-cell table-cell-center">
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
                                className="table-cell"
                                title={task.milestone}
                                data-tooltip={task.milestone}
                              >
                                <span className="truncate-text">{task.milestone}</span>
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="side-column">
                    <article className="detail-card">
                      <div className="card-header">
                        <div>
                          <p className="caps">项目摘要</p>
                          <h3>{selectedTask?.title ?? '未选择项目'}</h3>
                        </div>
                        {selectedTask ? (
                          <span className={`status-chip status-${selectedTask.status}`}>
                            {selectedTask.status}
                          </span>
                        ) : null}
                      </div>

                      {selectedTask ? (
                        <>
                          <div className="metric-grid">
                            <div>
                              <span>所属团队</span>
                              <strong>{teamsById[selectedTask.teamId]?.name}</strong>
                            </div>
                            <div>
                              <span>负责人</span>
                              <strong>{membersById[selectedTask.ownerId]?.name}</strong>
                            </div>
                            <div>
                              <span>优先级</span>
                              <strong>{selectedTask.priority}</strong>
                            </div>
                            <div>
                              <span>最近更新</span>
                              <strong>{selectedTask.updatedAt}</strong>
                            </div>
                          </div>
                          <p className="detail-copy">{selectedTask.summary}</p>
                          <div className="progress-track">
                            <span
                              style={{
                                width: `${selectedTask.progress}%`,
                                background: priorityPalette[selectedTask.priority].solid,
                              }}
                            ></span>
                          </div>
                          <div className="summary-actions">
                            <button className="ghost-button" onClick={() => openEditModal(selectedTask.id)}>
                              编辑项目
                            </button>
                            <button
                              className="danger-button"
                              onClick={() => openDeleteConfirm(selectedTask.id)}
                            >
                              删除项目
                            </button>
                            <button
                              className="activity-launcher"
                              onClick={() => openRecordsCenter('操作记录')}
                            >
                              <span className="activity-launcher-copy">
                                <strong>进入记录中心</strong>
                                <small>查看更新记录与操作记录</small>
                              </span>
                              <span className="activity-launcher-count">
                                {workspace.updateRecords.length + workspace.operationRecords.length}
                              </span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="detail-copy">请选择一个项目查看摘要。</p>
                      )}
                    </article>
                  </div>
                </section>
              </>
            ) : (
              <section className="resource-focus-layout">
                <div className="gantt-card gantt-card-focus">
                  <div className="card-header">
                    <div>
                      <p className="caps">资源排期</p>
                      <h3>{visibleMonthLabel} 甘特图排期</h3>
                      <p className="timeline-copy">
                        资源排期页只保留时间线和排期交互；点选中间日期卡可快速定位到指定年月日，并自动展示对应月份的甘特区间。
                      </p>
                    </div>
                  </div>

                  <div className="timeline-toolbar">
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

                    <div className="month-navigator">
                      <button className="ghost-button" onClick={() => shiftMonth(-1)}>
                        上月
                      </button>
                      <div className="month-navigator-anchor" ref={dateJumpRef}>
                        <button
                          type="button"
                          className={isDateJumpOpen ? 'month-chip month-chip-button is-open' : 'month-chip month-chip-button'}
                          aria-expanded={isDateJumpOpen}
                          aria-haspopup="dialog"
                          onClick={() => {
                            setPendingDateValue(formatDateInputValue(focusedDate))
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
                                className="icon-button date-jump-close"
                                onClick={() => setIsDateJumpOpen(false)}
                              >
                                关闭
                              </button>
                            </div>

                            <label className="date-jump-field">
                              <span>选择年月日</span>
                              <input
                                type="date"
                                value={pendingDateValue}
                                onChange={(event) => setPendingDateValue(event.target.value)}
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
                                onClick={() => jumpToDate(startOfMonth(visibleMonthStart))}
                              >
                                月初
                              </button>
                              <button
                                type="button"
                                className="pill"
                                onClick={() => jumpToDate(addCalendarMonthsKeepingDay(focusedDate, 1))}
                              >
                                下个月
                              </button>
                            </div>

                            <div className="date-jump-footer">
                              <p>
                                会自动把时间线定位到 {formatShortDateLabel(pendingJumpDate)}，并高亮当天列。
                              </p>
                              <button
                                type="button"
                                className="primary-button"
                                onClick={() => jumpToDate(pendingJumpDate)}
                              >
                                查看排期
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <button className="ghost-button" onClick={() => shiftMonth(1)}>
                        下月
                      </button>
                      {!isCurrentMonthView ? (
                        <button className="icon-button" onClick={() => jumpToDate(BASE_DATE)}>
                          回到本月
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="timeline-scroll" ref={timelineScrollRef}>
                    <div className="timeline-sheet" style={timelineStyle}>
                      <div className="timeline-head">
                        <div className="name-column">成员 / 项目</div>
                        <div className="date-grid">
                          {timelineDays.map((day) => (
                            <span
                              key={day.key}
                              data-day-key={day.key}
                              className={[
                                'date-cell',
                                day.isFocused ? 'is-focused' : '',
                                day.isWeekend ? 'is-weekend' : '',
                                day.isToday ? 'is-today' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              <strong>{day.dayLabel}</strong>
                              <small>{day.weekdayLabel}</small>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="timeline-body">
                        {memberRows.map((row) => {
                          const hasDragPreview = dragSelection?.memberId === row.member.id
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
                          const rowLaneCount = row.tasks.length + (hasDragPreview ? 1 : 0)

                          return (
                            <div key={row.member.id} className="person-row">
                              <div className="person-meta">
                                <div className="avatar">{row.member.avatar}</div>
                                <div>
                                  <strong>{row.member.name}</strong>
                                  <p>
                                    {row.member.role} · 剩余 {row.freeHours} 小时
                                  </p>
                                </div>
                                <span className="workload-tag">占用 {row.utilization}%</span>
                              </div>

                              <div
                                className={hasDragPreview ? 'bars-column is-selecting' : 'bars-column'}
                                style={{
                                  minHeight: `${Math.max(70, rowLaneCount * 40 + 20)}px`,
                                }}
                                onMouseDown={(event) => handleTimelineMouseDown(row.member.id, event)}
                              >
                                {row.tasks.length === 0 ? (
                                  <div className="empty-row">当前月份暂无项目，可直接拖拽创建</div>
                                ) : null}

                                {hasDragPreview ? (
                                  <div
                                    className="selection-preview"
                                    style={{
                                      left: previewLeft,
                                      width: previewWidth,
                                      top: `${row.tasks.length * 40 + 10}px`,
                                    }}
                                  >
                                    <span>{previewLabel}</span>
                                  </div>
                                ) : null}

                                {row.tasks.map((task, index) => {
                                  const taskStartDate = getTaskStartDate(task)
                                  const taskEndDate = getTaskEndDate(task)
                                  const clippedStart =
                                    taskStartDate < visibleMonthStart ? visibleMonthStart : taskStartDate
                                  const clippedEnd =
                                    taskEndDate > visibleMonthEnd ? visibleMonthEnd : taskEndDate
                                  const leftOffset = diffCalendarDays(clippedStart, visibleMonthStart)
                                  const visibleDuration =
                                    diffCalendarDays(clippedEnd, clippedStart) + 1
                                  const left = `${(leftOffset / timelineDays.length) * 100}%`
                                  const width = `${Math.max(4, (visibleDuration / timelineDays.length) * 100)}%`
                                  const owner = membersById[task.ownerId]
                                  const priorityMeta = priorityPalette[task.priority]

                                  return (
                                    <button
                                      key={task.id}
                                      className={task.id === selectedTaskId ? 'task-bar is-selected' : 'task-bar'}
                                      style={{
                                        left,
                                        width,
                                        top: `${index * 40 + 10}px`,
                                        background: priorityMeta.solid,
                                      }}
                                      onClick={() => handleSelectTask(task.id)}
                                      onContextMenu={(event) => openContextMenu(event, task.id)}
                                      aria-label={`${task.title}，负责人 ${owner?.name ?? '未分配'}，优先级 ${task.priority}，进度 ${task.progress}%`}
                                    >
                                      <span>{task.title}</span>
                                      <div className="task-badges">
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
                                        <small>{task.progress}%</small>
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
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

      {isResourceModalOpen ? (
        <div className="overlay" onClick={closeResourceModal}>
          <div className="dialog resource-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div>
                <p className="caps">组织管理</p>
                <h3>团队与成员</h3>
              </div>
              <button className="icon-button" onClick={closeResourceModal}>
                关闭
              </button>
            </div>

            <p className="detail-copy resource-copy">
              团队是资源分组单元，成员是具体执行人。删除操作会先校验是否仍有关联成员或项目，避免误删造成排期失真。
            </p>

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

            <div className="resource-grid">
              <section className="resource-section">
                <div className="resource-section-head">
                  <div>
                    <p className="caps">团队管理</p>
                    <h4>新增、编辑与删除团队</h4>
                  </div>
                  <button className="ghost-button" onClick={openTeamCreate}>
                    新增团队
                  </button>
                </div>

                {teamEditor ? (
                  <div className="resource-form-card">
                    <div className="resource-form-head">
                      <strong>{teamEditor.mode === 'create' ? '新建团队' : '编辑团队'}</strong>
                      <button className="icon-button" onClick={() => setTeamEditor(null)}>
                        取消
                      </button>
                    </div>

                    <div className="editor-grid resource-editor-grid">
                      <label>
                        团队名称
                        <input
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
                      <button className="primary-button" onClick={saveTeamEditor}>
                        保存团队
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="resource-list">
                  {workspace.teams.length === 0 ? (
                    <div className="resource-empty">还没有团队，先创建一个团队再安排成员与项目。</div>
                  ) : (
                    workspace.teams.map((team) => (
                      <article key={team.id} className="resource-row">
                        <div className="resource-row-main">
                          <span
                            className="resource-swatch"
                            style={{ background: team.color }}
                            aria-hidden="true"
                          ></span>
                          <div>
                            <strong>{team.name}</strong>
                            <p>
                              负责人 {team.lead} · {teamStats[team.id]?.memberCount ?? 0} 名成员 ·{' '}
                              {teamStats[team.id]?.taskCount ?? 0} 个项目
                            </p>
                          </div>
                        </div>
                        <div className="resource-row-actions">
                          <button className="icon-button" onClick={() => openTeamEdit(team.id)}>
                            编辑
                          </button>
                          <button
                            className="danger-button"
                            onClick={() => openTeamDeleteConfirm(team.id)}
                          >
                            删除
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="resource-section">
                <div className="resource-section-head">
                  <div>
                    <p className="caps">成员管理</p>
                    <h4>维护成员档案与归属团队</h4>
                  </div>
                  <button className="ghost-button" onClick={openMemberCreate}>
                    新增成员
                  </button>
                </div>

                {memberEditor ? (
                  <div className="resource-form-card">
                    <div className="resource-form-head">
                      <strong>{memberEditor.mode === 'create' ? '新建成员' : '编辑成员'}</strong>
                      <button className="icon-button" onClick={() => setMemberEditor(null)}>
                        取消
                      </button>
                    </div>

                    <div className="editor-grid resource-editor-grid">
                      <label>
                        成员姓名
                        <input
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

                      <label>
                        周容量（小时）
                        <input
                          type="number"
                          min={1}
                          value={memberEditor.draft.capacityHours}
                          onChange={(event) =>
                            setMemberEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    draft: {
                                      ...current.draft,
                                      capacityHours: Number(event.target.value),
                                    },
                                  }
                                : current,
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="dialog-actions">
                      <button className="primary-button" onClick={saveMemberEditor}>
                        保存成员
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="resource-list">
                  {workspace.members.length === 0 ? (
                    <div className="resource-empty">还没有成员，创建成员后才能在时间线上分配项目。</div>
                  ) : (
                    workspace.members.map((member) => (
                      <article key={member.id} className="resource-row">
                        <div className="resource-row-main">
                          <span className="resource-avatar">{member.avatar}</span>
                          <div>
                            <strong>{member.name}</strong>
                            <p>
                              {member.role} · {teamsById[member.teamId]?.name ?? '未分配团队'} · 周容量{' '}
                              {member.capacityHours} 小时 · 负责 {memberTaskCounts[member.id] ?? 0} 个项目
                            </p>
                          </div>
                        </div>
                        <div className="resource-row-actions">
                          <button className="icon-button" onClick={() => openMemberEdit(member.id)}>
                            编辑
                          </button>
                          <button
                            className="danger-button"
                            onClick={() => openMemberDeleteConfirm(member.id)}
                          >
                            删除
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
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
              <button className="icon-button" onClick={() => setEditModal(null)}>
                关闭
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

      {deleteTargetId ? (
        <div className="overlay" onClick={() => setDeleteTargetId(null)}>
          <div className="dialog confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div>
                <p className="caps">删除确认</p>
                <h3>确定删除这个项目吗？</h3>
              </div>
            </div>
            <p className="detail-copy">
              删除后会立即从当前工作区移除，并写入操作记录。这一步不可撤销。
            </p>
            <div className="dialog-actions">
              <button className="ghost-button" onClick={() => setDeleteTargetId(null)}>
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
