import JSZip from 'jszip'
import { toast } from 'sonner'
import { mediaSrc } from '@/lib/media'
import { assetExtension, assetStamp, type GeneratedAsset } from './generatedAssetsTypes'

/** 触发浏览器下载一个 blob */
function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * 单个产物下载: fetch 媒体为 blob 后落盘;
 * 跨域取 blob 失败时回退新窗口打开, 由用户手动保存。
 * 返回 false 表示走了回退分支。
 */
export async function downloadAsset(asset: GeneratedAsset): Promise<boolean> {
  const src = mediaSrc(asset.url)
  if (!src) return false
  const fileName = `${asset.kind}-${assetStamp(asset.createdAt || Date.now())}${assetExtension(asset)}`
  try {
    const res = await fetch(src, { mode: 'cors' })
    if (!res.ok) throw new Error(`http ${res.status}`)
    const blob = await res.blob()
    triggerBlobDownload(blob, fileName)
    return true
  } catch {
    window.open(src, '_blank', 'noopener,noreferrer')
    toast.error('浏览器不允许直接保存这个文件, 已在新标签页打开, 可在页面里手动下载')
    return false
  }
}

/** 复制产物直链到剪贴板 */
export async function copyAssetLink(asset: GeneratedAsset): Promise<void> {
  const src = mediaSrc(asset.url)
  if (!src) {
    toast.error('链接不可用')
    return
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(src)
    } else {
      const ta = document.createElement('textarea')
      ta.value = src
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    toast.success('链接已复制')
  } catch {
    toast.error('复制失败, 请手动复制')
  }
}

/** 文件夹/文件名里不允许的字符统一替换, 防止 zip 路径异常 */
function safeNamePart(raw: string, fallback: string): string {
  const cleaned = (raw || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return cleaned || fallback
}

export interface ZipProgress {
  done: number
  total: number
  failed: number
}

export const ZIP_COUNT_LIMIT = 200
export const ZIP_SIZE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024
const CONCURRENCY = 4

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)}MB`
  return `${Math.round(bytes / 1024)}KB`
}

/**
 * 轻量预估总体积: 对视频/音频发 HEAD 取 content-length(上限 12 个, 超时 4s),
 * 图片按平均 3MB 估算。仅用于超量打包前提示, 不追求精确。
 */
export async function estimateTotalBytes(assets: GeneratedAsset[]): Promise<number> {
  let total = assets.filter(a => a.kind === 'image').length * 3 * 1024 * 1024
  const heavy = assets.filter(a => a.kind !== 'image').slice(0, 12)
  await Promise.all(
    heavy.map(async a => {
      const src = mediaSrc(a.url)
      if (!src) return
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 4000)
      try {
        const res = await fetch(src, { method: 'HEAD', signal: ctrl.signal, mode: 'cors' })
        const len = Number(res.headers.get('content-length') || 0)
        total += Number.isFinite(len) && len > 0 ? len : 40 * 1024 * 1024
      } catch {
        total += 40 * 1024 * 1024
      } finally {
        clearTimeout(timer)
      }
    }),
  )
  return total
}

export interface ZipOptions {
  onProgress?: (p: ZipProgress) => void
  /** 返回 true 表示继续; 用户点取消后返回 false, 已在途请求跑完后停止派新任务 */
  shouldContinue?: () => boolean
}

/**
 * 浏览器内打包 ZIP: 按「项目名/」分子目录, 同目录文件名加序号防重名。
 * 单个文件 fetch 失败跳过并计数, 最终触发浏览器下载, 返回失败数。
 */
export async function downloadAssetsZip(assets: GeneratedAsset[], opts: ZipOptions = {}): Promise<number> {
  const zip = new JSZip()
  const usedNames = new Set<string>()
  let failed = 0
  let done = 0
  const total = assets.length
  opts.onProgress?.({ done, total, failed })

  let cursor = 0
  async function worker() {
    while (cursor < total) {
      if (opts.shouldContinue && !opts.shouldContinue()) return
      const index = cursor
      cursor += 1
      const asset = assets[index]
      const folderName = safeNamePart(asset.canvasTitle, '未命名画布')
      const ext = assetExtension(asset)
      const baseName = safeNamePart(
        `${asset.kind}-${assetStamp(asset.createdAt || Date.now())}`,
        `${asset.kind}-${index + 1}`,
      )
      let fileName = `${baseName}${ext}`
      let path = `${folderName}/${fileName}`
      let suffix = 1
      while (usedNames.has(path)) {
        fileName = `${baseName}-${suffix}${ext}`
        path = `${folderName}/${fileName}`
        suffix += 1
      }
      usedNames.add(path)
      try {
        const src = mediaSrc(asset.url)
        if (!src) throw new Error('no src')
        const res = await fetch(src, { mode: 'cors' })
        if (!res.ok) throw new Error(`http ${res.status}`)
        const blob = await res.blob()
        zip.file(path, blob)
      } catch {
        failed += 1
      }
      done += 1
      opts.onProgress?.({ done, total, failed })
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()))

  if (done - failed <= 0) {
    toast.error('文件都没能下载成功, 请稍后重试')
    return failed
  }

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const blob = await zip.generateAsync({ type: 'blob' })
  triggerBlobDownload(blob, `dangoo-产物-${stamp}.zip`)
  return failed
}

export { formatBytes }
