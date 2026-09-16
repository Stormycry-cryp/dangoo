import type { GenLogEntry } from '@/pages/Canvas/canvasTypes'

/** 「全部产物」聚合后的单个产物项 */
export interface GeneratedAsset {
  /** canvasId + url 稳定哈希 */
  id: string
  /** 原始存储 url(相对裸路径 / 永久 CDN 链接), 渲染统一过 mediaSrc */
  url: string
  kind: 'image' | 'video' | 'audio'
  canvasId: string
  canvasTitle: string
  /** 节点类型中文标签 */
  nodeType: string
  model: string
  prompt: string
  /** 毫秒时间戳 */
  createdAt: number
  /** 运行耗时毫秒 */
  runMs: number
  /** 费用文案, 如 ¥0.10 */
  costText?: string
}

export type AssetKindFilter = 'all' | GeneratedAsset['kind']
export type AssetSortOrder = 'newest' | 'oldest'

/** 分页拉取画布列表的后端返回(只取本页用到的字段) */
export interface CanvasesPage {
  items?: Array<{
    id: string
    title?: string
    updated?: string
    is_deleted?: boolean
    canvas_data?: { logs?: GenLogEntry[] } | null
  }>
  totalPages?: number
}

/** djb2 字符串哈希: 产物 id 只要求同账号内稳定唯一, 无需加密强度 */
export function hashString(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return `g${(hash >>> 0).toString(36)}`
}

/**
 * 去重/查重用的归一化 key:
 * - 本应用文件存储的链接剥到裸路径, 兼容「裸路径 / 当前环境绝对链 / 旧部署前缀」三种形态
 * - CDN/外链按 host+path 归一(去查询串与尾斜杠), 同一产物不同签名视图视为一条
 */
export function normalizeUrlKey(rawUrl: string): string {
  const url = rawUrl.trim()
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url)
      return `${u.host}${u.pathname}`.replace(/\/$/, '')
    } catch {
      return url
    }
  }
  return url
    .replace(/^\/(?:app-preview|p)\/app-[0-9a-f]{32}\/__pb(?=\/)/, '')
    .replace(/\/$/, '')
}

const KIND_EXT: Record<GeneratedAsset['kind'], string> = {
  image: '.jpg',
  video: '.mp4',
  audio: '.mp3',
}

/** 从 url 推断扩展名, 取不到按产物类型补默认后缀 */
export function assetExtension(asset: GeneratedAsset): string {
  const match = /\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(asset.url.split('?')[0] || '')
  if (match && match[1].length <= 5) return `.${match[1].toLowerCase()}`
  return KIND_EXT[asset.kind]
}

export function formatAssetTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function assetStamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

export function formatRunDuration(runMs: number): string {
  if (!runMs || runMs <= 0) return ''
  if (runMs < 1000) return `${runMs} 毫秒`
  const seconds = runMs / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`
}

export const KIND_LABEL: Record<GeneratedAsset['kind'], string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
}
