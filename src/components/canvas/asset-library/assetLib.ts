import type {
  AssetItem,
  CanvasCardData,
  ProjectAssetItem,
  ProjectAssetKind,
  ProjectAssetMember,
  WorkflowDoc,
  WorkflowEdge,
  WorkflowNode,
} from '@/pages/Canvas/canvasTypes'

/** HTML5 拖放: 画布卡片 -> 资产面板 */
export const ASSET_DND_CARD = 'application/x-canvas-card'
/** HTML5 拖放: 资产面板 -> 画布 */
export const ASSET_DND_ENTRY = 'application/x-asset-entry'

/** 图片类(含视频/图片组), 用于按页签过滤 */
export function isImageAssetKind(kind: ProjectAssetKind): boolean {
  return kind === 'image' || kind === 'video' || kind === 'group'
}

/** 面板统一消费的资产条目(全局/项目两种来源归一化后的形态) */
export interface AssetLibEntry {
  key: string
  scope: 'global' | 'project'
  kind: ProjectAssetKind
  displayName: string
  /** 封面地址: 图片组=首图, 单图/视频=自身, 工作流=首图或空串 */
  coverUrl: string
  members: ProjectAssetMember[]
  folderId: string
  width?: number
  height?: number
  createdAt?: number
  /** 全局库记录 id(项目库为 undefined) */
  globalId?: string
  /** 项目库记录 id */
  projectId?: string
  /** 工作流条目: 节点链路结构 */
  workflow?: WorkflowDoc
  /** 内置预设: 不入库/不可重命名删除, 始终置顶 */
  preset?: boolean
  /** 预设封面上的一句话说明 */
  tagline?: string
  /** 悬停时展示的站内价格文案(预设专用) */
  priceText?: string
}

export function entryDisplayName(name?: string | null): string {
  const v = (name ?? '').trim()
  return v || '未命名资产'
}

/** 从全局库 images 字段安全提取工作流结构 */
export function extractWorkflowPayload(raw: AssetItem['images']): WorkflowDoc | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const wf = (raw as { workflow?: unknown }).workflow
  if (!wf || typeof wf !== 'object') return null
  const nodes = Array.isArray((wf as WorkflowDoc).nodes) ? (wf as WorkflowDoc).nodes : null
  const edges = Array.isArray((wf as WorkflowDoc).edges) ? (wf as WorkflowDoc).edges : null
  if (!nodes) return null
  return { version: 1, nodes, edges: edges ?? [] }
}

/** 项目资产转统一条目 */
export function projectEntryOf(item: ProjectAssetItem): AssetLibEntry {
  if (item.kind === 'workflow') {
    return {
      key: `project-${item.id}`,
      scope: 'project',
      kind: 'workflow',
      displayName: entryDisplayName(item.name),
      coverUrl: item.coverUrl || item.url || '',
      members: [],
      folderId: item.folderId ?? '',
      createdAt: item.createdAt,
      projectId: item.id,
      workflow: item.workflow,
    }
  }
  const members =
    item.kind === 'group' && Array.isArray(item.images) && item.images.length
      ? item.images
      : [{ url: item.url, name: item.name, width: item.width, height: item.height }]
  return {
    key: `project-${item.id}`,
    scope: 'project',
    kind: item.kind,
    displayName: entryDisplayName(item.name),
    coverUrl: item.kind === 'group' ? members[0]?.url ?? '' : item.url,
    members,
    folderId: item.folderId ?? '',
    width: item.width,
    height: item.height,
    createdAt: item.createdAt,
    projectId: item.id,
  }
}

/** 全局资产转统一条目 */
export function globalEntryOf(rec: AssetItem): AssetLibEntry {
  const mediaType = rec.media_type ?? ''
  if (mediaType === 'workflow') {
    const workflow = extractWorkflowPayload(rec.images)
    return {
      key: `global-${rec.id}`,
      scope: 'global',
      kind: 'workflow',
      displayName: entryDisplayName(rec.name),
      coverUrl: rec.url || '',
      members: [],
      folderId: rec.folder ?? '',
      createdAt: rec.created ? new Date(rec.created).getTime() : undefined,
      globalId: rec.id,
      workflow: workflow ?? undefined,
    }
  }
  const rawMembers = Array.isArray(rec.images) ? (rec.images as ProjectAssetMember[]) : []
  const isGroup = mediaType === 'group'
  const members =
    isGroup && rawMembers.length
      ? rawMembers.map(m => ({ url: String(m.url ?? ''), name: m.name, width: m.width, height: m.height }))
      : [{ url: rec.url, name: rec.name, width: rec.width, height: rec.height }]
  const kind: ProjectAssetKind = isGroup ? 'group' : mediaType === 'video' ? 'video' : 'image'
  return {
    key: `global-${rec.id}`,
    scope: 'global',
    kind,
    displayName: entryDisplayName(rec.name),
    coverUrl: isGroup ? members[0]?.url ?? '' : rec.url,
    members,
    folderId: rec.folder ?? '',
    width: rec.width,
    height: rec.height,
    createdAt: rec.created ? new Date(rec.created).getTime() : undefined,
    globalId: rec.id,
  }
}

/** 从画布卡片提取当前主图媒体; 无图卡(提示词等)返回 null */
export function cardMediaOf(card: CanvasCardData | undefined): { url: string; isVideo: boolean } | null {
  if (!card) return null
  const idx = card.activeResultIndex ?? 0
  const active = card.results?.[idx]
  if (active && active.url) return { url: active.url, isVideo: !!active.isVideo || card.kind === 'video' }
  if (card.url) return { url: card.url, isVideo: card.kind === 'video' }
  return null
}

/** 资产拖回画布时序列化到 dataTransfer 的载荷 */
export interface AssetDndPayload {
  scope: 'global' | 'project'
  kind: ProjectAssetKind
  name: string
  url: string
  members: ProjectAssetMember[]
  /** 工作流拖回时的节点链路结构 */
  workflow?: WorkflowDoc
  /** 内置预设标记: 仅用于落点轻提示, 不参与入库/重建逻辑 */
  preset?: boolean
}

export function writeAssetDnd(entry: AssetLibEntry): string {
  const payload: AssetDndPayload = {
    scope: entry.scope,
    kind: entry.kind,
    name: entry.displayName,
    url: entry.coverUrl,
    members: entry.members,
    ...(entry.workflow ? { workflow: entry.workflow } : {}),
    ...(entry.preset ? { preset: true } : {}),
  }
  return JSON.stringify(payload)
}

export function parseAssetDnd(raw: string): AssetDndPayload | null {
  try {
    const obj = JSON.parse(raw) as Partial<AssetDndPayload>
    // 工作流条目没有封面时 url 可能为空串, 以 kind 为准放行
    if (obj.kind === 'workflow') {
      const nodes = Array.isArray(obj.workflow?.nodes) ? (obj.workflow?.nodes as WorkflowNode[]) : null
      const edges = Array.isArray(obj.workflow?.edges) ? (obj.workflow?.edges as WorkflowEdge[]) : []
      if (!nodes) return null
      return {
        scope: obj.scope === 'project' ? 'project' : 'global',
        kind: 'workflow',
        name: typeof obj.name === 'string' ? obj.name : '工作流',
        url: typeof obj.url === 'string' ? obj.url : '',
        members: [],
        workflow: { version: 1, nodes, edges },
        ...(obj.preset === true ? { preset: true } : {}),
      }
    }
    if (typeof obj.url === 'string' && obj.url) {
      return {
        scope: obj.scope === 'project' ? 'project' : 'global',
        kind: obj.kind === 'video' || obj.kind === 'group' ? obj.kind : 'image',
        name: typeof obj.name === 'string' ? obj.name : '资产',
        url: obj.url,
        members: Array.isArray(obj.members) ? obj.members.filter(m => m && typeof m.url === 'string') : [],
      }
    }
  } catch {
    /* 非本面板拖放 */
  }
  return null
}
