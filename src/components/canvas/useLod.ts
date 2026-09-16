import { useEffect, useState } from 'react'
import { mediaSrc } from '@/lib/media'

/**
 * 画布图片三级 LOD:
 * - scale < 0.45  → 96px 宽小图(内存 dataURL, 绘制便宜)
 * - 0.45~0.9     → 320px 宽中图
 * - >= 0.9       → 原图
 * 缩略图在首次用到时异步生成并全局缓存, 生成完成前回退原图。
 * 同时返回原图自然尺寸(nw/nh), 供调用方固定布局尺寸——换档只换分辨率, 不变卡片大小。
 *
 * 缓存有 LRU 上限(第三批内存优化): 500 节点大图布下缩略图 dataURL 本身可达上百 MB,
 * 超条目数或字节预算后淘汰最久未用、且当前没有组件订阅的条目; 视口外卡片卸载即退订,
 * 滚远了的缩略图会被回收, 滚回来重新构建(廉价)。
 */
type LodEntry = { s: string; m: string; nw: number; nh: number; primed?: boolean; touched: number }

// 缓存预算: 最多 240 条完整缩略图 / dataURL 合计约 48MB; primed(只有尺寸) 的条目很轻, 只按条数限
const LOD_MAX_ENTRIES = 240
const LOD_MAX_BYTES = 48 * 1024 * 1024
const PRIMED_MAX_ENTRIES = 800
const dataUrlBytes = (d: string) => (d.startsWith('data:') ? Math.floor(d.length * 0.75) : 0)

const lodCache = new Map<string, LodEntry | 'pending'>()
const building = new Set<string>()
const listeners = new Map<string, Set<() => void>>()
let touchSeq = 0

function notify(url: string) {
  listeners.get(url)?.forEach(fn => fn())
}

function entryBytes(e: LodEntry): number {
  return dataUrlBytes(e.s) + dataUrlBytes(e.m)
}

/** 超出预算时淘汰最久未用条目; 有组件正在订阅的条目不淘汰(避免卸载前闪烁重建) */
function evictIfNeeded() {
  let fullCount = 0
  let primedCount = 0
  let totalBytes = 0
  lodCache.forEach(e => {
    if (e === 'pending') return
    if (e.primed) primedCount += 1
    else {
      fullCount += 1
      totalBytes += entryBytes(e)
    }
  })
  const fullOver = fullCount > LOD_MAX_ENTRIES || totalBytes > LOD_MAX_BYTES
  const primedOver = primedCount > PRIMED_MAX_ENTRIES
  if (!fullOver && !primedOver) return
  const candidates: Array<{ url: string; touched: number; primed: boolean }> = []
  lodCache.forEach((e, url) => {
    if (e === 'pending') return
    if (listeners.has(url) && (listeners.get(url)?.size ?? 0) > 0) return
    candidates.push({ url, touched: e.touched, primed: !!e.primed })
  })
  candidates.sort((a, b) => a.touched - b.touched)
  for (const c of candidates) {
    lodCache.delete(c.url)
    // 删除后重新计数, 回预算线即停
    let fullNow = 0
    let bytesNow = 0
    let primedNow = 0
    lodCache.forEach(x => {
      if (x === 'pending') return
      if (x.primed) primedNow += 1
      else {
        fullNow += 1
        bytesNow += entryBytes(x)
      }
    })
    if (fullNow <= LOD_MAX_ENTRIES && bytesNow <= LOD_MAX_BYTES && primedNow <= PRIMED_MAX_ENTRIES) break
  }
}

/** 预写自然尺寸(本地 objectURL 解码极快), 视图首帧即可定布局, 跳过骨架占位框 */
export function primeLod(url: string, nw: number, nh: number) {
  const exist = lodCache.get(url)
  if (!exist) lodCache.set(url, { s: '', m: '', nw, nh, primed: true, touched: ++touchSeq })
}

/** 读取图片自然尺寸, 失败返回 null */
export function loadImageDims(url: string): Promise<{ nw: number; nh: number } | null> {
  return new Promise(resolve => {
    const im = new Image()
    im.onload = () => resolve({ nw: im.naturalWidth, nh: im.naturalHeight })
    im.onerror = () => resolve(null)
    im.src = url
  })
}

async function buildLod(url: string) {
  if (building.has(url)) return
  const exist = lodCache.get(url)
  // 已完整构建过则跳过; primed(只有尺寸) 的条目继续补建缩略图
  if (exist && exist !== 'pending' && !exist.primed) return
  building.add(url)
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('lod load failed'))
      img.src = url
    })
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const mk = (w: number) => {
      if (!nw || !nh) return ''
      const cvs = document.createElement('canvas')
      cvs.width = Math.min(w, nw)
      cvs.height = Math.max(1, Math.round(cvs.width * (nh / nw)))
      const ctx = cvs.getContext('2d')
      if (!ctx) return ''
      ctx.drawImage(img, 0, 0, cvs.width, cvs.height)
      return cvs.toDataURL('image/jpeg', 0.7)
    }
    lodCache.set(url, { s: mk(96), m: mk(320), nw, nh, touched: ++touchSeq })
    evictIfNeeded()
  } catch {
    // 构建失败(如跨域限制): 标记为原图直出, 不再反复重试; 已有尺寸则保留, 布局不跳
    lodCache.set(url, {
      s: '',
      m: '',
      nw: exist && exist !== 'pending' ? exist.nw : 0,
      nh: exist && exist !== 'pending' ? exist.nh : 0,
      touched: ++touchSeq,
    })
  }
  building.delete(url)
  notify(url)
}

/** 等待单张图的 LOD 构建完成(失败也会返回), 用于换图源前避免布局闪跳 */
export async function ensureLod(url: string) {
  await buildLod(url)
}

/**
 * 后台批量预热 LOD 缩略图(轻量并发)。
 * 第三批改造: 只预热调用方给的近场 url 列表(舞台按当前视口收集), 不再全画布预热——
 * 超大画布全量构建会同时占满解码内存与 dataURL 内存。
 */
export function preloadLod(urls: Array<string | undefined>) {
  const queue = urls.filter((u): u is string => {
    if (!u) return false
    const e = lodCache.get(u)
    if (!e) return true
    return e !== 'pending' && !!e.primed
  })
  if (!queue.length) return
  let i = 0
  const worker = async () => {
    for (;;) {
      const u = queue[i++]
      if (!u) return
      await buildLod(u)
    }
  }
  void Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker))
}

export function useLod(
  rawUrl: string | undefined,
  scale: number,
): { src?: string; nw?: number; nh?: number; fallbacks: string[] } {
  const url = mediaSrc(rawUrl)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!url) return
    if (!lodCache.has(url)) void buildLod(url)
    const fn = () => setTick(t => t + 1)
    let set = listeners.get(url)
    if (!set) {
      set = new Set()
      listeners.set(url, set)
    }
    set.add(fn)
    return () => {
      set.delete(fn)
    }
  }, [url])
  if (!url) return { fallbacks: [] }
  const entry = lodCache.get(url)
  if (entry && entry !== 'pending') {
    // 组件订阅中 = 近期使用, 刷新淘汰顺位(写入 Map 顺序不影响正确性, touched 才是淘汰依据)
    entry.touched = ++touchSeq
  }
  const dims = entry && entry !== 'pending' ? { nw: entry.nw, nh: entry.nh } : {}
  // 原图临时加载失败(放大切回原图时签名链接波动等)时按 320→96 缩略图兜底, 避免直接裂图
  const fallbacks = entry && entry !== 'pending' ? [entry.m, entry.s].filter((d): d is string => !!d && d !== url) : []
  if (!entry || entry === 'pending') return { src: url, ...dims, fallbacks }
  if (scale < 0.45) return { src: entry.s || url, ...dims, fallbacks }
  if (scale < 0.9) return { src: entry.m || url, ...dims, fallbacks }
  return { src: url, ...dims, fallbacks }
}
