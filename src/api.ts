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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `请求失败：${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function fetchBootstrap() {
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
  return request<{ item: ApiMember }>('/members', {
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
  const response = await fetch(`${API_BASE_URL}/export/workspace`)
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `导出失败：${response.status}`)
  }

  return response.blob()
}
