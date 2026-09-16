import { Loader2, X } from 'lucide-react'
import type { ZipProgress } from './assetDownload'

/** 打包期间贴在面板底部的进度浮条 */
export function ZipProgressBar({ progress, onCancel }: { progress: ZipProgress; onCancel: () => void }) {
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="shrink-0 border-t border-border bg-card px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
      <div className="flex items-center gap-2 text-xs">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="shrink-0 font-medium text-card-foreground">
          打包中 {progress.done}/{progress.total}
        </span>
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          title="取消打包(已下载的文件会丢弃)"
          className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {progress.failed > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">{progress.failed} 个文件暂时下载失败, 将跳过</p>
      )}
    </div>
  )
}
