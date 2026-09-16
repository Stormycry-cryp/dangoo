import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { useCanvas } from '@/pages/Canvas/useCanvas'

type CanvasVm = ReturnType<typeof useCanvas>

/**
 * 图片批量高额二次确认: 框选批量运行时, 仅图片任务总额超过阈值才弹出。
 * 视频任务不计入拦截, 但若本批混有视频会在副文案里提示。点「确认运行」才真正开跑, 取消/遮罩/Esc 放弃。
 */
export function BatchImageConfirmDialog({ p }: { p: CanvasVm }) {
  const data = p.batchConfirm
  const open = !!data

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.cancelBatchImageConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, p])

  if (!data) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={() => p.cancelBatchImageConfirm()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="确认批量运行"
        className="w-[min(420px,92vw)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3 px-5 pb-4 pt-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <AlertTriangle className="h-5 w-5 text-primary" />
          </span>
          <h2 className="text-base font-semibold text-foreground">本次图片花费较高</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            将批量生成 <span className="font-medium text-foreground">{data.imageCount}</span> 张图片,
            预计共扣 <span className="font-semibold text-primary">¥{data.imageTotal.toFixed(2)}</span>
            {data.hasVideo ? '; 本批还包含视频任务, 视频费用另计' : ''}。
          </p>
          <p className="text-xs text-muted-foreground">
            超过 ¥{p.BATCH_IMAGE_CONFIRM_LIMIT.toFixed(0)} 的图片批量任务需要再次确认, 确认后立即开始运行。
          </p>
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => p.cancelBatchImageConfirm()}
            className="h-9 flex-1 rounded-lg border border-border text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => p.confirmBatchImageRun()}
            className="h-9 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            确认运行
          </button>
        </div>
      </div>
    </div>
  )
}
