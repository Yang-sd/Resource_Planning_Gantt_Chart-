import { useEffect, useState } from 'react'
import './App.css'

type ProjectStatus = 'active' | 'risk' | 'done'
type EntitySelection =
  | { type: 'user'; id: string }
  | { type: 'project'; id: string }

type Attachment = {
  id: string
  label: string
  kind: string
}

type Comment = {
  id: string
  author: string
  body: string
  time: string
}

type Project = {
  id: string
  title: string
  startAt: string
  endAt: string
  status: ProjectStatus
  progress: number
  color: string
  priority: 'P1' | 'P2' | 'P3'
  milestone?: string
  note: string
  links: string[]
  attachments: Attachment[]
  comments: Comment[]
  version: string
}

type Person = {
  id: string
  name: string
  role: string
  location: string
  capacity: number
  availability: string
  summary: string
  docSummary: string
  comments: Comment[]
  projects: Project[]
  expanded: boolean
}

type Team = {
  id: string
  name: string
  timezone: string
  focus: string
  summary: string
  expanded: boolean
  people: Person[]
}

const DAY = 24 * 60 * 60 * 1000

const seedTeams: Team[] = [
  {
    id: 'team-strategy',
    name: 'Strategy Studio',
    timezone: 'Asia/Shanghai',
    focus: '产品方案与交付节奏',
    summary: '承接客户侧 PRD、方案评审与资源编排，强调跨项目透明度。',
    expanded: true,
    people: [
      {
        id: 'user-alice',
        name: 'Alice',
        role: 'PM / 资源统筹',
        location: 'Shanghai',
        capacity: 82,
        availability: '本周 86 小时可用，2 个冲突待处理',
        summary: '负责产品排期、跨团队同步与里程碑风险把控。',
        docSummary:
          '需要把 Alpha 的交互定稿和 Beta 的客户复盘材料放在同一抽屉里，便于移动端快速查看。',
        comments: [
          {
            id: 'c-u-1',
            author: 'Mina',
            body: '@Alice 请同步 Beta 项目的上线素材和风控清单。',
            time: '今天 10:12',
          },
          {
            id: 'c-u-2',
            author: 'Jun',
            body: '五一前的评审窗口已经锁定，建议将可视化联调前置 2 天。',
            time: '昨天 18:40',
          },
        ],
        expanded: true,
        projects: [
          {
            id: 'project-alpha',
            title: 'Alpha 改版冲刺',
            startAt: '2026-04-18',
            endAt: '2026-05-04',
            status: 'active',
            progress: 68,
            color: '#0f766e',
            priority: 'P1',
            milestone: '设计评审 4/28',
            note:
              '聚焦桌面三栏工作台和移动浏览器轻编辑路径，目标是把排期、文档、评论沉淀在同一视图。',
            links: ['PRD 文档', '交互草图', '发布清单'],
            attachments: [
              { id: 'a-1', label: 'alpha-prd-v4.pdf', kind: 'PDF' },
              { id: 'a-2', label: 'mobile-flow.png', kind: 'Image' },
            ],
            comments: [
              {
                id: 'c-1',
                author: 'Fei',
                body: '移动端保留筛选、查看、轻编辑和附件上传，复杂依赖线放桌面端。',
                time: '今天 09:28',
              },
              {
                id: 'c-2',
                author: 'Alice',
                body: '需要在条形条 hover 时给出可视化容量提示。',
                time: '昨天 20:02',
              },
            ],
            version: 'ver_18',
          },
          {
            id: 'project-beta',
            title: 'Beta 客户交付',
            startAt: '2026-04-24',
            endAt: '2026-05-12',
            status: 'risk',
            progress: 42,
            color: '#f97316',
            priority: 'P1',
            milestone: '客户彩排 5/10',
            note:
              '客户要求周报导出和移动浏览器快速批注，当前风险来自评审延期与多项目并行。',
            links: ['客户纪要', '上线甘特截图', '导出规范'],
            attachments: [
              { id: 'a-3', label: 'handoff-checklist.xlsx', kind: 'Sheet' },
            ],
            comments: [
              {
                id: 'c-3',
                author: 'Nora',
                body: '请把导出模板切成汇报版和执行版两个层级。',
                time: '今天 11:05',
              },
            ],
            version: 'ver_07',
          },
        ],
      },
      {
        id: 'user-bob',
        name: 'Bob',
        role: 'Design Lead',
        location: 'Hangzhou',
        capacity: 46,
        availability: '本周 30 小时可用，设计产能稳定',
        summary: '负责视觉系统、交互稿和桌面端视觉规范。',
        docSummary:
          '优先沉淀信息层级和视觉语义，确保从桌面到移动的重排仍然保持一致感。',
        comments: [
          {
            id: 'c-u-3',
            author: 'Alice',
            body: '请输出一版更适合深色导出的图表配色。',
            time: '今天 08:10',
          },
        ],
        expanded: false,
        projects: [
          {
            id: 'project-gamma',
            title: 'Gamma 视觉升级',
            startAt: '2026-04-20',
            endAt: '2026-04-29',
            status: 'active',
            progress: 77,
            color: '#2563eb',
            priority: 'P2',
            milestone: '视觉冻结 4/27',
            note: '输出组件变量、图表色盘和移动浏览器的抽屉转场规范。',
            links: ['视觉稿', 'tokens', '导出样式'],
            attachments: [
              { id: 'a-4', label: 'theme-tokens.json', kind: 'JSON' },
            ],
            comments: [
              {
                id: 'c-4',
                author: 'Bob',
                body: '抽屉采用温暖中性色底，避免典型紫色 SaaS 风格。',
                time: '昨天 13:30',
              },
            ],
            version: 'ver_11',
          },
        ],
      },
    ],
  },
  {
    id: 'team-engineering',
    name: 'Delivery Engine',
    timezone: 'Asia/Shanghai',
    focus: '前端交互与导出稳定性',
    summary: '聚焦高性能渲染、时间线同步滚动、导出与权限校验。',
    expanded: true,
    people: [
      {
        id: 'user-cindy',
        name: 'Cindy',
        role: 'Frontend Engineer',
        location: 'Shenzhen',
        capacity: 71,
        availability: '本周 52 小时可用，虚拟化已排入计划',
        summary: '负责时间线渲染、键盘语义与移动端触控轻编辑。',
        docSummary:
          'TreeGrid 采用语义化结构，Timeline 保持同步滚动并预留未来 5000+ 行虚拟化空间。',
        comments: [
          {
            id: 'c-u-4',
            author: 'Mina',
            body: '导出功能先做 CSV 和打印，再补 PNG 服务端渲染。',
            time: '昨天 16:24',
          },
        ],
        expanded: true,
        projects: [
          {
            id: 'project-delta',
            title: 'Delta Timeline 引擎',
            startAt: '2026-04-16',
            endAt: '2026-05-08',
            status: 'active',
            progress: 54,
            color: '#0891b2',
            priority: 'P1',
            milestone: '双栏滚动联调 4/30',
            note: '实现 Today 线、项目条、容量标签和响应式时间桶。',
            links: ['技术方案', '性能基线'],
            attachments: [
              { id: 'a-5', label: 'perf-budget.md', kind: 'Doc' },
            ],
            comments: [
              {
                id: 'c-5',
                author: 'Cindy',
                body: '需要为移动端抽屉保留全屏日期微调入口。',
                time: '今天 14:32',
              },
            ],
            version: 'ver_09',
          },
          {
            id: 'project-epsilon',
            title: 'Epsilon 导出与分享',
            startAt: '2026-05-01',
            endAt: '2026-05-14',
            status: 'done',
            progress: 100,
            color: '#7c3aed',
            priority: 'P3',
            milestone: '导出模版上线',
            note: '导出执行版与汇报版模板，支持打印视图和 CSV 下载。',
            links: ['导出模板'],
            attachments: [
              { id: 'a-6', label: 'report-template.pdf', kind: 'PDF' },
            ],
            comments: [
              {
                id: 'c-6',
                author: 'Leo',
                body: '汇报版已经交付给运营团队使用。',
                time: '4/18 17:20',
              },
            ],
            version: 'ver_12',
          },
        ],
      },
    ],
  },
]

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function diffDays(startAt: string, endAt: string) {
  const start = new Date(`${startAt}T00:00:00`).getTime()
  const end = new Date(`${endAt}T00:00:00`).getTime()
  return Math.max(1, Math.round((end - start) / DAY) + 1)
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${dateString}T00:00:00`))
}

function App() {
  const [teams, setTeams] = useState(seedTeams)
  const [windowDays, setWindowDays] = useState(30)
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all')
  const [selected, setSelected] = useState<EntitySelection>({
    type: 'project',
    id: 'project-alpha',
  })
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 980)
  const [anchorDate] = useState('2026-04-20')

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 980)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const visibleDates = Array.from({ length: windowDays }, (_, index) =>
    addDays(anchorDate, index),
  )

  const updateProject = (projectId: string, action: (project: Project) => Project) => {
    setTeams((currentTeams) =>
      currentTeams.map((team) => ({
        ...team,
        people: team.people.map((person) => ({
          ...person,
          projects: person.projects.map((project) =>
            project.id === projectId ? action(project) : project,
          ),
        })),
      })),
    )
  }

  const toggleNode = (type: 'team' | 'person', id: string) => {
    setTeams((currentTeams) =>
      currentTeams.map((team) => {
        if (type === 'team' && team.id === id) {
          return { ...team, expanded: !team.expanded }
        }

        return {
          ...team,
          people: team.people.map((person) =>
            type === 'person' && person.id === id
              ? { ...person, expanded: !person.expanded }
              : person,
          ),
        }
      }),
    )
  }

  const allProjects = teams.flatMap((team) =>
    team.people.flatMap((person) =>
      person.projects.map((project) => ({
        ...project,
        personName: person.name,
        teamName: team.name,
      })),
    ),
  )

  const selectedUser = teams
    .flatMap((team) => team.people)
    .find((person) => selected.type === 'user' && person.id === selected.id)
  const selectedProject = allProjects.find(
    (project) => selected.type === 'project' && project.id === selected.id,
  )

  const exportProjectsCsv = () => {
    const rows = [
      ['team', 'person', 'project', 'startAt', 'endAt', 'status', 'progress'],
      ...allProjects.map((project) => [
        project.teamName,
        project.personName,
        project.title,
        project.startAt,
        project.endAt,
        project.status,
        String(project.progress),
      ]),
    ]
    const csv = rows.map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'human-gantt-snapshot.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportWorkspaceJson = () => {
    const blob = new Blob([JSON.stringify(teams, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'human-gantt-workspace.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Human Gantt Workbench</p>
          <h1>让团队排期、项目上下文和交付风险在一张工作台里同时可见。</h1>
          <p className="hero-copy">
            基于 PRD 首版实现桌面与移动浏览器双适配的人力甘特图，围绕
            <strong> Team - Person - Project </strong>
            展开，并把文档抽屉、附件、评论和导出做成同一个操作闭环。
          </p>
        </div>
        <div className="hero-stats">
          <article>
            <span>2</span>
            <label>团队</label>
          </article>
          <article>
            <span>4</span>
            <label>活跃成员</label>
          </article>
          <article>
            <span>6</span>
            <label>并行项目</label>
          </article>
        </div>
      </section>

      <section className="toolbar">
        <div className="segmented">
          {[14, 30, 45].map((days) => (
            <button
              key={days}
              className={windowDays === days ? 'is-active' : ''}
              onClick={() => setWindowDays(days)}
            >
              {days} 天
            </button>
          ))}
        </div>
        <div className="segmented">
          {['all', 'active', 'risk', 'done'].map((status) => (
            <button
              key={status}
              className={statusFilter === status ? 'is-active' : ''}
              onClick={() => setStatusFilter(status as 'all' | ProjectStatus)}
            >
              {status === 'all' ? '全部状态' : status}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <button onClick={exportProjectsCsv}>导出 CSV</button>
          <button onClick={exportWorkspaceJson}>导出 JSON</button>
          <button onClick={() => window.print()}>打印 / PDF</button>
        </div>
      </section>

      <section className={`workbench ${isMobile ? 'is-mobile' : ''}`}>
        <aside className="tree-pane">
          <div className="pane-title">
            <div>
              <p className="mini-label">TreeGrid</p>
              <h2>资源层级</h2>
            </div>
            <span>{anchorDate} 起</span>
          </div>

          <div className="treegrid" role="treegrid" aria-label="Team person project treegrid">
            {teams.map((team) => (
              <div key={team.id} className="tree-section">
                <button
                  className="team-row"
                  onClick={() => toggleNode('team', team.id)}
                >
                  <span>{team.expanded ? '▾' : '▸'}</span>
                  <div>
                    <strong>{team.name}</strong>
                    <p>
                      {team.focus} · {team.timezone}
                    </p>
                  </div>
                </button>

                {team.expanded && (
                  <div className="team-content">
                    <p className="team-summary">{team.summary}</p>
                    {team.people.map((person) => (
                      <div key={person.id} className="person-block">
                        <button
                          className="person-row"
                          onClick={() => toggleNode('person', person.id)}
                        >
                          <span>{person.expanded ? '▾' : '▸'}</span>
                          <div>
                            <strong>{person.name}</strong>
                            <p>
                              {person.role} · 容量 {person.capacity}%
                            </p>
                          </div>
                          <em>{person.projects.length} 项</em>
                        </button>

                        <button
                          className="person-card"
                          onClick={() => setSelected({ type: 'user', id: person.id })}
                        >
                          <span>{person.availability}</span>
                          <strong>{person.summary}</strong>
                        </button>

                        {person.expanded &&
                          person.projects
                            .filter(
                              (project) =>
                                statusFilter === 'all' || project.status === statusFilter,
                            )
                            .map((project) => (
                              <button
                                key={project.id}
                                className={`project-row ${
                                  selected.type === 'project' && selected.id === project.id
                                    ? 'is-selected'
                                    : ''
                                }`}
                                onClick={() =>
                                  setSelected({ type: 'project', id: project.id })
                                }
                              >
                                <span
                                  className="color-dot"
                                  style={{ background: project.color }}
                                ></span>
                                <div>
                                  <strong>{project.title}</strong>
                                  <p>
                                    {project.startAt} - {project.endAt}
                                  </p>
                                </div>
                                <em>{project.priority}</em>
                              </button>
                            ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="timeline-pane">
          <div className="pane-title">
            <div>
              <p className="mini-label">Timeline</p>
              <h2>项目时间轴</h2>
            </div>
            <span>Today: {anchorDate}</span>
          </div>

          <div className="timeline-header">
            {visibleDates.map((date) => (
              <div key={date} className="day-cell">
                <strong>{formatDate(date)}</strong>
              </div>
            ))}
          </div>

          <div className="timeline-grid">
            <div
              className="today-line"
              style={{ left: `${(visibleDates.indexOf(anchorDate) / visibleDates.length) * 100}%` }}
            ></div>

            {teams.map((team) =>
              team.people.map((person) => (
                <div key={person.id} className="timeline-row">
                  <div className="row-meta">
                    <strong>{person.name}</strong>
                    <span>{person.role}</span>
                  </div>
                  <div className="row-bars">
                    {person.projects
                      .filter(
                        (project) =>
                          statusFilter === 'all' || project.status === statusFilter,
                      )
                      .map((project) => {
                        const startOffset = diffDays(anchorDate, project.startAt) - 1
                        const length = diffDays(project.startAt, project.endAt)
                        const left = (startOffset / windowDays) * 100
                        const width = (length / windowDays) * 100

                        return (
                          <button
                            key={project.id}
                            className={`timeline-bar status-${project.status}`}
                            style={{
                              left: `${Math.max(0, left)}%`,
                              width: `${Math.max(6, width)}%`,
                              background: project.color,
                            }}
                            onClick={() => setSelected({ type: 'project', id: project.id })}
                          >
                            <span>{project.title}</span>
                            <small>{project.progress}%</small>
                          </button>
                        )
                      })}
                  </div>
                </div>
              )),
            )}
          </div>
        </section>

        <aside className={`drawer ${isMobile ? 'mobile-sheet' : ''}`}>
          {selectedUser && (
            <>
              <div className="pane-title">
                <div>
                  <p className="mini-label">Person Drawer</p>
                  <h2>{selectedUser.name}</h2>
                </div>
                <span>{selectedUser.role}</span>
              </div>
              <p className="drawer-summary">{selectedUser.docSummary}</p>
              <div className="drawer-card">
                <h3>工作负载</h3>
                <p>{selectedUser.availability}</p>
                <div className="meter">
                  <span style={{ width: `${selectedUser.capacity}%` }}></span>
                </div>
              </div>
              <div className="drawer-card">
                <h3>关联项目</h3>
                {selectedUser.projects.map((project) => (
                  <button
                    key={project.id}
                    className="drawer-list-item"
                    onClick={() => setSelected({ type: 'project', id: project.id })}
                  >
                    <span>{project.title}</span>
                    <strong>{project.progress}%</strong>
                  </button>
                ))}
              </div>
              <div className="drawer-card">
                <h3>评论流</h3>
                {selectedUser.comments.map((comment) => (
                  <article key={comment.id} className="comment">
                    <strong>{comment.author}</strong>
                    <p>{comment.body}</p>
                    <span>{comment.time}</span>
                  </article>
                ))}
              </div>
            </>
          )}

          {selectedProject && (
            <>
              <div className="pane-title">
                <div>
                  <p className="mini-label">Project Drawer</p>
                  <h2>{selectedProject.title}</h2>
                </div>
                <span>{selectedProject.priority}</span>
              </div>
              <p className="drawer-summary">{selectedProject.note}</p>

              <div className="drawer-card">
                <h3>排期操作</h3>
                <div className="schedule-grid">
                  <label>
                    开始
                    <strong>{selectedProject.startAt}</strong>
                  </label>
                  <label>
                    结束
                    <strong>{selectedProject.endAt}</strong>
                  </label>
                </div>
                <div className="action-row">
                  <button
                    onClick={() =>
                      updateProject(selectedProject.id, (project) => ({
                        ...project,
                        startAt: addDays(project.startAt, -1),
                        endAt: addDays(project.endAt, -1),
                      }))
                    }
                  >
                    提前 1 天
                  </button>
                  <button
                    onClick={() =>
                      updateProject(selectedProject.id, (project) => ({
                        ...project,
                        startAt: addDays(project.startAt, 1),
                        endAt: addDays(project.endAt, 1),
                      }))
                    }
                  >
                    顺延 1 天
                  </button>
                  <button
                    onClick={() =>
                      updateProject(selectedProject.id, (project) => ({
                        ...project,
                        endAt: addDays(project.endAt, 2),
                      }))
                    }
                  >
                    延长 2 天
                  </button>
                </div>
              </div>

              <div className="drawer-card">
                <h3>关键上下文</h3>
                <div className="tag-row">
                  <span className={`status-pill status-${selectedProject.status}`}>
                    {selectedProject.status}
                  </span>
                  <span className="status-pill neutral">{selectedProject.version}</span>
                  {selectedProject.milestone ? (
                    <span className="status-pill neutral">{selectedProject.milestone}</span>
                  ) : null}
                </div>
                <ul className="link-list">
                  {selectedProject.links.map((link) => (
                    <li key={link}>{link}</li>
                  ))}
                </ul>
              </div>

              <div className="drawer-card">
                <h3>附件与文档</h3>
                {selectedProject.attachments.map((attachment) => (
                  <div key={attachment.id} className="drawer-list-item">
                    <span>{attachment.label}</span>
                    <strong>{attachment.kind}</strong>
                  </div>
                ))}
              </div>

              <div className="drawer-card">
                <h3>评论流</h3>
                {selectedProject.comments.map((comment) => (
                  <article key={comment.id} className="comment">
                    <strong>{comment.author}</strong>
                    <p>{comment.body}</p>
                    <span>{comment.time}</span>
                  </article>
                ))}
              </div>
            </>
          )}
        </aside>
      </section>
    </div>
  )
}

export default App
