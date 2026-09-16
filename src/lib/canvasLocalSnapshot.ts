/**
 * 画布本地兜底快照(IndexedDB):
 * 每笔云端保存在发送前把当时最新全量快照写一份到本地, 云端确认成功后删除。
 * 浏览器崩溃 / 强杀进程 / 断网关机时, 防抖窗口与在途失败的内容仍能在下次打开时恢复。
 * 所有方法永不抛错——本地库不可用(隐私模式 / 配额满)时静默失败, 不影响内存与云端链路。
 */

export interface LocalCanvasSnapshot {
  /** 快照所基于的服务端版本号, 恢复时用于判断云端是否已被别处更新 */
  rev: number
  title: string
  /** 与 PATCH 全量体一致的画布文档(cards/connections/view/pendingJobs/projectAssets/logs) */
  doc: Record<string, unknown>
  savedAt: number
  /** 写下这份快照的浏览器会话标识, 启动恢复时用来识别「本会话之前的标签页」 */
  sessionId: string
}

const DB_NAME = 'vibex-canvas'
const DB_VERSION = 1
const STORE_SNAPSHOTS = 'local_snapshots'
const STORE_BACKUPS = 'conflict_backups'
const SNAPSHOT_TTL_MS = 14 * 24 * 60 * 60 * 1000

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase | null>(resolve => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) db.createObjectStore(STORE_SNAPSHOTS)
      if (!db.objectStoreNames.contains(STORE_BACKUPS)) db.createObjectStore(STORE_BACKUPS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    // 个别浏览器隐私模式下 open 直接阻塞/拒绝, 兜底
    setTimeout(() => resolve(null), 2500)
  }).then(db => {
    // onsuccess 与超时兜底可能竞态: 只认第一个 resolve, 这里不重复处理
    return db
  })
  return dbPromise
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(db => new Promise<T | null>(resolve => {
    if (!db) {
      resolve(null)
      return
    }
    let t: IDBTransaction
    try {
      t = db.transaction(storeName, mode)
    } catch {
      resolve(null)
      return
    }
    let req: IDBRequest<T>
    try {
      req = fn(t.objectStore(storeName))
    } catch {
      resolve(null)
      return
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    // 事务异常(配额满等)同样走 null, 不阻塞主流程
    t.onerror = () => resolve(null)
    t.onabort = () => resolve(null)
  }))
}

function key(canvasId: string, sessionId: string) {
  return `${canvasId}::${sessionId}`
}

/** 以事务完成为准执行一次写操作(put/delete 的 result 恒为 undefined, 不能拿它判断成败) */
function txDone(storeName: string, run: (store: IDBObjectStore) => void): Promise<boolean> {
  return openDb().then(db => new Promise<boolean>(resolve => {
    if (!db) {
      resolve(false)
      return
    }
    let t: IDBTransaction
    try {
      t = db.transaction(storeName, 'readwrite')
    } catch {
      resolve(false)
      return
    }
    try {
      run(t.objectStore(storeName))
    } catch {
      resolve(false)
      return
    }
    t.oncomplete = () => resolve(true)
    t.onerror = () => resolve(false)
    t.onabort = () => resolve(false)
  }))
}

/** 写下/覆盖一份待同步快照; 返回是否真正落盘(失败时保存状态不能显示「本地已存」) */
export function putLocalSnapshot(canvasId: string, sessionId: string, snap: LocalCanvasSnapshot): Promise<boolean> {
  return txDone(STORE_SNAPSHOTS, store => store.put(snap, key(canvasId, sessionId)))
}

/** 云端确认保存成功后清掉这份快照 */
export function clearLocalSnapshot(canvasId: string, sessionId: string): Promise<void> {
  return tx(STORE_SNAPSHOTS, 'readwrite', store => store.delete(key(canvasId, sessionId))).then(() => undefined)
}

/** 某个画布里、非当前会话留下的快照(崩溃/异常关闭的标签页才有), 含主键解析出的会话标识 */
export interface StaleSnapshot extends LocalCanvasSnapshot {
  originSessionId: string
}

export async function listStaleSnapshots(canvasId: string, currentSessionId: string): Promise<StaleSnapshot[]> {
  const db = await openDb()
  if (!db) return []
  const all = await new Promise<IDBValidKey[]>(resolve => {
    let t: IDBTransaction
    try {
      t = db.transaction(STORE_SNAPSHOTS, 'readonly')
    } catch {
      resolve([])
      return
    }
    const req = t.objectStore(STORE_SNAPSHOTS).getAllKeys()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror = () => resolve([])
  })
  const prefix = `${canvasId}::`
  const out: StaleSnapshot[] = []
  for (const k of all) {
    const ks = String(k)
    if (!ks.startsWith(prefix)) continue
    const originSessionId = ks.slice(prefix.length)
    if (originSessionId === currentSessionId) continue
    const snap = await tx<LocalCanvasSnapshot>(STORE_SNAPSHOTS, 'readonly', store => store.get(k))
    if (snap && typeof snap.savedAt === 'number') out.push({ ...snap, originSessionId })
  }
  // 最近写入的优先(极端情况下同一画布有多个崩溃标签页的快照)
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

export function deleteStaleSnapshot(canvasId: string, originSessionId: string): Promise<void> {
  return tx(STORE_SNAPSHOTS, 'readwrite', store => store.delete(key(canvasId, originSessionId))).then(() => undefined)
}

/** 启动时顺手清掉超过保留期的快照, 防止长期占空间 */
export async function pruneExpiredSnapshots(now: number): Promise<void> {
  const db = await openDb()
  if (!db) return
  const keys = await new Promise<IDBValidKey[]>(resolve => {
    let t: IDBTransaction
    try {
      t = db.transaction(STORE_SNAPSHOTS, 'readonly')
    } catch {
      resolve([])
      return
    }
    const req = t.objectStore(STORE_SNAPSHOTS).getAllKeys()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror = () => resolve([])
  })
  for (const k of keys) {
    const snap = await tx<LocalCanvasSnapshot>(STORE_SNAPSHOTS, 'readonly', store => store.get(k))
    if (snap && now - snap.savedAt > SNAPSHOT_TTL_MS) {
      await tx(STORE_SNAPSHOTS, 'readwrite', store => store.delete(k))
    }
  }
}

/* ---------------- 冲突选择撤销备份(只保留最近一次) ---------------- */

export interface ConflictBackup extends LocalCanvasSnapshot {
  serverRev: number
  backedAt: number
}

export function putConflictBackup(canvasId: string, backup: ConflictBackup): Promise<void> {
  return tx(STORE_BACKUPS, 'readwrite', store => store.put(backup, canvasId)).then(() => undefined)
}

export function takeConflictBackup(canvasId: string): Promise<ConflictBackup | null> {
  return tx<ConflictBackup>(STORE_BACKUPS, 'readwrite', store => {
    const getReq = store.get(canvasId)
    getReq.onsuccess = () => {
      if (getReq.result) store.delete(canvasId)
    }
    return getReq
  })
}

/* ---------------- 内容指纹: 启动时判断陈旧快照是否真有不同于云端的改动 ---------------- */

function fingerprintValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (Array.isArray(v)) return '[' + v.map(fingerprintValue).join(',') + ']'
    const obj = v as Record<string, unknown>
    return '{' + Object.keys(obj).sort().map(k => `${k}:${fingerprintValue(obj[k])}`).join(',') + '}'
  }
  return String(v)
}

/** 只比对用户内容(卡片/连线/标题/视角); 任务队列/日志等瞬态字段不参与, 避免无谓打扰 */
export function canvasContentFingerprint(part: {
  title?: string
  doc?: Record<string, unknown>
  cards?: unknown
  connections?: unknown
  view?: unknown
}): string {
  const doc = (part.doc ?? part) as Record<string, unknown>
  return fingerprintValue({
    t: part.title ?? '',
    c: doc.cards ?? part.cards ?? [],
    n: doc.connections ?? part.connections ?? [],
    v: doc.view ?? part.view ?? null,
  })
}
