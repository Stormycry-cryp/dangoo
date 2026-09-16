// 吞掉浏览器的良性警告「ResizeObserver loop completed with undelivered
// notifications」: 它只表示某一帧内尺寸回调又引起了尺寸变化、通知被推迟到
// 下一帧, 渲染结果不受影响(画布统一观察器在 rAF 里批量回写, 拖卡时高频触发)。
// 平台运行时会把所有 window error 收集成「运行时错误」, 故在捕获阶段最早拦掉
// 这一条; 其它任何错误都原样放行。
export function installBenignErrorGuard(): void {
  if (typeof window === 'undefined') return
  window.addEventListener(
    'error',
    event => {
      const msg = String(event.message || '')
      if (msg.includes('ResizeObserver loop')) {
        event.stopImmediatePropagation()
        event.preventDefault()
      }
    },
    true,
  )
}
