// 画布媒体持久化: 展示用永久链接(本应用文件存储), 提交 AI 任务前再换取平台临时链接。
// 平台上传返回的 COS 签名链接 24 小时过期, 隔天画布会全部裂图; 永久链接不过期。
import { getPocketBaseUrl } from './pb'
import { getAuthHeaders } from './auth'

/** 判断是否为本应用持久存储的永久链接(无论是否带 __pb 前缀) */
export function isPersistedMediaUrl(url: string | undefined | null): boolean {
  return !!url && url.indexOf('/api/files/media_files/') >= 0
}

/**
 * 平台 AI「成品输出」的永久公开对象地址: rh-images.xiaoyaoyou.com/<hash>/output/...
 * (图片 <uuid>.png、音频 output/audio/*.mp3、视频 output/video/* 都在此前缀下)。
 * 实测无签名参数、长期公开可访问(生成 7 天后仍 200), 比应用本地文件存储更可靠,
 * 绝不能再转存到会随环境重置丢失的本地存储。注意与输入上传的临时签名链区分:
 * 输入链是 rh-images-switch-*.myqcloud.com/input/openapi/<hash>.png?q-sign-...(约 24h 后 403)。
 */
export function isDurableOutputMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false
  return /^https?:\/\/rh-images\.xiaoyaoyou\.com\/[0-9a-f]+\/output\//i.test(url)
}

/** @deprecated 改用 isDurableOutputMediaUrl(图片/音频/视频成品共用同一永久前缀) */
export function isDurableOutputImageUrl(url: string | undefined | null): boolean {
  return isDurableOutputMediaUrl(url)
}

/**
 * 平台临时签名链接(输入上传链): 带 q-sign-* 签名, 约 24h 后 403, 必须在有效期内转存。
 * 形态: https://rh-images-switch-*.cos.*.myqcloud.com/input/openapi/<hash>.<ext>?q-sign-algorithm=...
 */
export function isTemporarySignedMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false
  return /^https?:\/\/[^/]*myqcloud\.com\//i.test(url) && /[?&]q-sign-/.test(url)
}

/**
 * 归一化媒体路径: 剥掉任何历史部署前缀, 得到与环境无关的裸路径("/api/files/...")。
 * 旧数据把生成时的部署形态(/app-preview/app-xxx/__pb 或 /p/app-xxx/__pb)固化进了 URL,
 * 切到另一种部署(预览↔发布)后前缀对不上会整批 404; 这里统一剥到裸路径, 渲染时再按当前环境拼。
 */
export function canonicalMediaPath(url: string): string {
  // 匹配任意部署形态前缀: /app-preview/app-<32hex>/__pb 或 /p/app-<32hex>/__pb
  return url.replace(/^\/(?:app-preview|p)\/app-[0-9a-f]{32}\/__pb(?=\/)/, '')
}

/**
 * 渲染用地址: 永久文件在库里存环境无关的裸 "/api/files/..." 路径,
 * 读取时按当前部署补上接口前缀; 历史数据若固化了旧部署前缀也先剥掉再拼, 实现跨环境自愈。
 * blob:/data:/http(s) 链接原样返回。图片/视频 <src> 一律过这个函数。
 */
export function mediaSrc(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('blob:') || url.startsWith('data:') || /^https?:\/\//i.test(url)) return url
  const bare = canonicalMediaPath(url)
  if (bare.startsWith('/api/files/')) return `${getPocketBaseUrl()}${bare}`
  return url
}

/**
 * 永久链接 -> 平台临时上传链接(提交 AIGC/LLM 任务时用)。
 * - 永久链接: 经后端路由转发平台换取临时链接(后端同时持有文件与凭证, 绕开跨域)。
 * - 已是平台/其它 http(s) 链接: 原样透传(老数据的临时链接, 若已过期会在上游报错)。
 * 并发去重: 同一 URL 同时被多张图引用时只换一次。
 */
const rhUrlInflight = new Map<string, Promise<string>>()

export async function toRhMediaUrl(url: string): Promise<string> {
  if (!isPersistedMediaUrl(url)) return url
  const hit = rhUrlInflight.get(url)
  if (hit) return hit
  const p = (async () => {
    // 发给后端时剥成裸路径再补当前环境前缀(库里存的是环境无关裸路径)
    const bare = canonicalMediaPath(url)
    const res = await fetch(`${getPocketBaseUrl()}/api/media/rh-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ url: bare }),
    })
    if (!res.ok) throw new Error(`media rh-url failed: HTTP ${res.status}`)
    const data = await res.json()
    const out = data?.url
    if (!out) throw new Error('media rh-url bad response')
    return String(out)
  })().finally(() => {
    rhUrlInflight.delete(url)
  })
  rhUrlInflight.set(url, p)
  return p
}

/** 批量把图片链接转成平台临时链接(并发), 顺序保持一致; 单张失败不阻塞, 回退原链接 */
export async function toRhMediaUrls(urls: string[]): Promise<string[]> {
  return Promise.all(
    urls.map(async u => {
      try {
        return await toRhMediaUrl(u)
      } catch {
        return u
      }
    }),
  )
}

/**
 * 浏览器端上传前压缩照片: 手机原图常 5~15MB, 原样穿过网关到后端要十几秒(卡在转圈)。
 * 画布展示与图生图参考位最长边 2048 完全够用, JPEG 质量 0.88 肉眼无损,
 * 体积通常降到 0.5~1MB, 上传秒级。
 * 不压缩: PNG/WEBP(截图/透明素材需保真)、GIF(动图)、很小的图、解码失败的图(回退原图)。
 */
const UPLOAD_IMAGE_MAX_EDGE = 2048
const UPLOAD_JPEG_QUALITY = 0.88

export async function compressImageForUpload(file: File | Blob): Promise<File | Blob> {
  const isFile = file instanceof File
  const type = isFile ? file.type : file.type
  if (type !== 'image/jpeg' && !(isFile && /\.jpe?g$/i.test((file as File).name))) return file
  // 已经够小就不压(浏览器解码大图本身有成本, 小图没必要)
  if (file.size <= 900 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const longEdge = Math.max(width, height)
    if (longEdge <= UPLOAD_IMAGE_MAX_EDGE) {
      bitmap.close?.()
      return file
    }
    const scale = UPLOAD_IMAGE_MAX_EDGE / longEdge
    const targetW = Math.max(1, Math.round(width * scale))
    const targetH = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY))
    // 压缩异常或反而更大时回退原图
    if (!blob || blob.size <= 0 || blob.size >= file.size) return file
    if (isFile) {
      const name = (file as File).name.replace(/\.jpe?g$/i, '.jpg') || 'image.jpg'
      return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
    }
    return new Blob([blob], { type: 'image/jpeg' })
  } catch {
    // 解码器不支持等任何异常: 原样上传, 不因压缩阻断导入
    return file
  }
}

/**
 * 正在传输中的文件上传数(压缩+网络整体时间)。画布据此在「上传未完成就要关页」时拦截提醒:
 * 全新卡首传若在拿到永久链接前被终止, 落库的只会是无图骨架, 图必丢; 已有图替换则有旧值兜底。
 * 只暴露读取, 计数在 persistMedia 内部维护, 所有上传点(含编辑产物/素材库)自动纳入。
 */
let mediaUploadInflight = 0
export function getMediaUploadInflight(): number {
  return mediaUploadInflight
}

/**
 * 上传文件到应用持久存储, 返回永久链接(可直接放进 <img src> 的完整地址)。
 * 用于画布/素材库等需要长期展示的图片; 提交 AI 任务时由 toRhMediaUrl 现换临时链接。
 * jpeg 图片默认先做上传前压缩(大图秒传); 需要原图保真(裁剪导出等)传 compress=false。
 */
export async function persistMedia(file: File | Blob, fileType = 'image', compress = true): Promise<string> {
  mediaUploadInflight += 1
  try {
    let payload = file
    if (compress && fileType === 'image') {
      payload = await compressImageForUpload(file)
    }
    const form = new FormData()
    form.append('file', payload)
    form.append('fileType', fileType)
    const res = await fetch(`${getPocketBaseUrl()}/api/media/persist`, {
      method: 'POST',
      credentials: 'include',
      // FormData 时不要手动设 Content-Type（浏览器要带 boundary）；仅补登录凭证
      headers: { ...getAuthHeaders() },
      body: form,
    })
    if (res.status === 412 || res.status === 401) {
      throw Object.assign(new Error('login_required'), { status: 412 })
    }
    if (!res.ok) throw new Error(`media persist failed: HTTP ${res.status}`)
    const data = await res.json().catch(() => null)
    const url = data?.url
    if (!url) throw new Error('media persist bad response')
    // 存环境无关的裸路径("/api/files/..."), 不带部署前缀; 渲染时由 mediaSrc 按当前环境拼
    return canonicalMediaPath(String(url))
  } finally {
    mediaUploadInflight = Math.max(0, mediaUploadInflight - 1)
  }
}
