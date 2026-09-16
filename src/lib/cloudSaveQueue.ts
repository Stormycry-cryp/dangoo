/**
 * 跨画布云端保存并发限流:
 * 浏览器对同域名并发连接数有上限(HTTP/1.1 常见 6), 多个画布同时保存时共享同一队列,
 * 最多 MAX_CONCURRENT 个请求真正在途, 其余按入队顺序等待。单画布自身仍保证严格串行
 * (由 useCanvas 的单飞标记控制), 这里只做全局节流, 不改变顺序语义。
 */

const MAX_CONCURRENT = 2

let active = 0
const waiters: Array<() => void> = []

export function acquireCloudSlot(): Promise<() => void> {
  if (active < MAX_CONCURRENT) {
    active += 1
    return Promise.resolve(release)
  }
  return new Promise<() => void>(resolve => {
    waiters.push(() => {
      active += 1
      resolve(release)
    })
  })
}

function release() {
  active = Math.max(0, active - 1)
  const next = waiters.shift()
  if (next) next()
}

/** 卸载/切后台抢发时不想被队列卡住, 先尝试立即取槽; 拿不到也放行(浏览器会自己排队) */
export function tryAcquireCloudSlot(): () => void {
  if (active < MAX_CONCURRENT) {
    active += 1
    return release
  }
  return () => {}
}
