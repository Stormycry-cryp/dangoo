/**
 * 通知拉取协调器(模块级, 跨组件/跨标签共享):
 *  - 所有铃铛组件订阅同一个数据源, 刷新结果广播给每个标签页;
 *  - 45s 冷却 + storage 时间戳跨标签节流: 同浏览器开多个标签/画布也只会有一个标签真正请求;
 *  - 429(网关限流)时指数退避冷却, 期间所有调用直接跳过;
 *  - 标已读后可 force 跳过冷却立即拉取。
 */
import { fetchNotifications, type NotificationItem } from '@/lib/wallet'

export interface NotificationsData {
  items: NotificationItem[]
  unread: number
}

type Listener = (d: NotificationsData) => void

const COOLDOWN_MS = 45_000
const STORAGE_LAST_KEY = 'rh-notif-last-fetch'
const STORAGE_DATA_KEY = 'rh-notif-data'
const STORAGE_EVENT = 'rh-notif-updated'
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000]

let inflight = false
let retryStep = 0
let lastFetchAt = 0
let latest: NotificationsData = { items: [], unread: 0 }
const listeners = new Set<Listener>()

function nowTs(): number {
  return Date.now()
}

function readStorageTs(key: string): number {
  try {
    return Number(localStorage.getItem(key) || 0) || 0
  } catch {
    return 0
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 隐私模式等忽略 */
  }
}

/** 模块加载即读一次其它标签缓存的数据, 新挂载的铃铛不用等首个请求也有未读数 */
function seedFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_DATA_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as NotificationsData
    if (Array.isArray(parsed.items)) latest = parsed
  } catch {
    /* 忽略损坏缓存 */
  }
}
seedFromStorage()

async function doFetch(): Promise<void> {
  if (inflight) return
  inflight = true
  try {
    const d = await fetchNotifications()
    retryStep = 0
    latest = { items: d.items, unread: d.unread }
    lastFetchAt = nowTs()
    writeStorage(STORAGE_LAST_KEY, String(lastFetchAt))
    writeStorage(STORAGE_DATA_KEY, JSON.stringify(latest))
    listeners.forEach(l => l(latest))
    // 通知同浏览器其它标签: 用自己的事件名, 避免直接监听 storage 事件的数据写入抖动
    try {
      localStorage.setItem(STORAGE_EVENT, String(lastFetchAt))
      localStorage.removeItem(STORAGE_EVENT)
    } catch {
      /* ignore */
    }
  } catch (e) {
    const status = (e as { status?: number } | null)?.status
    if (status === 429) {
      // 被限流: 下一次允许请求的时间推迟到退避窗口之后, 轮询/切前台都遵守
      const delay = RETRY_DELAYS_MS[Math.min(retryStep, RETRY_DELAYS_MS.length - 1)]
      retryStep += 1
      lastFetchAt = nowTs() + delay - COOLDOWN_MS
      writeStorage(STORAGE_LAST_KEY, String(lastFetchAt))
    }
    // 其它错误(未登录/网络)不拉长冷却, 下个轮询周期自然重试
  } finally {
    inflight = false
  }
}

/** 请求一次通知; 冷却期内(含 429 退避、其它标签刚拉过)跳过。force=true 立即拉。 */
export function refreshNotifications(force = false): void {
  if (inflight) return
  const otherTabAt = readStorageTs(STORAGE_LAST_KEY)
  const gateAt = Math.max(lastFetchAt, otherTabAt)
  if (!force && gateAt && nowTs() - gateAt < COOLDOWN_MS) {
    // 冷却期内也先用缓存数据更新一次新挂载组件
    if (otherTabAt > lastFetchAt) seedFromStorage()
    return
  }
  void doFetch()
}

export function subscribeNotifications(l: Listener): () => void {
  listeners.add(l)
  l(latest)
  // 同浏览器其它标签拉到新数据: 读缓存并分发给本标签组件
  function onStorage(e: StorageEvent) {
    if (e.key !== STORAGE_EVENT) return
    seedFromStorage()
    listeners.forEach(fn => fn(latest))
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}
