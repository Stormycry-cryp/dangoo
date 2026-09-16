import { useEffect } from 'react'
import { HardDriveDownload, RefreshCw, Cloud, Clock } from 'lucide-react'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

function formatTime(ts: number): string {
  try {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

/**
 * 崩溃恢复弹窗: 上次浏览器被强杀/崩溃/断网关机后, 本机留有未同步到云端的快照。
 * 三个选择: 恢复我的改动(覆盖云端) / 以云端为准(丢弃) / 暂不决定(快照继续留在本机)。
 */
export function LocalRestoreDialog({ p }: { p: CanvasVm }) {
  const data = p.localRestore
  const open = !!data

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!data) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="恢复未保存的改动"
        className="w-[min(480px,92vw)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex flex-col items-center gap-3 px-5 pb-4 pt-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <HardDriveDownload className="h-5 w-5 text-primary" />
          </span>
          <h2 className="text-base font-semibold text-foreground">检测到上次有未同步的改动</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            这个画布上次关闭前有内容只保存在了本机，还没来得及同步到云端
            {data.snapshot.savedAt ? `（本地保存时间：${formatTime(data.snapshot.savedAt)}）` : ''}
            。要恢复这些改动吗？
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => p.acceptLocalRestore()}
            className="flex items-center gap-3 rounded-lg border border-primary/50 bg-primary/10 px-3 py-2.5 text-left transition-colors hover:bg-primary/20"
          >
            <HardDriveDownload className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">恢复我的改动</span>
              <span className="text-xs text-muted-foreground">用本机这份内容覆盖云端版本并立即同步</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => void p.discardLocalRestore()}
            className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-secondary"
          >
            <Cloud className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">以云端版本为准</span>
              <span className="text-xs text-muted-foreground">丢弃本机未同步的内容，打开云端最新版</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => p.deferLocalRestore()}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span className="flex flex-col">
              <span className="text-sm">暂不决定</span>
              <span className="text-xs">快照继续留在本机，下次打开再选择</span>
            </span>
          </button>
        </div>
        <div className="flex items-center justify-center gap-1 border-t border-border bg-muted/30 px-5 py-2 text-[11px] text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          若不确定，建议先选「恢复我的改动」，打开后仍可撤回
        </div>
      </div>
    </div>
  )
}
