import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { useCanvas } from '@/pages/Canvas/useCanvas'
import { GenerationLogList } from './GenerationLogList'
import { GenerationLogPager } from './GenerationLogPager'
import { useGenerationLog } from './useGenerationLog'

type CanvasVm = ReturnType<typeof useCanvas>

/**
 * 生成日志弹窗: 头部标题+关闭钮 / 中部独立滚动列表 / 底部 15 条分页。
 * 点遮罩空白、右上角 X、Esc 关闭; 打开时重置到第 1 页。
 */
export function GenerationLogDialog({ p }: { p: CanvasVm }) {
  const open = p.logDialogOpen
  const { page, totalPages, pageItems, totalCount, goPrev, goNext, goPage } = useGenerationLog(p.genLogs, open)

  // Esc 关闭(与现有弹窗观感一致, 显式兜底)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.setLogDialogOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, p])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={() => p.setLogDialogOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="生成日志"
        className="flex max-h-[86vh] w-[min(860px,94vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">生成日志</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            最近 {totalCount} 条
          </span>
          <div className="flex-1" />
          <button
            type="button"
            title="关闭 (Esc)"
            onClick={() => p.setLogDialogOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* 中部列表(独立滚动) */}
        <GenerationLogList
          items={pageItems}
          onPreview={(url, mediaType) => {
            p.setPreviewMediaType(mediaType)
            p.setPreviewUrl(url)
          }}
        />

        {/* 底部分页 */}
        <GenerationLogPager
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPrev={goPrev}
          onNext={goNext}
          onGoPage={goPage}
        />
      </div>
    </div>
  )
}
