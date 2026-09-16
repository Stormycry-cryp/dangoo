import { CheckSquare, Loader2, PackageCheck, Save, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 多选浮现操作条: 已选 N / 全选当前结果 / 批量存入素材库 / 打包下载 / 取消 */
export function GeneratedAssetBulkBar({
  selectedCount,
  resultCount,
  saving,
  packing,
  onSelectAll,
  onSaveSelected,
  onZipSelected,
  onCancel,
}: {
  selectedCount: number
  resultCount: number
  saving: boolean
  packing: boolean
  onSelectAll: () => void
  onSaveSelected: () => void
  onZipSelected: () => void
  onCancel: () => void
}) {
  const allSelected = selectedCount >= resultCount && resultCount > 0
  const busy = saving || packing
  return (
    <div className="shrink-0 border-b border-primary/30 bg-primary/10 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="shrink-0 font-medium text-primary">已选 {selectedCount}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onSelectAll}
          disabled={allSelected || busy || resultCount === 0}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-card hover:text-primary disabled:opacity-50"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {allSelected ? '已全选' : '全选'}
        </button>
        <button
          type="button"
          onClick={onSaveSelected}
          disabled={busy}
          title="存入全局素材库, 已在库里的自动跳过"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-card hover:text-primary disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          存素材库
        </button>
        <button
          type="button"
          onClick={onZipSelected}
          disabled={busy}
          title="浏览器内打包下载 ZIP"
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {packing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
          打包下载
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={cn(
            'flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50',
          )}
          title="取消选择"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
