/** 耗时毫秒 → 中文短文案: 1.2s / 8s / 1分05s */
export function formatRunMs(runMs: number): string {
  if (!runMs || runMs <= 0) return '—'
  const seconds = runMs / 1000
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const rest = Math.round(seconds - mins * 60)
  return `${mins}分${String(rest).padStart(2, '0')}s`
}

/** 时间戳 → MM-DD HH:mm */
export function formatLogTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 复制文本到剪贴板(剪贴板 API 不可用时走 textarea 兜底) */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到兜底方案
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
