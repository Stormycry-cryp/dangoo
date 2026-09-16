// 项目导出/导入打包: zip = project.json(画布结构) + files/(全部缩略图与原图文件)。
// 缩略图只负责首页画布占位显示; 原图(画布里引用的图片/视频)一并打包, 保证导出件自包含。
// 导入时把包内文件重新上传到当前环境的持久存储并回写链接, 跨环境导入也不裂图。
import JSZip from "jszip"
import { mediaSrc, persistMedia } from "./media"

export interface PackedCanvas {
  title: string
  thumbnail_url: string
  canvas_data: unknown
}

export interface ProjectExportFile {
  app: string
  version: number
  exportedAt: string
  canvases: PackedCanvas[]
  /** url -> zip 内文件路径 的清单; v1 老导出文件没有该字段 */
  files?: Array<{ url: string; path: string }>
}

export interface PackProgress {
  done: number
  total: number
}

/** 单个媒体文件打包上限(与视频转存上限一致), 超过则保留链接不打包(防 zip 过大卡死浏览器) */
const MAX_FILE_BYTES = 60 * 1024 * 1024
const FETCH_CONCURRENCY = 4
/** 外链/包内媒体转存的并发批大小(分批 Promise.all, 每批 4 个) */
const REHOST_CONCURRENCY = 4
/** 转存时视频/音频单文件上限(与画布侧持久化口径一致), 超过计为失败并保留原链接 */
const REHOST_VIDEO_MAX_BYTES = 60 * 1024 * 1024
const REHOST_AUDIO_MAX_BYTES = 30 * 1024 * 1024

function isMediaUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("/api/files/")
}

/** 深度遍历画布数据, 收集所有图片/视频链接 */
function collectMediaUrls(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    if (isMediaUrl(value)) out.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMediaUrls(item, out)
    return
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectMediaUrls(item, out)
  }
}

/** 从 URL 里取一个安全的文件基名 */
function basenameOf(url: string): string {
  const tail =
    url.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() ?? "media"
  const safe = tail.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60)
  return safe || "media"
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
  }
  return map[mime] ?? ""
}

function isVideoName(name: string): boolean {
  return /\.(mp4|webm|mov|m4v)$/i.test(name)
}

function isAudioName(name: string): boolean {
  return /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name)
}

/**
 * 按 blob 内容类型优先、URL/文件名后缀兜底, 判断媒体类型。
 * 音频优先判定(后缀 m4a 与视频 m4v 互不重叠), 无法识别返回 null。
 */
function classifyMedia(blob: Blob, name: string): "image" | "video" | "audio" | null {
  const type = blob.type || ""
  if (type.startsWith("audio/") || isAudioName(name)) return "audio"
  if (type.startsWith("video/") || isVideoName(name)) return "video"
  if (type.startsWith("image/")) return "image"
  // blob 无内容类型(部分跨域响应)时只能靠后缀; 既无类型又无已知后缀则放弃
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) return "image"
  return null
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** 兼容 v1 JSON 导出文件与 v2 zip 内 project.json 的画布提取 */
export function extractExportedCanvases(parsed: unknown): PackedCanvas[] {
  if (Array.isArray(parsed)) return parsed as PackedCanvas[]
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as ProjectExportFile).canvases)
  ) {
    return (parsed as ProjectExportFile).canvases
  }
  return []
}

/**
 * 打包导出: 下载所有画布引用的媒体文件(缩略图 + 原图)与画布结构, 生成 zip Blob。
 * 单个文件下载失败/超限不阻塞, 导入时回退用原链接。
 */
export async function buildProjectZip(
  canvases: PackedCanvas[],
  onProgress?: (p: PackProgress) => void,
): Promise<Blob> {
  const urls = new Set<string>()
  for (const c of canvases) {
    if (typeof c.thumbnail_url === "string" && c.thumbnail_url) {
      urls.add(c.thumbnail_url)
    }
    collectMediaUrls(c.canvas_data, urls)
  }
  const pending = [...urls]
  const zip = new JSZip()
  const manifest: Array<{ url: string; path: string }> = []
  let done = 0
  let issued = 0

  async function worker(): Promise<void> {
    for (;;) {
      const url = pending.shift()
      if (!url) return
      issued += 1
      const seq = issued
      try {
        const res = await fetch(mediaSrc(url) ?? url)
        if (res.ok) {
          const blob = await res.blob()
          if (blob.size > 0 && blob.size <= MAX_FILE_BYTES) {
            let name = basenameOf(url)
            if (!name.includes(".")) name += extFromMime(blob.type)
            const path = `files/${String(seq).padStart(4, "0")}-${name}`
            zip.file(path, blob)
            manifest.push({ url, path })
          }
        }
      } catch {
        /* 跨域或失效链接: 不打包, 导入时回退原链接 */
      }
      done += 1
      onProgress?.({ done, total: urls.size })
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, pending.length || 1) }, worker),
  )

  const payload: ProjectExportFile = {
    app: "infinite-canvas-workbench",
    version: 2,
    exportedAt: new Date().toISOString(),
    canvases,
    files: manifest,
  }
  zip.file("project.json", JSON.stringify(payload, null, 2))
  return zip.generateAsync({ type: "blob" })
}

/** 深度替换画布数据里命中映射表的链接 */
function replaceUrlsDeep(value: unknown, urlMap: Map<string, string>): unknown {
  if (typeof value === "string") return urlMap.get(value) ?? value
  if (Array.isArray(value)) return value.map((v) => replaceUrlsDeep(v, urlMap))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = replaceUrlsDeep(v, urlMap)
    return out
  }
  return value
}

/**
 * 媒体转存共享引擎: 对 urls 逐个取 blob(由 resolveBlob 决定来源: zip 条目或外链 fetch)、
 * 判定类型、persistMedia 到当前环境持久存储, 成功的链接进 urlMap。
 * 分批并发(每批 4 个); 单个链接失败(未登录/非 2xx/超限/超时)只累计 failedCount, 不阻断整体。
 * resolveBlob 返回 null 表示该链接对应的源文件不存在(如 zip 缺条目), 静默跳过、不计失败。
 */
async function rehostMedia(
  urls: string[],
  resolveBlob: (url: string) => Promise<{ blob: Blob; name: string } | null>,
  onProgress?: (p: PackProgress) => void,
): Promise<{ urlMap: Map<string, string>; failedCount: number }> {
  const urlMap = new Map<string, string>()
  let failedCount = 0
  let done = 0
  const total = urls.length

  async function rehostOne(url: string): Promise<void> {
    try {
      const source = await resolveBlob(url)
      if (source) {
        const { blob, name } = source
        if (!blob.size) {
          failedCount += 1
          return
        }
        const kind = classifyMedia(blob, name)
        if (!kind) {
          failedCount += 1
          return
        }
        if (kind === "video" && blob.size > REHOST_VIDEO_MAX_BYTES) {
          failedCount += 1
          return
        }
        if (kind === "audio" && blob.size > REHOST_AUDIO_MAX_BYTES) {
          failedCount += 1
          return
        }
        const fresh = await persistMedia(new File([blob], name, { type: blob.type }), kind)
        if (fresh) urlMap.set(url, fresh)
        else failedCount += 1
      }
    } catch {
      /* 单个链接失败(未登录/超时/非 2xx/持久化拒绝): 保留原链接 */
      failedCount += 1
    } finally {
      done += 1
      onProgress?.({ done, total })
    }
  }

  for (let i = 0; i < urls.length; i += REHOST_CONCURRENCY) {
    await Promise.all(urls.slice(i, i + REHOST_CONCURRENCY).map(rehostOne))
  }
  return { urlMap, failedCount }
}

export interface RehostResult {
  canvases: PackedCanvas[]
  failedCount: number
}

/**
 * 老版 JSON 导入用: 收集每个画布(含缩略图与画布数据)里的 http(s) 外链并转存到当前环境,
 * 成功的用永久链接整体回写。已属于本应用 /api/files/ 的永久链接与 data:/blob: 直接跳过。
 * 单个链接失败不阻断, 累计 failedCount 返回, 由调用方决定是否提示。
 */
export async function rehostExternalMedia(
  canvases: PackedCanvas[],
  onProgress?: (p: PackProgress) => void,
): Promise<RehostResult> {
  const urls = new Set<string>()
  for (const c of canvases) {
    if (typeof c.thumbnail_url === "string" && /^https?:\/\//i.test(c.thumbnail_url)) {
      urls.add(c.thumbnail_url)
    }
    collectMediaUrls(c.canvas_data, urls)
  }
  // collectMediaUrls 会把本应用 /api/files/ 相对链接也收进来; 只转存外部 http(s) 链接
  const external = [...urls].filter((u) => /^https?:\/\//i.test(u))

  const { urlMap, failedCount } = await rehostMedia(
    external,
    async (url) => {
      const res = await fetch(url, { mode: "cors" })
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
      const blob = await res.blob()
      let name = basenameOf(url)
      if (!name.includes(".")) {
        const ext = extFromMime(blob.type)
        if (ext) name += ext
      }
      return { blob, name }
    },
    onProgress,
  )

  if (!urlMap.size) return { canvases, failedCount }
  const rewritten = canvases.map((c) => ({
    ...c,
    thumbnail_url:
      typeof c.thumbnail_url === "string"
        ? (urlMap.get(c.thumbnail_url) ?? c.thumbnail_url)
        : c.thumbnail_url,
    canvas_data: replaceUrlsDeep(c.canvas_data, urlMap),
  }))
  return { canvases: rewritten, failedCount }
}

/**
 * 解包导入: 读 zip 内 project.json, 把包内媒体文件重新上传到当前环境持久存储,
 * 并把画布数据里的旧链接整体换成新链接; 缺文件/上传失败的回退原链接。
 */
export async function unpackProjectZip(
  file: File,
  onProgress?: (p: PackProgress) => void,
): Promise<PackedCanvas[]> {
  const zip = await JSZip.loadAsync(file)
  const jsonEntry = zip.file("project.json")
  if (!jsonEntry) throw new SyntaxError("压缩包里没有项目文件")

  // 路径遍历防护: 目录和文件条目都要检查, 含 ".." 路径段或以 "/" 开头的绝对路径一律拒绝。
  for (const entryName of Object.keys(zip.files)) {
    if (
      entryName.startsWith("/") ||
      entryName.split("/").includes("..")
    ) {
      throw new SyntaxError("压缩包含非法路径, 已拒绝导入")
    }
  }

  // 解压炸弹防护: 限制条目数与各文件声明的原始大小总和, 超过直接拒绝, 避免把浏览器内存撑爆。
  // zipEntries 只含文件(目录的 dir=true 跳过); JSZipObject.size 为该条目未压缩字节数(公开字段)。
  const zipEntries = Object.values(zip.files).filter((entry) => !entry.dir)
  const MAX_ZIP_ENTRIES = 4000
  const MAX_ZIP_TOTAL = 300 * 1024 * 1024
  const MAX_ZIP_ENTRY = 64 * 1024 * 1024
  if (zipEntries.length > MAX_ZIP_ENTRIES) {
    throw new SyntaxError("压缩包内容过多, 已超过可导入上限")
  }
  let declaredTotal = 0
  for (const entry of zipEntries) {
    // 旧版 @types/jszip 未在 JSZipObject 上暴露 size/uncompressedSize, 用最小结构断言读取。
    const meta = entry as unknown as { size?: number; _data?: { uncompressedSize?: number } }
    const uncompressed = Number(meta.size ?? meta._data?.uncompressedSize ?? 0)
    if (uncompressed > MAX_ZIP_ENTRY) {
      throw new SyntaxError("压缩包内单个文件过大（上限 64MB）")
    }
    declaredTotal += uncompressed
    if (declaredTotal > MAX_ZIP_TOTAL) {
      throw new SyntaxError("压缩包解压后体积过大, 已拒绝导入")
    }
  }
  // 压缩比炸弹防护: 原始文件 >= 1MB 且声明未压缩总量超出其 100 倍, 视为异常压缩包。
  if (file.size >= 1024 * 1024 && declaredTotal / file.size > 100) {
    throw new SyntaxError("压缩包压缩比异常, 已拒绝导入")
  }

  const parsed: unknown = JSON.parse(await jsonEntry.async("string"))
  const canvases = extractExportedCanvases(parsed)
  const manifest =
    parsed && typeof parsed === "object" && Array.isArray((parsed as ProjectExportFile).files)
      ? (parsed as ProjectExportFile).files!.filter(
          (m) => m && typeof m.url === "string" && typeof m.path === "string",
        )
      : []
  if (!canvases.length || !manifest.length) return canvases

  const pathByUrl = new Map(manifest.map((m) => [m.url, m.path]))
  const { urlMap } = await rehostMedia(
    [...pathByUrl.keys()],
    async (url) => {
      const path = pathByUrl.get(url)
      if (!path) return null
      const entry = zip.file(path)
      if (!entry) return null // zip 缺条目: 与旧行为一致, 静默跳过
      const blob = await entry.async("blob")
      return { blob, name: basenameOf(path) }
    },
    onProgress,
  )
  if (!urlMap.size) return canvases

  return canvases.map((c) => ({
    ...c,
    thumbnail_url:
      typeof c.thumbnail_url === "string"
        ? (urlMap.get(c.thumbnail_url) ?? c.thumbnail_url)
        : c.thumbnail_url,
    canvas_data: replaceUrlsDeep(c.canvas_data, urlMap),
  }))
}

export function downloadProjectBlob(blob: Blob, filename: string): void {
  downloadBlob(blob, filename)
}
