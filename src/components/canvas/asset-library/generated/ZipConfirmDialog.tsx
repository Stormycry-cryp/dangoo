import { AlertTriangle, Loader2 } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { formatBytes, ZIP_COUNT_LIMIT, ZIP_SIZE_LIMIT_BYTES } from './assetDownload'

/** 超量打包(>200 个 或 预估 >2GB)前的耗时/流量确认 */
export function ZipConfirmDialog({
  open,
  count,
  estimatedBytes,
  estimating,
  onCancel,
  onConfirm,
}: {
  open: boolean
  count: number
  estimatedBytes: number | null
  onCancel: () => void
  onConfirm: () => void
  estimating: boolean
}) {
  const overCount = count > ZIP_COUNT_LIMIT
  const overSize = !!estimatedBytes && estimatedBytes > ZIP_SIZE_LIMIT_BYTES
  return (
    <Dialog open={open} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="w-[min(400px,92vw)] gap-4 border-border bg-card p-5 sm:rounded-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-card-foreground">打包文件较多</h3>
            <p className="text-xs leading-5 text-muted-foreground">
              这次共 {count} 个文件
              {estimatedBytes ? `, 预估约 ${formatBytes(estimatedBytes)}` : ''}
              {overCount ? `, 超过建议的 ${ZIP_COUNT_LIMIT} 个` : ''}
              {overSize ? ', 预估体积较大' : ''}
              。所有文件都要先下载到浏览器再压缩, 可能需要较长时间并消耗较多网络流量, 确认继续吗?
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            再想想
          </button>
          <button
            type="button"
            disabled={estimating}
            onClick={onConfirm}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {estimating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            继续打包
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
