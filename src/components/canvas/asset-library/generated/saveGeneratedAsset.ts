import { toast } from 'sonner'
import { getPocketBaseUrl } from '@/lib/pb'
import { getAuthHeaders } from '@/lib/auth'
import { getLocalAccount } from '@/lib/localAuth'
import { normalizeUrlKey, type GeneratedAsset } from './generatedAssetsTypes'

const ASSETS_API = `${getPocketBaseUrl()}/api/assets`
const ASSETS_PAGE_SIZE = 200

/**
 * 「全部产物」里新存入素材库后广播: 画布现有的全局素材列表会收到并重新拉取,
 * 保证切回「素材库」分区立刻能看到新存的素材(复用同一套 assets 接口)。
 */
export const ASSETS_CHANGED_EVENT = 'dangoo:assets-changed'

export function notifyAssetsChanged() {
  try {
    window.dispatchEvent(new Event(ASSETS_CHANGED_EVENT))
  } catch {
    /* 非浏览器环境忽略 */
  }
}

/**
 * 拉全量已有素材的 url 归一化 key 集合, 用于按 url 去重保存。
 * 未登录返回 null(调用方负责引导登录)。
 */
async function fetchExistingUrlKeys(): Promise<Set<string> | null> {
  if (!getLocalAccount()) return null
  const keys = new Set<string>()
  let page = 1
  for (;;) {
    const res = await fetch(`${ASSETS_API}?page=${page}&perPage=${ASSETS_PAGE_SIZE}`, {
      headers: { ...getAuthHeaders() },
    })
    if (!res.ok) throw new Error('list assets failed')
    const data = (await res.json()) as {
      items?: Array<{ url?: string; images?: Array<{ url?: string }> }>
      totalPages?: number
    }
    const items = Array.isArray(data.items) ? data.items : []
    for (const item of items) {
      if (typeof item.url === 'string' && item.url) keys.add(normalizeUrlKey(item.url))
      if (Array.isArray(item.images)) {
        for (const member of item.images) {
          if (typeof member?.url === 'string' && member.url) keys.add(normalizeUrlKey(member.url))
        }
      }
    }
    const hasMore =
      typeof data.totalPages === 'number' ? page < data.totalPages : items.length >= ASSETS_PAGE_SIZE
    if (!hasMore) break
    page += 1
  }
  return keys
}

export interface SaveAssetsResult {
  saved: number
  existed: number
  failed: number
  /** 412 登录过期, 调用方弹登录 */
  loginRequired: boolean
}

async function postAsset(asset: GeneratedAsset): Promise<boolean> {
  const name = (asset.prompt || `${asset.kind === 'video' ? '生成视频' : asset.kind === 'audio' ? '语音作品' : '生成图片'}`).slice(0, 120)
  const res = await fetch(ASSETS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      rh_user_id: getLocalAccount()?.email ?? '',
      name: name || '生成作品',
      url: asset.url,
      media_type: asset.kind,
      source: 'generated',
      folder: '',
    }),
  })
  if (res.status === 412) {
    const err = new Error('login_required') as Error & { status?: number }
    err.status = 412
    throw err
  }
  return res.ok
}

/**
 * 单个 / 批量把产物存入全局素材库(与画布里存素材库同一接口、同一套字段约定),
 * 按 url 与库里已有素材去重。
 */
export async function saveGeneratedAssets(assets: GeneratedAsset[]): Promise<SaveAssetsResult> {
  const result: SaveAssetsResult = { saved: 0, existed: 0, failed: 0, loginRequired: false }
  if (!assets.length) return result
  if (!getLocalAccount()) {
    result.loginRequired = true
    return result
  }
  let existing: Set<string> | null
  try {
    existing = await fetchExistingUrlKeys()
  } catch {
    toast.error('读取素材库失败, 请稍后重试')
    return result
  }
  if (!existing) {
    result.loginRequired = true
    return result
  }
  const pending = assets.filter(a => {
    const key = normalizeUrlKey(a.url)
    if (existing!.has(key)) {
      result.existed += 1
      return false
    }
    existing!.add(key)
    return true
  })
  // 4 并发提交, 单个失败不阻塞其余
  const CHUNK = 4
  for (let i = 0; i < pending.length; i += CHUNK) {
    const slice = pending.slice(i, i + CHUNK)
    const outcomes = await Promise.all(
      slice.map(async asset => {
        try {
          return await postAsset(asset)
        } catch (err) {
          if ((err as { status?: number })?.status === 412) throw err
          return false
        }
      }),
    )
    for (const ok of outcomes) {
      if (ok) result.saved += 1
      else result.failed += 1
    }
  }
  if (result.saved > 0) notifyAssetsChanged()
  return result
}

/** 保存结果的统一 toast 话术 */
export function toastSaveResult(result: SaveAssetsResult) {
  if (result.loginRequired) {
    toast.message('请先登录后再存入素材库')
    return
  }
  if (result.saved > 0) {
    const extra: string[] = []
    if (result.existed > 0) extra.push(`${result.existed} 项已存在`)
    if (result.failed > 0) extra.push(`${result.failed} 项保存失败`)
    toast.success(extra.length ? `已存入素材库 · ${extra.join(' · ')}` : '已存入素材库')
  } else if (result.existed > 0 && result.failed === 0) {
    toast.message(result.existed === 1 ? '这项素材已在素材库里' : `${result.existed} 项都已在素材库里`)
  } else {
    toast.error('存入素材库失败, 请稍后重试')
  }
}
