export type ApiTeam = {
  id: string
  name: string
  lead: string
  color: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ApiMember = {
  id: string
  name: string
  role: string
  teamId: string
  avatar: string
  avatarImageUrl: string | null
  capacityHours: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ApiTask = {
  id: string
  title: string
  ownerId: string
  teamId: string
  progress: number
  status: string
  priority: string
  startDate: string
  endDate: string
  duration: number
  sortOrder: number
  color: string
  summary: string
  milestone: string
  createdAt: string
  updatedAt: string
}

export type ApiReleaseRecord = {
  id: string
  version: string
  updatedAt: string
  features: string[]
}

export type ApiOperationRecord = {
  id: string
  actor: string
  action: '新增' | '修改' | '删除' | '导出' | '查看' | '历史迁移'
  target: string
  detail: string
  time: string
}

export type ApiAccountRole = 'admin' | 'team_lead' | 'member'

export type ApiAccount = {
  id: string
  username: string
  role: ApiAccountRole
  memberId: string | null
  memberName: string | null
  displayName: string
  avatar: string
  avatarImageUrl: string | null
  permissions: {
    canManageAll: boolean
    canManageOrganization: boolean
  }
}

export type PaginatedResponse<T> = {
  items: T[]
  page: number
  size: number
  total: number
  totalPages: number
}

export type BootstrapResponse = {
  teams: ApiTeam[]
  members: ApiMember[]
  tasks: ApiTask[]
  summary: {
    teamCount: number
    memberCount: number
    taskCount: number
    releaseRecordCount: number
    operationRecordCount: number
    generatedAt: string
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const AUTH_TOKEN_STORAGE_KEY = 'resource-planning-auth-token'

let authToken =
  typeof window === 'undefined' ? '' : window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? ''

export function setAuthToken(token: string) {
  authToken = token
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  }
}

export function getAuthToken() {
  return authToken
}

export function clearAuthToken() {
  authToken = ''
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // All browser-side data access goes through one small helper so we only pay
  // the fetch/error-handling cost once and can keep the page modules focused on
  // business logic instead of repeated transport boilerplate.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    if (response.status === 401) {
      clearAuthToken()
    }
    throw new Error(payload?.error ?? `请求失败：${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function login(payload: { username: string; password: string }) {
  const response = await request<{ token: string; account: ApiAccount }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setAuthToken(response.token)
  return response
}

export async function fetchCurrentAccount() {
  return request<{ account: ApiAccount }>('/auth/me')
}

export async function logout() {
  try {
    await request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    })
  } finally {
    clearAuthToken()
  }
}

export async function updateCurrentProfile(payload: {
  displayName: string
  avatar: string
  avatarImage?: string | null
  newPassword?: string
}) {
  return request<{ account: ApiAccount }>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function fetchBootstrap() {
  // Bootstrap intentionally returns the minimum needed for the first screen:
  // teams, members, tasks and summary counts. Release/operation records are
  // paginated separately to avoid inflating the initial payload.
  return request<BootstrapResponse>('/bootstrap')
}

export async function fetchReleaseRecords(page: number, size: number) {
  return request<PaginatedResponse<ApiReleaseRecord>>(`/release-records?page=${page}&size=${size}`)
}

export async function fetchOperationRecords(page: number, size: number) {
  return request<PaginatedResponse<ApiOperationRecord>>(`/operation-records?page=${page}&size=${size}`)
}

export async function createViewOperationRecord(payload: {
  target: string
  detail: string
  actor?: string
}) {
  return request<{ item: ApiOperationRecord }>('/operation-records/view', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createTeam(payload: { name: string; lead: string; color: string }) {
  return request<{ item: ApiTeam }>('/teams', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateTeam(
  teamId: string,
  payload: Partial<Pick<ApiTeam, 'name' | 'lead' | 'color'>>,
) {
  return request<{ item: ApiTeam }>(`/teams/${teamId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteTeam(teamId: string) {
  return request<{ success: boolean }>(`/teams/${teamId}`, {
    method: 'DELETE',
  })
}

export async function createMember(payload: {
  name: string
  role: string
  teamId: string
  avatar: string
  capacityHours: number
}) {
  return request<{ item: ApiMember; accountUsername: string; defaultPassword: string }>('/members', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateMember(
  memberId: string,
  payload: Partial<{
    name: string
    role: string
    teamId: string
    avatar: string
    capacityHours: number
    sortOrder: number
  }>,
) {
  return request<{ item: ApiMember }>(`/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteMember(memberId: string) {
  return request<{ success: boolean }>(`/members/${memberId}`, {
    method: 'DELETE',
  })
}

export async function createTask(payload: {
  title: string
  ownerId: string
  progress: number
  status: string
  priority: string
  startDate: string
  duration: number
  summary: string
  milestone: string
  sortOrder?: number
}) {
  return request<{ item: ApiTask }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateTask(
  taskId: string,
  payload: Partial<{
    title: string
    ownerId: string
    progress: number
    status: string
    priority: string
    startDate: string
    duration: number
    summary: string
    milestone: string
    sortOrder: number
    operationDetail: string
  }>,
) {
  return request<{ item: ApiTask }>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteTask(taskId: string) {
  return request<{ success: boolean }>(`/tasks/${taskId}`, {
    method: 'DELETE',
  })
}

export async function exportWorkspaceSnapshot() {
  const response = await fetch(`${API_BASE_URL}/export/workspace`, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    if (response.status === 401) {
      clearAuthToken()
    }
    throw new Error(payload?.error ?? `导出失败：${response.status}`)
  }

  return response.blob()
}
