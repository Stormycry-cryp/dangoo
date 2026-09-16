/**
 * 同浏览器多标签页画布协同广播:
 * 一个标签页把内容保存成功后通知其它标签页「云端有新版本」, 把多标签冲突从「保存时才 409」
 * 提前为打开期间即可感知。不支持 BroadcastChannel 的旧浏览器静默降级为不广播。
 */

export type CanvasBroadcastMessage =
  | { type: 'canvas-saved'; canvasId: string; rev: number; fromSession: string }
  | { type: 'canvas-editing'; canvasId: string; fromSession: string }

const CHANNEL_NAME = 'vibex-canvas-sync'

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (channel !== null) return channel
  if (typeof BroadcastChannel === 'undefined') {
    channel = null
    return null
  }
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    channel = null
  }
  return channel
}

export function postCanvasMessage(msg: CanvasBroadcastMessage): void {
  try {
    getChannel()?.postMessage(msg)
  } catch {
    // 广播失败无所谓, 保存时的乐观锁仍兜底
  }
}

export function onCanvasMessage(handler: (msg: CanvasBroadcastMessage) => void): () => void {
  const ch = getChannel()
  if (!ch) return () => {}
  const listener = (e: MessageEvent<CanvasBroadcastMessage>) => {
    if (e.data && typeof e.data === 'object') handler(e.data)
  }
  ch.addEventListener('message', listener)
  return () => ch.removeEventListener('message', listener)
}
