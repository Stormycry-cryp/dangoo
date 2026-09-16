// 工作流资产的序列化 / 重建:
// 保存时从选中卡片抽出白名单字段、归一化相对坐标、仅保留集合内连线;
// 重建时生成全新卡片 id、还原相对位置/提示词/生成参数/直接挂载的参考图/连线。
import type {
  CanvasCardData,
  CanvasConnection,
  CardJobStatus,
  CardKind,
  WorkflowDoc,
  WorkflowEdge,
  WorkflowNode,
} from '@/pages/Canvas/canvasTypes'
import { uid } from '@/pages/Canvas/canvasUtils'

/** 入选集合构建结果 */
export interface WorkflowSelection {
  /** 入选卡片(原对象引用, 顺序稳定) */
  cards: CanvasCardData[]
  /** 因与生成节点无连线关系被剔除的纯结果卡数量 */
  skippedUnrelated: number
}

/** 纯结果类卡(图片/视频): 只有与入选生成节点一跳相连才保留 */
const RESULT_KINDS: ReadonlySet<CardKind> = new Set<CardKind>(['result', 'video'])

/**
 * 计算工作流入选集合:
 * - 必须含至少 1 个 generate 节点
 * - 全部 generate 选中卡入选
 * - 结果图卡/视频卡: 与任一 generate 节点沿连线任意方向一跳相连才入选
 * - 其它节点类卡(prompt/agent/loop/merge/polish/layer/replicate)只要在选中集合内就保留
 * - 与生成节点无连线关系的纯结果图卡剔除并计数
 */
export function buildWorkflowSelection(
  selected: CanvasCardData[],
  connections: CanvasConnection[],
): WorkflowSelection | null {
  const byId = new Map(selected.map(c => [c.id, c]))
  const generators = selected.filter(c => c.kind === 'generate')
  if (!generators.length) return null
  const genIds = new Set(generators.map(c => c.id))

  // 与任一 generate 节点一跳相连(任意方向)的选中卡 id
  const adjacent = new Set<string>()
  connections.forEach(conn => {
    if (genIds.has(conn.fromId) && byId.has(conn.toId)) adjacent.add(conn.toId)
    if (genIds.has(conn.toId) && byId.has(conn.fromId)) adjacent.add(conn.fromId)
  })

  const cards = selected.filter(c => {
    if (c.kind === 'generate') return true
    if (RESULT_KINDS.has(c.kind)) return adjacent.has(c.id)
    return true
  })
  const skippedUnrelated = selected.length - cards.length
  return { cards, skippedUnrelated: Math.max(0, skippedUnrelated) }
}

/** 工作流节点白名单字段拷贝; 不落运行结果/任务态/费用缓存 */
export function serializeNode(card: CanvasCardData, offsetX: number, offsetY: number): WorkflowNode {
  const base: WorkflowNode = {
    id: card.id, // 临时占位, 仅用于工作流内 edges 配对, 重建时换新 id
    kind: card.kind,
    x: Math.round(card.x - offsetX),
    y: Math.round(card.y - offsetY),
    w: card.w,
    h: card.h,
  }
  if (card.prompt) base.prompt = card.prompt
  if (card.title) base.title = card.title
  if (card.refUrls && card.refUrls.length) base.refUrls = [...card.refUrls]
  if (card.genParams) base.genParams = { ...card.genParams }
  // 卡片自身 url:
  // - generate 节点: 有运行结果时 url 是结果图(不保存, 重建为未运行模板);
  //   未运行时 url 是用户直接挂载的参考图(图片位), 必须随模板带走;
  // - result/video 卡的 url 是卡面媒体(参考图来源), 按永久链接保存。
  const hasRunResults = Array.isArray(card.results) && card.results.some(r => r.itemStatus === 'success' && r.url)
  if (card.url && !(card.kind === 'generate' && hasRunResults)) base.url = card.url
  // 各专用节点的可序列化状态(状态内若有任务态字段, 重建时统一重置)
  if (card.mergeState) base.mergeState = { ...card.mergeState }
  if (card.polishState) base.polishState = { ...card.polishState }
  if (card.agentState) base.agentState = structuredishCopy(card.agentState)
  if (card.loopState) base.loopState = { ...card.loopState }
  if (card.layerState) base.layerState = structuredishCopy(card.layerState)
  if (card.repState) base.repState = structuredishCopy(card.repState)
  // 语音克隆节点: 已上传音频(永久链接)/参数/文本随模板带走, 任务态在 freshNodeState 统一重置
  if (card.ttsState) base.ttsState = structuredishCopy(card.ttsState)
  // 动作迁移节点: 参考图/动作视频(永久链接)与全部参数随模板带走
  if (card.motionState) base.motionState = structuredishCopy(card.motionState)
  // 视频高清修复节点: 待修复视频(永久链接)与模型/分辨率参数随模板带走
  if (card.vsrState) base.vsrState = structuredishCopy(card.vsrState)
  // 摄影机节点: 配置随模板带走(纯配置, 无任务态)
  if (card.cameraState) base.cameraState = structuredishCopy(card.cameraState)
  // 生成节点: 摄影机绑定与快照随模板带走, 重建时 cameraNodeId 按新 id 重映射
  if (card.kind === 'generate' && (card.cameraNodeId || card.cameraSnapshot)) {
    if (card.cameraNodeId) base.cameraNodeId = card.cameraNodeId
    if (card.cameraSnapshot) base.cameraSnapshot = structuredishCopy(card.cameraSnapshot)
  }
  return base
}

/** JSON 安全的深拷贝(这些 state 只含可序列化数据) */
function structuredishCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 清洗专用节点状态里的任务态/结果字段, 保证重建为未运行模板 */
export function freshNodeState(node: WorkflowNode): WorkflowNode {
  const out: WorkflowNode = { ...node }
  if (out.mergeState) out.mergeState = { ...out.mergeState, running: false, error: null }
  if (out.polishState) out.polishState = { ...out.polishState, jobStatus: 'idle', result: '', errorMsg: null }
  if (out.agentState) {
    out.agentState = { ...out.agentState, output: '', jobStatus: 'idle', errorMsg: null }
  }
  if (out.layerState) {
    out.layerState = {
      ...out.layerState,
      stage: out.layerState.sourceUrl ? 'ready' : 'idle',
      layers: (out.layerState.layers ?? []).map(l => ({
        ...l,
        genStatus: 'idle' as CardJobStatus,
        errorMsg: null,
      })),
    }
  }
  if (out.repState) {
    out.repState = {
      ...out.repState,
      stage: out.repState.frontPrompt || out.repState.backPrompt ? 'ready' : 'idle',
      jobStatus: { front: 'idle', back: 'idle' },
      frontResultUrl: null,
      backResultUrl: null,
    }
  }
  // 语音克隆: 清掉运行结果与任务态(保留音频永久链接、情绪参数与文本)
  if (out.ttsState) {
    out.ttsState = {
      ...out.ttsState,
      jobStatus: 'idle',
      resultUrl: undefined,
      resultName: undefined,
      errorMsg: null,
      remoteTaskId: undefined,
    }
  }
  // 动作迁移: 清掉运行结果与任务态(保留参考图/动作视频永久链接与全部参数)
  if (out.motionState) {
    out.motionState = {
      ...out.motionState,
      jobStatus: 'idle',
      resultUrl: undefined,
      resultName: undefined,
      errorMsg: null,
      remoteTaskId: undefined,
    }
  }
  // 视频高清修复: 清掉运行结果与任务态(保留待修复视频永久链接与模型/分辨率参数)
  if (out.vsrState) {
    out.vsrState = {
      ...out.vsrState,
      jobStatus: 'idle',
      resultUrl: undefined,
      resultName: undefined,
      errorMsg: null,
      remoteTaskId: undefined,
    }
  }
  return out
}

/** 把选中卡片集合序列化为工作流文档; 坐标按包围盒左上角归一化 */
export function serializeWorkflow(cards: CanvasCardData[], connections: CanvasConnection[]): WorkflowDoc {
  const minX = Math.min(...cards.map(c => c.x))
  const minY = Math.min(...cards.map(c => c.y))
  const nodes = cards.map(c => serializeNode(c, minX, minY))
  const ids = new Set(cards.map(c => c.id))
  const edges: WorkflowEdge[] = connections
    .filter(conn => ids.has(conn.fromId) && ids.has(conn.toId))
    .map(conn => ({ fromId: conn.fromId, toId: conn.toId, ...(conn.toSlot ? { toSlot: conn.toSlot } : {}) }))
  return { version: 1, nodes, edges }
}

function isHttpMediaUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/api/files/')
}

/** 深度遍历收集媒体 URL(覆盖 url/refUrls 与 layerState/repState 等专用节点状态内的参考图) */
function collectMediaUrlsDeep(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    if (isHttpMediaUrl(value)) out.add(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach(v => collectMediaUrlsDeep(v, out))
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(v => collectMediaUrlsDeep(v, out))
  }
}

/** 收集工作流内需要保证永久链接的媒体 URL(直接挂载的参考图/卡面媒体/专用节点上传图) */
export function collectWorkflowMediaUrls(doc: WorkflowDoc): string[] {
  const out = new Set<string>()
  doc.nodes.forEach(n => collectMediaUrlsDeep(n, out))
  return [...out]
}

/** 深度替换工作流内命中永久化映射表的链接(临时链接转永久后整体回写) */
export function replaceWorkflowUrlsDeep(doc: WorkflowDoc, mapping: Map<string, string>): WorkflowDoc {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return mapping.get(value) ?? value
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v)
      return out
    }
    return value
  }
  return walk(doc) as WorkflowDoc
}

/** 工作流封面: 第一张可用图片 URL(跳过视频链接的简易扩展名判断由调用方兜底) */
export function workflowCoverOf(doc: WorkflowDoc | undefined): string {
  if (!doc) return ''
  for (const n of doc.nodes) {
    if (n.url && !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(n.url)) return n.url
  }
  for (const n of doc.nodes) {
    if (n.url) return n.url
  }
  return ''
}

/** 重建工作流到画布坐标; 返回全新卡片与连线(新 id), 不写入任何状态 */
export interface RebuiltWorkflow {
  cards: CanvasCardData[]
  connections: CanvasConnection[]
  /** 需要探测可访问性的参考图输入位(节点 id -> url 列表), 加载失败置空 */
  probeRefs: Array<{ cardId: string; kind: CardKind; urls: string[]; primary: boolean }>
}

export function rebuildWorkflow(doc: WorkflowDoc, originX: number, originY: number): RebuiltWorkflow {
  const idMap = new Map<string, string>()
  const probeRefs: RebuiltWorkflow['probeRefs'] = []
  const cards: CanvasCardData[] = doc.nodes.map(rawNode => {
    const node = freshNodeState(rawNode)
    const newId = uid()
    idMap.set(node.id, newId)
    const card: CanvasCardData = {
      id: newId,
      kind: node.kind,
      x: Math.round(originX + node.x),
      y: Math.round(originY + node.y),
      w: node.w,
      h: node.h,
    }
    if (node.prompt) card.prompt = node.prompt
    if (node.title) card.title = node.title
    if (node.refUrls && node.refUrls.length) card.refUrls = [...node.refUrls]
    if (node.genParams) card.genParams = { ...node.genParams }
    if (node.mergeState) card.mergeState = node.mergeState
    if (node.polishState) card.polishState = node.polishState
    if (node.agentState) card.agentState = node.agentState
    if (node.loopState) card.loopState = node.loopState
    if (node.layerState) card.layerState = node.layerState
    if (node.repState) card.repState = node.repState
    if (node.ttsState) card.ttsState = node.ttsState
    if (node.motionState) card.motionState = node.motionState
    if (node.vsrState) card.vsrState = node.vsrState
    if (node.cameraState) card.cameraState = node.cameraState
    if (node.kind === 'generate') {
      if (node.cameraSnapshot) card.cameraSnapshot = node.cameraSnapshot
      // cameraNodeId 先保留旧占位 id, map 完成后统一按 idMap 重映射
      if (node.cameraNodeId) card.cameraNodeId = node.cameraNodeId
    }
    if (node.url) {
      card.url = node.url
      // result/video 卡是成品卡(参考图来源); generate 节点的直接挂载图是它的参考图输入位
      if (node.kind === 'result' || node.kind === 'video') {
        card.jobStatus = 'success'
      } else if (node.kind === 'generate' && card.h < 400) {
        // 与画布里带图生成节点一致: 图片位展开为高卡
        card.h = 520
      }
    }
    // 重建后全部节点未运行: 收集需要探活的参考图输入位(语音克隆/动作迁移节点的槽位不走图片探活)
    const probeUrls: string[] = []
    if (node.kind === 'tts' || node.kind === 'motion' || node.kind === 'vsr') return card
    if (node.url) probeUrls.push(node.url)
    ;(node.refUrls ?? []).forEach(u => probeUrls.push(u))
    if (probeUrls.length) {
      probeRefs.push({ cardId: newId, kind: node.kind, urls: Array.from(new Set(probeUrls)), primary: !!node.url })
    }
    return card
  })
  // 生成节点的摄影机绑定按新 id 重映射:
  // 指向的摄影机也在本工作流内 → 指向新摄影机; 指向外部旧 id → 置空并保留快照走兜底
  cards.forEach(card => {
    if (card.kind !== 'generate' || !card.cameraNodeId) return
    const mapped = idMap.get(card.cameraNodeId as string)
    if (mapped) {
      card.cameraNodeId = mapped
      const cam = cards.find(c => c.id === mapped)
      if (cam && card.cameraSnapshot) card.cameraSnapshot = { ...card.cameraSnapshot, name: cam.title ?? card.cameraSnapshot.name }
    } else {
      card.cameraNodeId = undefined
    }
  })
  const conns: CanvasConnection[] = doc.edges
    .filter(e => idMap.has(e.fromId) && idMap.has(e.toId))
    .map(e => ({
      id: uid(),
      fromId: idMap.get(e.fromId) as string,
      toId: idMap.get(e.toId) as string,
      ...(e.toSlot ? { toSlot: e.toSlot } : {}),
    }))
  return { cards, connections: conns, probeRefs }
}

/** 用 HEAD/GET 轻量探测图片是否可访问(跨域失败也算失效, 交由 UI onerror 二次兜底) */
export function probeImageAccessible(url: string): Promise<boolean> {
  return new Promise(resolve => {
    if (!url) {
      resolve(false)
      return
    }
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      resolve(ok)
    }
    const img = new Image()
    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    img.src = url
    // 超时兜底: 8s 未完成视为失效
    setTimeout(() => finish(false), 8000)
  })
}
